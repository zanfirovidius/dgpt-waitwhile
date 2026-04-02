import { normalizeName } from '@/lib/name-utils';
import type {
  CabinetAssignmentFormInput,
  CabinetFormInput,
  CabinetMaterialItem,
  CabinetSpecialtyScheduleSlot,
  CabinetAssigneeType,
  ProjectCabinet,
  ProjectCabinetAssignment,
} from '@/lib/cabinet-types';

export function sanitizeCabinetText(value?: string | null, maxLength = 255) {
  const sanitized = (value || '').replace(/\s+/g, ' ').trim();
  return sanitized ? sanitized.slice(0, maxLength) : '';
}

export function sanitizeCabinetLongText(value?: string | null, maxLength = 1500) {
  const sanitized = (value || '').replace(/\r\n/g, '\n').trim();
  return sanitized ? sanitized.slice(0, maxLength) : '';
}

export function normalizeCabinetName(value?: string | null) {
  return normalizeName(sanitizeCabinetText(value, 255));
}

export function normalizeCabinetIdentifier(value?: string | null) {
  return normalizeName(sanitizeCabinetText(value, 64)).replace(/\s+/g, '');
}

export function sanitizeCabinetTime(value?: string | null) {
  const sanitized = sanitizeCabinetText(value, 16);
  return /^\d{2}:\d{2}$/.test(sanitized) ? sanitized : '';
}

export function sanitizeCabinetDate(value?: string | null) {
  return sanitizeCabinetText(value, 32).slice(0, 10);
}

export function sanitizeResponsibleName(value?: string | null) {
  return sanitizeCabinetText(value, 255);
}

export function normalizeResponsibleName(value?: string | null) {
  return normalizeName(sanitizeResponsibleName(value));
}

export function normalizeCabinetAssigneeType(value?: string | null): CabinetAssigneeType {
  if (
    value === 'discipline' ||
    value === 'doctor' ||
    value === 'assistant' ||
    value === 'cabinet-chief' ||
    value === 'responsible'
  ) {
    return value;
  }

  return 'unassigned';
}

export function getCabinetAssigneeTypeLabel(value?: CabinetAssigneeType | null) {
  switch (normalizeCabinetAssigneeType(value)) {
    case 'discipline':
      return 'Disciplina cabinetului';
    case 'doctor':
      return 'Medic';
    case 'assistant':
      return 'Asistent medical';
    case 'cabinet-chief':
      return 'Șef cabinet';
    case 'responsible':
      return 'Responsabil / tehnician';
    default:
      return 'Neasignat';
  }
}

export function getCabinetAssignmentAssigneeName(
  assignment: Pick<
    ProjectCabinetAssignment,
    'assigneeType' | 'cabinetSpecialty' | 'doctorName' | 'volunteerName' | 'responsibleName'
  >,
) {
  switch (normalizeCabinetAssigneeType(assignment.assigneeType)) {
    case 'discipline':
      return sanitizeCabinetText(assignment.cabinetSpecialty, 255);
    case 'doctor':
      return sanitizeCabinetText(assignment.doctorName, 255);
    case 'assistant':
    case 'cabinet-chief':
      return sanitizeCabinetText(assignment.volunteerName, 255);
    case 'responsible':
      return sanitizeResponsibleName(assignment.responsibleName);
    default:
      return '';
  }
}

export function sanitizeMaterialItems(items?: CabinetMaterialItem[] | null) {
  const dedupe = new Set<string>();
  const sanitized: CabinetMaterialItem[] = [];

  for (const [index, item] of (items || []).entries()) {
    const label = sanitizeCabinetText(item?.label, 255);
    if (!label) {
      continue;
    }

    const normalized = normalizeName(label);
    if (dedupe.has(normalized)) {
      continue;
    }

    dedupe.add(normalized);
    sanitized.push({
      id: sanitizeCabinetText(item?.id, 128) || `material-${normalized.replace(/\s+/g, '-') || index + 1}-${index + 1}`,
      label,
      checked: Boolean(item?.checked),
    });
  }

  return sanitized;
}

export function sanitizeCabinetSpecialtyScheduleSlot(
  slot?: CabinetSpecialtyScheduleSlot | null,
): CabinetSpecialtyScheduleSlot {
  return {
    assignmentId: sanitizeCabinetText(slot?.assignmentId, 128),
    assignmentDate: sanitizeCabinetDate(slot?.assignmentDate),
    startTime: sanitizeCabinetTime(slot?.startTime),
    endTime: sanitizeCabinetTime(slot?.endTime),
    specialty: sanitizeCabinetText(slot?.specialty, 160),
    materials: sanitizeMaterialItems(slot?.materials),
    notes: sanitizeCabinetLongText(slot?.notes, 1500),
  };
}

export function sanitizeCabinetSpecialtyScheduleSlots(
  slots?: CabinetSpecialtyScheduleSlot[] | null,
) {
  return (slots || []).map((slot) => sanitizeCabinetSpecialtyScheduleSlot(slot));
}

export function serializeCabinetMaterials(items?: CabinetMaterialItem[] | null) {
  const sanitized = sanitizeMaterialItems(items);
  return sanitized.length > 0 ? JSON.stringify(sanitized) : '[]';
}

export function parseCabinetMaterials(value?: string | null) {
  if (!value) {
    return [] as CabinetMaterialItem[];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [] as CabinetMaterialItem[];
    }

    return sanitizeMaterialItems(
      parsed.map((item) => ({
        id: typeof item?.id === 'string' ? item.id : '',
        label: typeof item?.label === 'string' ? item.label : '',
        checked: Boolean(item?.checked),
      })),
    );
  } catch {
    return [] as CabinetMaterialItem[];
  }
}

export function sanitizeCabinetFormInput(input: CabinetFormInput): CabinetFormInput {
  return {
    projectId: sanitizeCabinetText(input.projectId, 128),
    name: sanitizeCabinetText(input.name, 255),
    identifier: sanitizeCabinetText(input.identifier, 64),
    specialty: sanitizeCabinetText(input.specialty, 160),
    ultrasoundAvailable: Boolean(input.ultrasoundAvailable),
    materials: sanitizeMaterialItems(input.materials),
    specialtySchedule: sanitizeCabinetSpecialtyScheduleSlots(input.specialtySchedule),
    defaultAssigneeType: 'unassigned',
    defaultDoctorId: '',
    defaultResponsibleName: '',
    notes: sanitizeCabinetLongText(input.notes, 1500),
  };
}

export function sanitizeCabinetAssignmentInput(input: CabinetAssignmentFormInput): CabinetAssignmentFormInput {
  return {
    projectId: sanitizeCabinetText(input.projectId, 128),
    cabinetId: sanitizeCabinetText(input.cabinetId, 128),
    cabinetSpecialty: sanitizeCabinetText(input.cabinetSpecialty, 160),
    materials: sanitizeMaterialItems(input.materials),
    assignmentDate: sanitizeCabinetDate(input.assignmentDate),
    startTime: sanitizeCabinetTime(input.startTime),
    endTime: sanitizeCabinetTime(input.endTime),
    assigneeType: normalizeCabinetAssigneeType(input.assigneeType),
    doctorId: sanitizeCabinetText(input.doctorId, 128),
    volunteerId: sanitizeCabinetText(input.volunteerId, 128),
    responsibleName: sanitizeResponsibleName(input.responsibleName),
    notes: sanitizeCabinetLongText(input.notes, 1500),
  };
}

export function validateCabinetFormInput(input: CabinetFormInput) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized = sanitizeCabinetFormInput(input);

  if (!sanitized.projectId) {
    errors.push('Proiectul este obligatoriu.');
  }

  if (!sanitized.name) {
    errors.push('Numele cabinetului este obligatoriu.');
  }

  if (!sanitized.identifier) {
    errors.push('Codul cabinetului este obligatoriu.');
  }

  if ((sanitized.materials || []).length === 0) {
    warnings.push('Checklist-ul de bază al cabinetului este gol.');
  }

  const specialtySchedule = sanitized.specialtySchedule || [];
  if (specialtySchedule.length === 0) {
    warnings.push('Cabinetul nu are încă specialități definite pe zile și intervale.');
  }

  for (const [index, slot] of specialtySchedule.entries()) {
    if (!slot.assignmentDate) {
      errors.push(`Intervalul ${index + 1}: ziua este obligatorie.`);
    }

    if (!slot.startTime || !slot.endTime) {
      errors.push(`Intervalul ${index + 1}: ora de început și ora de final sunt obligatorii.`);
    }

    if (slot.startTime && slot.endTime && slot.startTime >= slot.endTime) {
      errors.push(`Intervalul ${index + 1}: ora de început trebuie să fie înaintea orei de final.`);
    }
  }

  const slotsByDay = new Map<string, CabinetSpecialtyScheduleSlot[]>();
  for (const slot of specialtySchedule) {
    if (!slot.assignmentDate || !slot.startTime || !slot.endTime) {
      continue;
    }

    const current = slotsByDay.get(slot.assignmentDate) || [];
    current.push(slot);
    slotsByDay.set(slot.assignmentDate, current);
  }

  for (const [day, slots] of slotsByDay.entries()) {
    const sortedSlots = [...slots].sort((left, right) =>
      left.startTime === right.startTime
        ? left.endTime.localeCompare(right.endTime, 'ro')
        : left.startTime.localeCompare(right.startTime, 'ro'),
    );

    for (let index = 1; index < sortedSlots.length; index += 1) {
      const previous = sortedSlots[index - 1];
      const current = sortedSlots[index];

      if (doTimeRangesOverlap(previous.startTime, previous.endTime, current.startTime, current.endTime)) {
        errors.push(
          `Cabinetul are intervale de disciplină suprapuse pe ${day}: ${previous.startTime}-${previous.endTime} și ${current.startTime}-${current.endTime}.`,
        );
      }
    }
  }

  return { errors, warnings };
}

export function validateCabinetAssignmentInput(input: CabinetAssignmentFormInput) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized = sanitizeCabinetAssignmentInput(input);

  if (!sanitized.projectId) {
    errors.push('Proiectul este obligatoriu.');
  }

  if (!sanitized.cabinetId) {
    errors.push('Selectează cabinetul.');
  }

  if (!sanitized.assignmentDate) {
    errors.push('Ziua de lucru este obligatorie.');
  }

  if (!sanitized.startTime || !sanitized.endTime) {
    errors.push('Intervalul orar este obligatoriu.');
  }

  if (sanitized.startTime && sanitized.endTime && sanitized.startTime >= sanitized.endTime) {
    errors.push('Ora de început trebuie să fie înaintea orei de final.');
  }

  if (sanitized.assigneeType === 'discipline' && !sanitized.cabinetSpecialty) {
    errors.push('Selectează disciplina cabinetului pentru acest interval.');
  }

  if (sanitized.assigneeType === 'doctor' && !sanitized.doctorId) {
    errors.push('Selectează medicul pentru acest interval.');
  }

  if (
    (sanitized.assigneeType === 'assistant' || sanitized.assigneeType === 'cabinet-chief') &&
    !sanitized.volunteerId
  ) {
    errors.push(`Selectează ${sanitized.assigneeType === 'assistant' ? 'asistentul medical' : 'șeful de cabinet'} pentru acest interval.`);
  }

  if (sanitized.assigneeType === 'responsible' && !sanitized.responsibleName) {
    errors.push('Completează numele persoanei responsabile.');
  }

  if (sanitized.assigneeType === 'unassigned') {
    warnings.push('Intervalul rămâne neasignat momentan.');
  }

  return { errors, warnings };
}

export function buildCabinetSlotKey(assignmentDate: string, startTime: string, endTime: string) {
  return `${sanitizeCabinetDate(assignmentDate)}|${sanitizeCabinetTime(startTime)}|${sanitizeCabinetTime(endTime)}`;
}

export function buildCabinetAssignmentNaturalKey(cabinetId: string, assignmentDate: string, startTime: string, endTime: string) {
  return `${sanitizeCabinetText(cabinetId, 128)}|${buildCabinetSlotKey(assignmentDate, startTime, endTime)}`;
}

export function doTimeRangesOverlap(startTimeA: string, endTimeA: string, startTimeB: string, endTimeB: string) {
  return startTimeA < endTimeB && startTimeB < endTimeA;
}

export function hydrateCabinetRecord(cabinet: ProjectCabinet) {
  return {
    ...cabinet,
    materials: parseCabinetMaterials(cabinet.materialsJson),
    ultrasoundAvailable: Boolean(cabinet.ultrasoundAvailable),
    defaultAssigneeType: normalizeCabinetAssigneeType(cabinet.defaultAssigneeType),
  } satisfies ProjectCabinet;
}

export function hydrateCabinetAssignmentRecord(assignment: ProjectCabinetAssignment) {
  return {
    ...assignment,
    materials: parseCabinetMaterials(assignment.materialsJson),
    assigneeType: normalizeCabinetAssigneeType(assignment.assigneeType),
  } satisfies ProjectCabinetAssignment;
}

export function serializeForCabinetAudit(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 1500 ? `${serialized.slice(0, 1497)}...` : serialized;
  } catch {
    return undefined;
  }
}
