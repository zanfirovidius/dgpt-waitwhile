'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import type {
  CabinetPrintTemplateRecord,
  CabinetAssignmentFormInput,
  CabinetFormInput,
  ProjectCabinet,
  ProjectCabinetAssignment,
} from '@/lib/cabinet-types';
import {
  deleteCabinetPrintTemplateFile,
  ensureCabinetPrintTemplateBucket,
  createProjectCabinetAssignmentDocument,
  createProjectCabinetDocument,
  deleteProjectCabinetAssignmentDocument,
  deleteProjectCabinetDocument,
  ensureCabinetsSchema,
  getProjectCabinet,
  getProjectCabinetAssignment,
  getResolvedCabinetPrintTemplate,
  listProjectCabinetAssignments,
  listProjectCabinets,
  upsertCabinetPrintTemplateDocument,
  updateProjectCabinetAssignmentDocument,
  updateProjectCabinetDocument,
} from '@/lib/cabinets-server';
import {
  doTimeRangesOverlap,
  normalizeCabinetIdentifier,
  normalizeCabinetName,
  normalizeResponsibleName,
  sanitizeCabinetAssignmentInput,
  sanitizeCabinetFormInput,
  validateCabinetAssignmentInput,
  validateCabinetFormInput,
} from '@/lib/cabinet-utils';
import { getDoctor } from '@/lib/doctors-server';
import type { DoctorRecord } from '@/lib/doctor-types';
import { ensurePlatformTemplatesSchema, getPlatformTemplate } from '@/lib/platform-templates-server';
import type { PlatformTemplateRecord } from '@/lib/platform-template-types';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getProjectCabinets(projectId: string): Promise<ActionResult<ProjectCabinet[]>> {
  try {
    await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const cabinets = await listProjectCabinets(admin.databases, projectId);
    return { success: true, data: cabinets };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca cabinetele proiectului.') };
  }
}

export async function getProjectCabinetAssignments(projectId: string): Promise<ActionResult<ProjectCabinetAssignment[]>> {
  try {
    await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const assignments = await listProjectCabinetAssignments(admin.databases, projectId);
    return { success: true, data: assignments };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca programările cabinetelor.') };
  }
}

export async function getCabinetPrintTemplateState(
  projectId: string,
): Promise<
  ActionResult<{
    projectTemplate: CabinetPrintTemplateRecord | null;
    platformTemplate: CabinetPrintTemplateRecord | null;
    activeSource: 'project' | 'platform' | 'bundled';
  }>
> {
  try {
    await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);
    await ensureCabinetPrintTemplateBucket(admin.storage);

    const resolved = await getResolvedCabinetPrintTemplate(admin.databases, projectId);
    return {
      success: true,
      data: {
        projectTemplate: resolved.projectTemplate,
        platformTemplate: resolved.platformTemplate,
        activeSource: resolved.activeSource,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: getErrorMessage(error, 'Nu am putut încărca template-urile pentru planșe.'),
    };
  }
}

export async function selectProjectCabinetTemplateFromLibrary(
  projectId: string,
  libraryTemplateId: string,
): Promise<ActionResult<CabinetPrintTemplateRecord>> {
  try {
    const actor = await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);
    await ensurePlatformTemplatesSchema(admin.databases);
    await ensureCabinetPrintTemplateBucket(admin.storage);

    const previous = await getResolvedCabinetPrintTemplate(admin.databases, projectId);
    if (previous.projectTemplate?.templateFileId) {
      await deleteCabinetPrintTemplateFile(admin.storage, previous.projectTemplate.templateFileId);
    }

    const libraryTemplate = await getPlatformTemplate(admin.databases, libraryTemplateId);
    ensureLibraryTemplateFitsCabinetPlacards(libraryTemplate);

    const template = await upsertCabinetPrintTemplateDocument(
      admin.databases,
      {
        scopeType: 'project',
        projectId,
        libraryTemplateId,
        templateName: libraryTemplate.templateName,
        templateFileId: '',
        originalFileName: libraryTemplate.originalFileName,
        placeholdersJson: libraryTemplate.placeholdersJson || '[]',
      },
      actor.$id,
    );

    revalidateCabinetPaths(projectId);
    return { success: true, data: template };
  } catch (error: unknown) {
    return {
      success: false,
      error: getErrorMessage(error, 'Nu am putut selecta template-ul din bibliotecă.'),
    };
  }
}

export async function createProjectCabinet(input: CabinetFormInput): Promise<ActionResult<ProjectCabinet>> {
  try {
    const actor = await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const sanitized = sanitizeCabinetFormInput(input);
    const { errors } = validateCabinetFormInput(sanitized);
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    const cabinets = await listProjectCabinets(admin.databases, sanitized.projectId);
    validateCabinetUniqueness(cabinets, sanitized);

    const created = await createProjectCabinetDocument(admin.databases, sanitized, actor.$id);

    revalidateCabinetPaths(sanitized.projectId);
    return { success: true, data: created };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut crea cabinetul.') };
  }
}

export async function updateProjectCabinet(
  cabinetId: string,
  input: CabinetFormInput,
): Promise<ActionResult<ProjectCabinet>> {
  try {
    const actor = await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const existing = await getProjectCabinet(admin.databases, cabinetId);
    const sanitized = sanitizeCabinetFormInput({ ...input, projectId: existing.projectId });
    const { errors } = validateCabinetFormInput(sanitized);
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    const cabinets = await listProjectCabinets(admin.databases, existing.projectId);
    validateCabinetUniqueness(cabinets, sanitized, cabinetId);

    const updated = await updateProjectCabinetDocument(admin.databases, cabinetId, sanitized, actor.$id);

    revalidateCabinetPaths(existing.projectId);
    return { success: true, data: updated };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut actualiza cabinetul.') };
  }
}

export async function deleteProjectCabinet(cabinetId: string): Promise<ActionResult<{ deletedId: string }>> {
  try {
    await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const deleted = await deleteProjectCabinetDocument(admin.databases, cabinetId);
    revalidateCabinetPaths(deleted.projectId);

    return { success: true, data: { deletedId: cabinetId } };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut șterge cabinetul.') };
  }
}

export async function saveProjectCabinetAssignment(
  input: CabinetAssignmentFormInput,
  assignmentId?: string,
): Promise<ActionResult<ProjectCabinetAssignment>> {
  try {
    const actor = await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const sanitized = sanitizeCabinetAssignmentInput(input);
    const { errors } = validateCabinetAssignmentInput(sanitized);
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    const cabinet = await getProjectCabinet(admin.databases, sanitized.cabinetId);
    if (cabinet.projectId !== sanitized.projectId) {
      throw new Error('Cabinetul selectat nu aparține proiectului curent.');
    }

    const doctor = await resolveDoctorForAssignment(admin, sanitized);
    const assignments = await listProjectCabinetAssignments(admin.databases, sanitized.projectId);
    validateAssignmentConflicts(assignments, sanitized, cabinet, assignmentId);

    const result = assignmentId
      ? await updateProjectCabinetAssignmentDocument(admin.databases, assignmentId, sanitized, actor.$id, cabinet, doctor)
      : await createProjectCabinetAssignmentDocument(admin.databases, sanitized, actor.$id, cabinet, doctor);

    revalidateCabinetPaths(sanitized.projectId);
    return { success: true, data: result };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut salva programarea cabinetului.') };
  }
}

export async function deleteProjectCabinetAssignment(
  assignmentId: string,
): Promise<ActionResult<{ deletedId: string }>> {
  try {
    await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const deleted = await deleteProjectCabinetAssignmentDocument(admin.databases, assignmentId);
    revalidateCabinetPaths(deleted.projectId);

    return { success: true, data: { deletedId: assignmentId } };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut șterge programarea.') };
  }
}

export async function getProjectCabinetAssignmentById(
  assignmentId: string,
): Promise<ActionResult<ProjectCabinetAssignment>> {
  try {
    await requireCabinetActor();
    const admin = await createAdminClient();
    await ensureCabinetsSchema(admin.databases);

    const assignment = await getProjectCabinetAssignment(admin.databases, assignmentId);
    return { success: true, data: assignment };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca programarea.') };
  }
}

async function resolveDoctorForAssignment(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  input: CabinetAssignmentFormInput,
) {
  if (input.assigneeType !== 'doctor' || !input.doctorId) {
    return null;
  }

  const doctor = await getDoctor(admin.databases, input.doctorId);
  ensureDoctorIsAssignable(doctor);

  return doctor;
}

function validateCabinetUniqueness(
  cabinets: ProjectCabinet[],
  input: CabinetFormInput,
  excludeCabinetId?: string,
) {
  const nameNormalized = normalizeCabinetName(input.name);
  const identifierNormalized = normalizeCabinetIdentifier(input.identifier);

  if (
    cabinets.some(
      (cabinet) =>
        cabinet.$id !== excludeCabinetId &&
        cabinet.nameNormalized === nameNormalized,
    )
  ) {
    throw new Error('Există deja un cabinet cu același nume în acest proiect.');
  }

  if (
    cabinets.some(
      (cabinet) =>
        cabinet.$id !== excludeCabinetId &&
        cabinet.identifierNormalized === identifierNormalized,
    )
  ) {
    throw new Error('Există deja un cabinet cu același cod în acest proiect.');
  }
}

function validateAssignmentConflicts(
  assignments: ProjectCabinetAssignment[],
  input: CabinetAssignmentFormInput,
  cabinet: ProjectCabinet,
  excludeAssignmentId?: string,
) {
  const sameDayAssignments = assignments.filter(
    (assignment) =>
      assignment.$id !== excludeAssignmentId &&
      assignment.assignmentDate === input.assignmentDate,
  );

  const cabinetConflict = sameDayAssignments.find(
    (assignment) =>
      assignment.cabinetId === cabinet.$id &&
      doTimeRangesOverlap(assignment.startTime, assignment.endTime, input.startTime, input.endTime),
  );

  if (cabinetConflict) {
    throw new Error(`Cabinetul ${cabinet.identifier || cabinet.name} are deja programare între ${cabinetConflict.startTime} și ${cabinetConflict.endTime}.`);
  }

  if (input.assigneeType === 'doctor' && input.doctorId) {
    const doctorConflict = sameDayAssignments.find(
      (assignment) =>
        assignment.doctorId === input.doctorId &&
        doTimeRangesOverlap(assignment.startTime, assignment.endTime, input.startTime, input.endTime),
    );

    if (doctorConflict) {
      throw new Error(`Medicul selectat este deja programat în cabinetul ${doctorConflict.cabinetIdentifier || doctorConflict.cabinetName} pentru intervalul ${doctorConflict.startTime}-${doctorConflict.endTime}.`);
    }
  }

  if (input.assigneeType === 'responsible' && input.responsibleName) {
    const normalizedResponsible = normalizeResponsibleName(input.responsibleName);
    const responsibleConflict = sameDayAssignments.find(
      (assignment) =>
        assignment.assigneeType === 'responsible' &&
        normalizeResponsibleName(assignment.responsibleName) === normalizedResponsible &&
        doTimeRangesOverlap(assignment.startTime, assignment.endTime, input.startTime, input.endTime),
    );

    if (responsibleConflict) {
      throw new Error(`Persoana responsabilă este deja programată în cabinetul ${responsibleConflict.cabinetIdentifier || responsibleConflict.cabinetName} pentru intervalul ${responsibleConflict.startTime}-${responsibleConflict.endTime}.`);
    }
  }
}

function ensureDoctorIsAssignable(doctor: DoctorRecord) {
  if (doctor.status === 'archived') {
    throw new Error('Medicul selectat este arhivat și nu poate fi asignat.');
  }
}

function ensureLibraryTemplateFitsCabinetPlacards(template: PlatformTemplateRecord) {
  if (template.category !== 'cabinet-placard-a4') {
    throw new Error('Template-ul selectat nu aparține categoriei de planșe A4 pentru cabinete.');
  }

  if (template.fileType !== 'pptx') {
    throw new Error('Pentru planșele A4 poți selecta doar template-uri PPTX.');
  }
}

async function requireCabinetActor() {
  const { account } = await createSessionClient();
  return account.get();
}

function revalidateCabinetPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cabinets`);
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
