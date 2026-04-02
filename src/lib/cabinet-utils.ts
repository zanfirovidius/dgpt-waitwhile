import { normalizeName } from '@/lib/name-utils';
import type {
  CabinetAssignmentFormInput,
  CabinetFormInput,
  CabinetMaterialItem,
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
  if (value === 'doctor' || value === 'responsible') {
    return value;
  }

  return 'unassigned';
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

  if (sanitized.assigneeType === 'doctor' && !sanitized.doctorId) {
    errors.push('Selectează medicul pentru acest interval.');
  }

  if (sanitized.assigneeType === 'responsible' && !sanitized.responsibleName) {
    errors.push('Completează numele persoanei responsabile.');
  }

  if (sanitized.assigneeType === 'unassigned') {
    warnings.push('Intervalul rămâne neasignat momentan.');
  }

  if (!sanitized.cabinetSpecialty) {
    warnings.push('Disciplina intervalului este necompletată. Pentru cabinetele non-clinice acest lucru este acceptat.');
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
