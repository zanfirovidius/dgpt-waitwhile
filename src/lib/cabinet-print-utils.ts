import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import { normalizeName } from '@/lib/name-utils';
import type {
  CabinetDailyPacket,
  CabinetMaterialItem,
  ProjectCabinet,
  ProjectCabinetAssignment,
} from '@/lib/cabinet-types';
import type { DoctorRecord } from '@/lib/doctor-types';

type ProjectPrintContext = {
  name?: string;
  eventName?: string;
  city?: string;
  locationName?: string;
  venue?: string;
};

export const CABINET_TEMPLATE_PLACEHOLDERS = [
  'name',
  'cabinet',
  'room',
  'cabinetCode',
  'specialty',
  'interval',
  'date',
  'event',
  'location',
] as const;

export function buildCabinetDailyPackets(args: {
  cabinets: ProjectCabinet[];
  assignments: ProjectCabinetAssignment[];
  doctors?: DoctorRecord[];
}) {
  const cabinetsById = new Map(args.cabinets.map((cabinet) => [cabinet.$id || '', cabinet]));
  const doctorsById = new Map((args.doctors || []).map((doctor) => [doctor.$id || '', doctor]));

  return args.assignments.map((assignment) => {
    const cabinet = cabinetsById.get(assignment.cabinetId);
    const doctor = assignment.doctorId ? doctorsById.get(assignment.doctorId) : undefined;
    const materials = mergeCabinetMaterials(cabinet?.materials, assignment.materials);
    const readyMaterialsCount = materials.filter((item) => item.checked).length;
    const totalMaterialsCount = materials.length;

    return {
      assignmentId: assignment.$id || '',
      projectId: assignment.projectId,
      assignmentDate: assignment.assignmentDate,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      intervalLabel: `${assignment.startTime} - ${assignment.endTime}`,
      cabinetId: assignment.cabinetId,
      cabinetName: cabinet?.name || assignment.cabinetName || '',
      cabinetIdentifier: cabinet?.identifier || assignment.cabinetIdentifier || '',
      cabinetLabel: formatCabinetLabel(cabinet?.name || assignment.cabinetName),
      specialty: assignment.cabinetSpecialty || cabinet?.specialty || '',
      ultrasoundAvailable: Boolean(cabinet?.ultrasoundAvailable),
      assigneeType: assignment.assigneeType,
      assigneeName: getCabinetAssigneeName(assignment, doctor),
      assigneeDisplayName: getCabinetAssigneeDisplayName(assignment, doctor),
      notes: assignment.notes || '',
      materials,
      readyMaterialsCount,
      totalMaterialsCount,
    } satisfies CabinetDailyPacket;
  });
}

function mergeCabinetMaterials(
  baseMaterials?: CabinetMaterialItem[] | null,
  intervalMaterials?: CabinetMaterialItem[] | null,
) {
  const merged = new Map<string, CabinetMaterialItem>();

  for (const material of [...(baseMaterials || []), ...(intervalMaterials || [])]) {
    const label = (material?.label || '').trim();
    if (!label) {
      continue;
    }

    const key = normalizeName(label);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        id: material.id || key,
        label,
        checked: Boolean(material.checked),
      });
      continue;
    }

    merged.set(key, {
      ...existing,
      checked: existing.checked || Boolean(material.checked),
    });
  }

  return [...merged.values()];
}

export function formatCabinetLabel(value?: string | null) {
  return (value || '').trim().toLocaleUpperCase('ro-RO');
}

export function getCabinetAssigneeName(
  assignment: Pick<ProjectCabinetAssignment, 'assigneeType' | 'doctorName' | 'responsibleName'>,
  doctor?: Pick<DoctorRecord, 'fullName'> | null,
) {
  if (assignment.assigneeType === 'doctor') {
    return (doctor?.fullName || assignment.doctorName || '').trim();
  }

  if (assignment.assigneeType === 'responsible') {
    return (assignment.responsibleName || '').trim();
  }

  return '';
}

export function getCabinetAssigneeDisplayName(
  assignment: Pick<ProjectCabinetAssignment, 'assigneeType' | 'doctorName' | 'responsibleName'>,
  doctor?: Pick<DoctorRecord, 'fullName' | 'professionalGrade'> | null,
) {
  if (assignment.assigneeType === 'doctor') {
    const fullName = (doctor?.fullName || assignment.doctorName || '').trim();
    const grade = (doctor?.professionalGrade || '').trim();

    if (!fullName) {
      return 'NEASIGNAT';
    }

    if (!grade) {
      return fullName;
    }

    const normalizedFullName = fullName.toLocaleLowerCase('ro-RO');
    const normalizedGrade = grade.toLocaleLowerCase('ro-RO');
    if (normalizedFullName.startsWith(normalizedGrade)) {
      return fullName;
    }

    return `${grade} ${fullName}`.trim();
  }

  if (assignment.assigneeType === 'responsible') {
    return (assignment.responsibleName || '').trim() || 'RESPONSABIL NEASIGNAT';
  }

  return 'NEASIGNAT';
}

export function buildCabinetTemplatePlaceholders(
  packet: CabinetDailyPacket,
  project?: ProjectPrintContext | null,
) {
  const location = [project?.city || project?.locationName || '', project?.venue || '']
    .filter(Boolean)
    .join(' · ');
  const parsedDate = parseProjectDay(packet.assignmentDate);

  return {
    name: packet.assigneeDisplayName,
    cabinet: packet.specialty || packet.cabinetLabel,
    room: packet.cabinetLabel,
    cabinetCode: packet.cabinetIdentifier || '',
    specialty: packet.specialty || '',
    interval: packet.intervalLabel,
    date: parsedDate ? format(parsedDate, 'd MMMM yyyy', { locale: ro }) : packet.assignmentDate,
    event: project?.eventName || project?.name || '',
    location,
  };
}

export function buildCabinetPlacardFileName(packet: CabinetDailyPacket) {
  const slug = [packet.cabinetIdentifier || packet.cabinetLabel, packet.assignmentDate, packet.startTime]
    .filter(Boolean)
    .join('_')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '');

  return `plansa-cabinet-${slug || 'cabinet'}.pptx`;
}

export function buildCabinetChecklistPdfFileName(projectName: string, assignmentDate: string) {
  const slug = [projectName, assignmentDate]
    .filter(Boolean)
    .join('_')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '');

  return `checklist-cabinete-${slug || 'zi'}.pdf`;
}

export function getCabinetPrintTemplateSourceLabel(source: 'project' | 'platform' | 'bundled') {
  switch (source) {
    case 'project':
      return 'Template proiect';
    case 'platform':
      return 'Template platformă';
    default:
      return 'Template inclus';
  }
}

function parseProjectDay(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
