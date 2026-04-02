'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import type {
  CabinetPrintTemplateRecord,
  CabinetAssignmentFormInput,
  CabinetFormInput,
  CabinetSpecialtyScheduleSlot,
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
  getCabinetAssigneeTypeLabel,
  getCabinetAssignmentAssigneeName,
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

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const VOLUNTEERS_COLLECTION_ID = 'project_volunteers';

type ProjectVolunteerRecord = {
  $id?: string;
  projectId: string;
  firstName?: string;
  lastName?: string;
  activityCategory?: string;
  status?: 'active' | 'inactive' | 'archived';
};

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
    await syncCabinetSpecialtySchedule(admin, actor.$id, created, sanitized);

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

    await syncCabinetSpecialtySchedule(admin, actor.$id, existing, sanitized, true);
    const updated = await updateProjectCabinetDocument(admin.databases, cabinetId, sanitized, actor.$id);
    await syncCabinetSpecialtySchedule(admin, actor.$id, updated, sanitized);

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

    const { doctor, volunteer } = await resolveAssignmentActors(admin, sanitized, cabinet.projectId);
    const assignments = await listProjectCabinetAssignments(admin.databases, sanitized.projectId);
    ensureCabinetDisciplineSlotExists(assignments, sanitized, cabinet);
    validateAssignmentConflicts(assignments, sanitized, cabinet, assignmentId);

    const result = assignmentId
      ? await updateProjectCabinetAssignmentDocument(
          admin.databases,
          assignmentId,
          sanitized,
          actor.$id,
          cabinet,
          doctor,
          volunteer,
        )
      : await createProjectCabinetAssignmentDocument(
          admin.databases,
          sanitized,
          actor.$id,
          cabinet,
          doctor,
          volunteer,
        );

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

async function resolveAssignmentActors(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  input: CabinetAssignmentFormInput,
  projectId: string,
) {
  let doctor: DoctorRecord | null = null;
  let volunteer: ProjectVolunteerRecord | null = null;

  if (input.assigneeType === 'doctor' && input.doctorId) {
    doctor = await getDoctor(admin.databases, input.doctorId);
    ensureDoctorIsAssignable(doctor);
  }

  if ((input.assigneeType === 'assistant' || input.assigneeType === 'cabinet-chief') && input.volunteerId) {
    const volunteerDoc = await admin.databases.getDocument(
      DATABASE_ID,
      VOLUNTEERS_COLLECTION_ID,
      input.volunteerId,
    );
    volunteer = JSON.parse(JSON.stringify(volunteerDoc)) as ProjectVolunteerRecord;
    ensureVolunteerIsAssignable(volunteer, projectId, input.assigneeType);
  }

  return { doctor, volunteer };
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

async function syncCabinetSpecialtySchedule(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  actorUserId: string,
  cabinet: ProjectCabinet,
  input: CabinetFormInput,
  dryRun = false,
) {
  const allAssignments = await listProjectCabinetAssignments(admin.databases, cabinet.projectId);
  const cabinetAssignments = allAssignments.filter((assignment) => assignment.cabinetId === cabinet.$id);
  const existingDisciplineAssignments = cabinetAssignments.filter(
    (assignment) => assignment.assigneeType === 'discipline',
  );
  const existingHumanAssignments = cabinetAssignments.filter(
    (assignment) => assignment.assigneeType !== 'discipline',
  );
  const submittedSlots = input.specialtySchedule || [];
  const keptDisciplineIds = new Set(
    submittedSlots.map((slot) => slot.assignmentId || '').filter(Boolean),
  );

  for (const existingAssignment of existingDisciplineAssignments) {
    if (!existingAssignment.$id || keptDisciplineIds.has(existingAssignment.$id)) {
      continue;
    }

    const linkedHumanAssignments = existingHumanAssignments.filter((assignment) =>
      matchesCabinetSlot(assignment, existingAssignment),
    );

    if (linkedHumanAssignments.length > 0) {
      throw new Error(
        `Nu poți elimina slotul ${existingAssignment.assignmentDate} ${existingAssignment.startTime}-${existingAssignment.endTime} din cabinetul ${cabinet.identifier || cabinet.name} cât timp există personal alocat pe acel interval.`,
      );
    }
  }

  for (const slot of submittedSlots) {
    const existingAssignment =
      slot.assignmentId
        ? existingDisciplineAssignments.find((assignment) => assignment.$id === slot.assignmentId)
        : null;

    if (
      existingAssignment &&
      hasCabinetSlotTimingChanged(existingAssignment, slot)
    ) {
      const linkedHumanAssignments = existingHumanAssignments.filter((assignment) =>
        matchesCabinetSlot(assignment, existingAssignment),
      );

      if (linkedHumanAssignments.length > 0) {
        throw new Error(
          `Nu poți modifica intervalul ${existingAssignment.assignmentDate} ${existingAssignment.startTime}-${existingAssignment.endTime} pentru cabinetul ${cabinet.identifier || cabinet.name} cât timp există medici sau voluntari alocați pe acel slot.`,
        );
      }
    }
  }

  if (dryRun) {
    return;
  }

  for (const slot of submittedSlots) {
    const slotInput = buildDisciplineAssignmentInput(cabinet.projectId, cabinet.$id || '', slot);
    const existingAssignment =
      slot.assignmentId
        ? existingDisciplineAssignments.find((assignment) => assignment.$id === slot.assignmentId)
        : null;

    if (existingAssignment?.$id) {
      await updateProjectCabinetAssignmentDocument(
        admin.databases,
        existingAssignment.$id,
        slotInput,
        actorUserId,
        cabinet,
      );
      continue;
    }

    await createProjectCabinetAssignmentDocument(
      admin.databases,
      slotInput,
      actorUserId,
      cabinet,
    );
  }

  for (const existingAssignment of existingDisciplineAssignments) {
    if (!existingAssignment.$id || keptDisciplineIds.has(existingAssignment.$id)) {
      continue;
    }

    await deleteProjectCabinetAssignmentDocument(admin.databases, existingAssignment.$id);
  }

  for (const assignment of existingHumanAssignments) {
    if (!assignment.$id) {
      continue;
    }

    await updateProjectCabinetAssignmentDocument(
      admin.databases,
      assignment.$id,
      buildAssignmentInputFromExisting(assignment),
      actorUserId,
      cabinet,
    );
  }
}

function buildDisciplineAssignmentInput(
  projectId: string,
  cabinetId: string,
  slot: CabinetSpecialtyScheduleSlot,
): CabinetAssignmentFormInput {
  return {
    projectId,
    cabinetId,
    assignmentDate: slot.assignmentDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    assigneeType: 'discipline',
    cabinetSpecialty: slot.specialty || '',
    materials: slot.materials || [],
    notes: slot.notes || '',
    doctorId: '',
    volunteerId: '',
    responsibleName: '',
  };
}

function buildAssignmentInputFromExisting(
  assignment: ProjectCabinetAssignment,
): CabinetAssignmentFormInput {
  return {
    projectId: assignment.projectId,
    cabinetId: assignment.cabinetId,
    assignmentDate: assignment.assignmentDate,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    assigneeType: assignment.assigneeType,
    cabinetSpecialty: assignment.cabinetSpecialty || '',
    materials: assignment.materials || [],
    doctorId: assignment.doctorId || '',
    volunteerId: assignment.volunteerId || '',
    responsibleName: assignment.responsibleName || '',
    notes: assignment.notes || '',
  };
}

function matchesCabinetSlot(
  assignment: Pick<ProjectCabinetAssignment, 'assignmentDate' | 'startTime' | 'endTime'>,
  slot: Pick<ProjectCabinetAssignment, 'assignmentDate' | 'startTime' | 'endTime'>,
) {
  return (
    assignment.assignmentDate === slot.assignmentDate &&
    assignment.startTime === slot.startTime &&
    assignment.endTime === slot.endTime
  );
}

function hasCabinetSlotTimingChanged(
  assignment: Pick<ProjectCabinetAssignment, 'assignmentDate' | 'startTime' | 'endTime'>,
  slot: Pick<CabinetSpecialtyScheduleSlot, 'assignmentDate' | 'startTime' | 'endTime'>,
) {
  return (
    assignment.assignmentDate !== slot.assignmentDate ||
    assignment.startTime !== slot.startTime ||
    assignment.endTime !== slot.endTime
  );
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

  const overlappingCabinetRoleConflict = sameDayAssignments.find(
    (assignment) =>
      assignment.cabinetId === cabinet.$id &&
      assignment.assigneeType === input.assigneeType &&
      doTimeRangesOverlap(assignment.startTime, assignment.endTime, input.startTime, input.endTime),
  );

  if (overlappingCabinetRoleConflict) {
    throw new Error(
      `Cabinetul ${cabinet.identifier || cabinet.name} are deja ${getCabinetAssigneeTypeLabel(input.assigneeType).toLowerCase()} programat între ${overlappingCabinetRoleConflict.startTime} și ${overlappingCabinetRoleConflict.endTime}.`,
    );
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

  if (
    (input.assigneeType === 'assistant' || input.assigneeType === 'cabinet-chief') &&
    input.volunteerId
  ) {
    const volunteerConflict = sameDayAssignments.find(
      (assignment) =>
        assignment.volunteerId === input.volunteerId &&
        doTimeRangesOverlap(assignment.startTime, assignment.endTime, input.startTime, input.endTime),
    );

    if (volunteerConflict) {
      throw new Error(
        `${getCabinetAssignmentAssigneeName(volunteerConflict) || 'Voluntarul selectat'} este deja programat în cabinetul ${volunteerConflict.cabinetIdentifier || volunteerConflict.cabinetName} pentru intervalul ${volunteerConflict.startTime}-${volunteerConflict.endTime}.`,
      );
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

function ensureCabinetDisciplineSlotExists(
  assignments: ProjectCabinetAssignment[],
  input: CabinetAssignmentFormInput,
  cabinet: ProjectCabinet,
) {
  if (input.assigneeType === 'discipline') {
    return;
  }

  const matchingDisciplineSlot = assignments.find(
    (assignment) =>
      assignment.cabinetId === cabinet.$id &&
      assignment.assigneeType === 'discipline' &&
      assignment.assignmentDate === input.assignmentDate &&
      assignment.startTime === input.startTime &&
      assignment.endTime === input.endTime,
  );

  if (!matchingDisciplineSlot) {
    throw new Error(
      `Cabinetul ${cabinet.identifier || cabinet.name} nu are un slot de specialitate definit pentru ${input.assignmentDate} ${input.startTime}-${input.endTime}. Definește mai întâi slotul în structura cabinetului.`,
    );
  }
}

function ensureDoctorIsAssignable(doctor: DoctorRecord) {
  if (doctor.status === 'archived') {
    throw new Error('Medicul selectat este arhivat și nu poate fi asignat.');
  }
}

function ensureVolunteerIsAssignable(
  volunteer: ProjectVolunteerRecord,
  projectId: string,
  assigneeType: Extract<ProjectCabinetAssignment['assigneeType'], 'assistant' | 'cabinet-chief'>,
) {
  if (volunteer.projectId !== projectId) {
    throw new Error('Voluntarul selectat nu aparține proiectului curent.');
  }

  if (volunteer.status === 'archived') {
    throw new Error(
      `${assigneeType === 'assistant' ? 'Asistentul medical' : 'Șeful de cabinet'} selectat este arhivat și nu poate fi alocat.`,
    );
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
