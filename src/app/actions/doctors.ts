'use server';

import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import type {
  DoctorConflictResolution,
  DoctorDuplicateMatch,
  DoctorFormInput,
  DoctorImportPreviewRow,
  DoctorImportSummary,
  DoctorRecord,
} from '@/lib/doctor-types';
import {
  deleteDoctorDocumentFile,
  createDoctorDocument,
  deleteDoctorImageFile,
  deleteDoctorDocument,
  ensureDoctorBuckets,
  ensureDoctorsSchema,
  findDoctorDuplicateMatches,
  getDoctor,
  listDoctorAuditLogs,
  listDoctors,
  resolveDoctorDuplicate,
  updateDoctorDocument,
  writeDoctorAuditLog,
  writeDoctorImportAuditLog,
  archiveDoctorDocument,
} from '@/lib/doctors-server';
import {
  normalizeDoctorCuim,
  normalizeDoctorEmail,
  normalizeDoctorFullName,
  normalizeDoctorPhone,
  sanitizeDoctorFormInput,
  validateDoctorFormInput,
} from '@/lib/doctor-utils';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; requiresResolution?: boolean; duplicates?: DoctorDuplicateMatch[] };

type ImportPreviewResult = {
  rows: DoctorImportPreviewRow[];
  totalRows: number;
};

export async function getDoctorsRegistry(): Promise<ActionResult<DoctorRecord[]>> {
  try {
    const { account } = await createSessionClient();
    await account.get();

    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);
    await ensureDoctorBuckets(admin.storage);

    const doctors = await listDoctors(admin.databases);
    return { success: true, data: doctors };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca registrul medicilor.') };
  }
}

export async function getDoctorById(doctorId: string): Promise<ActionResult<DoctorRecord>> {
  try {
    const { account } = await createSessionClient();
    await account.get();

    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const doctor = await getDoctor(admin.databases, doctorId);
    return { success: true, data: doctor };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca medicul.') };
  }
}

export async function getDoctorAuditTrail(doctorId: string) {
  try {
    const { account } = await createSessionClient();
    await account.get();

    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const logs = await listDoctorAuditLogs(admin.databases, doctorId);
    return { success: true, data: logs };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca audit trail-ul.') };
  }
}

export async function createDoctor(
  input: DoctorFormInput,
  resolution?: DoctorConflictResolution,
): Promise<ActionResult<DoctorRecord>> {
  try {
    const actor = await requireDoctorActor();
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);
    await ensureDoctorBuckets(admin.storage);

    const sanitized = sanitizeDoctorFormInput(input);
    const { errors } = validateDoctorFormInput(sanitized);
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    const duplicates = await findDoctorDuplicateMatches(admin.databases, sanitized);
    if (duplicates.length > 0 && !resolution) {
      return {
        success: false,
        error: 'Au fost găsite posibile duplicate. Alege cum vrei să continui.',
        requiresResolution: true,
        duplicates,
      };
    }

    if (resolution?.action === 'update_existing' || resolution?.action === 'overwrite_existing') {
      const targetDoctorId = resolution.targetDoctorId || duplicates[0]?.doctorId;
      if (!targetDoctorId) {
        throw new Error('Nu există un medic țintă pentru actualizare.');
      }

      const resolved = await resolveDoctorDuplicate(
        admin.databases,
        targetDoctorId,
        sanitized,
        actor.$id,
        resolution.action,
      );

      await writeDoctorAuditLog({
        databases: admin.databases,
        entityId: targetDoctorId,
        action: resolution.action,
        actorUserId: actor.$id,
        before: resolved.before,
        after: resolved.after,
      });

      revalidateDoctorPaths(targetDoctorId);
      return { success: true, data: resolved.after };
    }

    const created = await createDoctorDocument(admin.databases, sanitized, actor.$id);
    await writeDoctorAuditLog({
      databases: admin.databases,
      entityId: created.$id || '',
      action: duplicates.length > 0 ? 'create_anyway' : 'create',
      actorUserId: actor.$id,
      after: created,
    });

    revalidateDoctorPaths(created.$id);
    return { success: true, data: created };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut salva medicul.') };
  }
}

export async function updateDoctor(
  doctorId: string,
  input: DoctorFormInput,
): Promise<ActionResult<DoctorRecord>> {
  try {
    const actor = await requireDoctorActor();
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const sanitized = sanitizeDoctorFormInput(input);
    const { errors } = validateDoctorFormInput(sanitized);
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    const before = await getDoctor(admin.databases, doctorId);
    const updated = await updateDoctorDocument(admin.databases, doctorId, sanitized, actor.$id);

    await writeDoctorAuditLog({
      databases: admin.databases,
      entityId: doctorId,
      action: 'update',
      actorUserId: actor.$id,
      before,
      after: updated,
    });

    revalidateDoctorPaths(doctorId);
    return { success: true, data: updated };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut actualiza medicul.') };
  }
}

export async function archiveDoctor(
  doctorId: string,
  archived: boolean,
): Promise<ActionResult<DoctorRecord>> {
  try {
    const actor = await requireDoctorActor();
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const result = await archiveDoctorDocument(admin.databases, doctorId, actor.$id, archived);
    await writeDoctorAuditLog({
      databases: admin.databases,
      entityId: doctorId,
      action: archived ? 'archive' : 'unarchive',
      actorUserId: actor.$id,
      before: result.before,
      after: result.after,
    });

    revalidateDoctorPaths(doctorId);
    return { success: true, data: result.after };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut actualiza statusul medicului.') };
  }
}

export async function deleteDoctor(doctorId: string): Promise<ActionResult<{ deleted: true }>> {
  try {
    const actor = await requireDoctorActor();
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);
    await ensureDoctorBuckets(admin.storage);

    const before = await deleteDoctorDocument(admin.databases, doctorId);
    await deleteDoctorImageFile(admin.storage, before.profileImageFileId);
    await deleteDoctorDocumentFile(admin.storage, before.cvFileId);
    await deleteDoctorDocumentFile(admin.storage, before.practiceLicenseFileId);
    await writeDoctorAuditLog({
      databases: admin.databases,
      entityId: doctorId,
      action: 'delete',
      actorUserId: actor.$id,
      before,
    });

    revalidateDoctorPaths(doctorId);
    return { success: true, data: { deleted: true } };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut șterge medicul.') };
  }
}

export async function previewDoctorImport(formData: FormData): Promise<ActionResult<ImportPreviewResult>> {
  try {
    await requireDoctorActor();
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new Error('Selectează un fișier Excel sau CSV pentru import.');
    }

    const rows = await parseDoctorImportFile(file);
    const previewRows = await buildDoctorImportPreview(admin.databases, rows);

    return {
      success: true,
      data: {
        rows: previewRows,
        totalRows: previewRows.length,
      },
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Fișierul de import nu a putut fi procesat.') };
  }
}

export async function commitDoctorImport(
  rows: DoctorImportPreviewRow[],
): Promise<ActionResult<DoctorImportSummary>> {
  try {
    const actor = await requireDoctorActor();
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);
    await ensureDoctorBuckets(admin.storage);

    const summary: DoctorImportSummary = {
      totalRows: rows.length,
      imported: 0,
      updated: 0,
      overwritten: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };

    for (const row of rows) {
      const chosenAction = row.selectedAction || row.recommendedAction;
      const sanitized = sanitizeDoctorFormInput(row.data);

      if (!row.isValid || chosenAction === 'skip') {
        summary.skipped += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          action: chosenAction,
          outcome: 'skipped',
          doctorName: sanitized.fullName || `Rând ${row.rowNumber}`,
          message: row.isValid ? 'Rând sărit de administrator.' : row.errors.join(' '),
        });
        continue;
      }

      try {
        if (chosenAction === 'update_existing' || chosenAction === 'overwrite_existing') {
          const targetDoctorId = row.selectedMatchDoctorId || row.matches[0]?.doctorId;
          if (!targetDoctorId) {
            throw new Error('Nu există un medic țintă selectat pentru acest rând.');
          }

          const resolved = await resolveDoctorDuplicate(
            admin.databases,
            targetDoctorId,
            sanitized,
            actor.$id,
            chosenAction,
          );

          await writeDoctorAuditLog({
            databases: admin.databases,
            entityId: targetDoctorId,
            action: chosenAction,
            actorUserId: actor.$id,
            before: resolved.before,
            after: resolved.after,
          });

          if (chosenAction === 'overwrite_existing') {
            summary.overwritten += 1;
          } else {
            summary.updated += 1;
          }

          summary.results.push({
            rowNumber: row.rowNumber,
            action: chosenAction,
            outcome: chosenAction === 'overwrite_existing' ? 'overwritten' : 'updated',
            doctorId: resolved.after.$id,
            doctorName: resolved.after.fullName,
            message: chosenAction === 'overwrite_existing' ? 'Medic suprascris.' : 'Medic actualizat.',
          });

          continue;
        }

        const created = await createDoctorDocument(admin.databases, sanitized, actor.$id);
        await writeDoctorAuditLog({
          databases: admin.databases,
          entityId: created.$id || '',
          action: row.matches.length > 0 ? 'create_anyway' : 'import_create',
          actorUserId: actor.$id,
          after: created,
        });

        summary.imported += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          action: chosenAction,
          outcome: 'created',
          doctorId: created.$id,
          doctorName: created.fullName,
          message: 'Medic creat.',
        });
      } catch (rowError: unknown) {
        summary.failed += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          action: chosenAction,
          outcome: 'failed',
          doctorName: sanitized.fullName || `Rând ${row.rowNumber}`,
          message: getErrorMessage(rowError, 'Rândul a eșuat la import.'),
        });
      }
    }

    await writeDoctorImportAuditLog({
      databases: admin.databases,
      action: 'import_run',
      actorUserId: actor.$id,
      after: summary,
    });

    revalidateDoctorPaths();
    return { success: true, data: summary };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Importul medicilor a eșuat.') };
  }
}

async function buildDoctorImportPreview(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  parsedRows: DoctorFormInput[],
) {
  const duplicateKeyMap = new Map<string, number>();
  const previewRows: DoctorImportPreviewRow[] = [];

  for (let index = 0; index < parsedRows.length; index += 1) {
    const rowNumber = index + 2;
    const sanitized = sanitizeDoctorFormInput(parsedRows[index]);
    const { errors, warnings } = validateDoctorFormInput(sanitized);
    const matches = errors.length === 0 ? await findDoctorDuplicateMatches(databases, sanitized) : [];
    const duplicateWarnings = collectInFileDuplicateWarnings(sanitized, rowNumber, duplicateKeyMap);

    previewRows.push({
      rowNumber,
      data: sanitized,
      isValid: errors.length === 0,
      errors,
      warnings: [...warnings, ...duplicateWarnings],
      matches,
      recommendedAction: errors.length > 0 ? 'skip' : matches.length > 0 ? matches[0].recommendedAction : 'create_anyway',
      selectedAction: errors.length > 0 ? 'skip' : undefined,
      selectedMatchDoctorId: matches[0]?.doctorId,
    });
  }

  return previewRows;
}

async function parseDoctorImportFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (!workbook.SheetNames.length) {
    throw new Error('Fișierul Excel nu conține nicio foaie.');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  }) as string[][];

  if (rawRows.length < 2) {
    throw new Error('Fișierul nu conține rânduri de import.');
  }

  const header = rawRows[0].map((value) => normalizeImportHeader(String(value)));
  const rows = rawRows
    .slice(1)
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  const mapping = {
    fullName: findColumnIndex(header, ['nume']),
    professionalGrade: findColumnIndex(header, ['grad profesional universitar', 'grad profesional', 'grad']),
    phone: findColumnIndex(header, ['telefon']),
    email: findColumnIndex(header, ['email', 'e mail']),
    cuim: findColumnIndex(header, ['cuim']),
    specialty: findColumnIndex(header, ['specialitate']),
    notes: findColumnIndex(header, ['observatii', 'observații']),
  };

  if (mapping.fullName === -1 || mapping.professionalGrade === -1) {
    throw new Error('Template-ul trebuie să conțină cel puțin coloanele "Nume" și "Grad profesional/universitar".');
  }

  return rows.map((row) => ({
    fullName: row[mapping.fullName] || '',
    professionalGrade: row[mapping.professionalGrade] || '',
    phone: mapping.phone >= 0 ? row[mapping.phone] || '' : '',
    email: mapping.email >= 0 ? row[mapping.email] || '' : '',
    cuim: mapping.cuim >= 0 ? row[mapping.cuim] || '' : '',
    specialty: mapping.specialty >= 0 ? row[mapping.specialty] || '' : '',
    notes: mapping.notes >= 0 ? row[mapping.notes] || '' : '',
    status: 'active',
  })) satisfies DoctorFormInput[];
}

function collectInFileDuplicateWarnings(
  row: DoctorFormInput,
  rowNumber: number,
  duplicateKeyMap: Map<string, number>,
) {
  const warnings: string[] = [];
  const keys = [
    normalizeDoctorCuim(row.cuim) ? `cuim:${normalizeDoctorCuim(row.cuim)}` : '',
    normalizeDoctorEmail(row.email) ? `email:${normalizeDoctorEmail(row.email)}` : '',
    normalizeDoctorPhone(row.phone) ? `phone:${normalizeDoctorPhone(row.phone)}` : '',
    normalizeDoctorFullName(row.fullName) ? `name:${normalizeDoctorFullName(row.fullName)}` : '',
  ].filter(Boolean);

  for (const key of keys) {
    const previousRow = duplicateKeyMap.get(key);
    if (previousRow) {
      warnings.push(`Posibil duplicat în fișier cu rândul ${previousRow}.`);
    } else {
      duplicateKeyMap.set(key, rowNumber);
    }
  }

  return warnings;
}

function normalizeImportHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumnIndex(header: string[], candidates: string[]) {
  return header.findIndex((value) =>
    candidates.some((candidate) => value === candidate || value.includes(candidate)),
  );
}

async function requireDoctorActor() {
  const { account } = await createSessionClient();
  return account.get();
}

function revalidateDoctorPaths(doctorId?: string) {
  revalidatePath('/doctors');
  revalidatePath('/doctors/import');

  if (doctorId) {
    revalidatePath(`/doctors/${doctorId}`);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  return fallback;
}
