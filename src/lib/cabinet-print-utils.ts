import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import { normalizeName } from '@/lib/name-utils';
import type {
  CabinetDailyPacket,
  CabinetPacketRoleAssignment,
  CabinetMaterialItem,
  CabinetAssigneeType,
  ProjectCabinet,
  ProjectCabinetAssignment,
} from '@/lib/cabinet-types';
import { getCabinetAssigneeTypeLabel } from '@/lib/cabinet-utils';
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
  const groupedAssignments = new Map<string, ProjectCabinetAssignment[]>();

  for (const assignment of args.assignments) {
    const groupKey = [
      assignment.cabinetId,
      assignment.assignmentDate,
      assignment.startTime,
      assignment.endTime,
    ].join('|');

    const current = groupedAssignments.get(groupKey) || [];
    current.push(assignment);
    groupedAssignments.set(groupKey, current);
  }

  return [...groupedAssignments.values()].map((group) => {
    const assignment = [...group].sort(compareCabinetAssignmentsByRole)[0];
    const cabinet = cabinetsById.get(assignment.cabinetId);
    const disciplineAssignments = group.filter((item) => item.assigneeType === 'discipline');
    const staffAssignments = group.filter((item) => item.assigneeType !== 'discipline');
    const roleAssignments = staffAssignments
      .map((groupedAssignment) => {
        const doctor = groupedAssignment.doctorId ? doctorsById.get(groupedAssignment.doctorId) : undefined;
        return {
          assignmentId: groupedAssignment.$id || '',
          assigneeType: groupedAssignment.assigneeType,
          roleLabel: getCabinetAssigneeTypeLabel(groupedAssignment.assigneeType),
          assigneeName: getCabinetAssigneeName(groupedAssignment, doctor),
          assigneeDisplayName: getCabinetAssigneeDisplayName(groupedAssignment, doctor),
          doctorId: groupedAssignment.doctorId || '',
          volunteerId: groupedAssignment.volunteerId || '',
          volunteerCategory: groupedAssignment.volunteerCategory || '',
        } satisfies CabinetPacketRoleAssignment;
      })
      .sort(compareCabinetRoleAssignments);

    const primaryRole = roleAssignments[0];
    const materials = mergeCabinetMaterials(
      cabinet?.materials,
      disciplineAssignments.length > 0
        ? disciplineAssignments.flatMap((item) => item.materials || [])
        : group.flatMap((item) => item.materials || []),
    );
    const readyMaterialsCount = materials.filter((item) => item.checked).length;
    const totalMaterialsCount = materials.length;
    const notes = [...new Set(group.map((item) => (item.notes || '').trim()).filter(Boolean))].join(' · ');
    const specialty =
      disciplineAssignments[0]?.cabinetSpecialty ||
      group.find((item) => item.cabinetSpecialty)?.cabinetSpecialty ||
      cabinet?.specialty ||
      '';

    return {
      assignmentId: primaryRole?.assignmentId || disciplineAssignments[0]?.$id || assignment.$id || '',
      assignmentIds: group.map((item) => item.$id || '').filter(Boolean),
      projectId: assignment.projectId,
      assignmentDate: assignment.assignmentDate,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      intervalLabel: `${assignment.startTime} - ${assignment.endTime}`,
      cabinetId: assignment.cabinetId,
      cabinetName: cabinet?.name || assignment.cabinetName || '',
      cabinetIdentifier: cabinet?.identifier || assignment.cabinetIdentifier || '',
      cabinetLabel: formatCabinetLabel(cabinet?.name || assignment.cabinetName),
      specialty,
      ultrasoundAvailable: Boolean(cabinet?.ultrasoundAvailable),
      assigneeType: primaryRole?.assigneeType || (disciplineAssignments.length > 0 ? 'discipline' : 'unassigned'),
      assigneeName: primaryRole?.assigneeName || '',
      assigneeDisplayName: primaryRole?.assigneeDisplayName || 'NEASIGNAT',
      roleAssignments,
      notes,
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
  assignment: Pick<ProjectCabinetAssignment, 'assigneeType' | 'cabinetSpecialty' | 'doctorName' | 'volunteerName' | 'responsibleName'>,
  doctor?: Pick<DoctorRecord, 'fullName'> | null,
) {
  if (assignment.assigneeType === 'discipline') {
    return (assignment.cabinetSpecialty || '').trim();
  }

  if (assignment.assigneeType === 'doctor') {
    return (doctor?.fullName || assignment.doctorName || '').trim();
  }

  if (assignment.assigneeType === 'assistant' || assignment.assigneeType === 'cabinet-chief') {
    return (assignment.volunteerName || '').trim();
  }

  if (assignment.assigneeType === 'responsible') {
    return (assignment.responsibleName || '').trim();
  }

  return '';
}

export function getCabinetAssigneeDisplayName(
  assignment: Pick<ProjectCabinetAssignment, 'assigneeType' | 'cabinetSpecialty' | 'doctorName' | 'volunteerName' | 'responsibleName'>,
  doctor?: Pick<DoctorRecord, 'fullName' | 'professionalGrade'> | null,
) {
  if (assignment.assigneeType === 'discipline') {
    return (assignment.cabinetSpecialty || '').trim() || 'DISCIPLINĂ NEASIGNATĂ';
  }

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

  if (assignment.assigneeType === 'assistant') {
    return (assignment.volunteerName || '').trim() || 'ASISTENT NEASIGNAT';
  }

  if (assignment.assigneeType === 'cabinet-chief') {
    return (assignment.volunteerName || '').trim() || 'ȘEF CABINET NEASIGNAT';
  }

  if (assignment.assigneeType === 'responsible') {
    return (assignment.responsibleName || '').trim() || 'RESPONSABIL NEASIGNAT';
  }

  return 'NEASIGNAT';
}

export function buildCabinetRoleSummaryLines(roleAssignments: CabinetPacketRoleAssignment[]) {
  const meaningfulAssignments = roleAssignments.filter(
    (role) => role.assigneeType !== 'unassigned' && role.assigneeType !== 'discipline',
  );

  if (meaningfulAssignments.length === 0) {
    return ['Neasignat'];
  }

  return meaningfulAssignments.map((role) => `${role.roleLabel}: ${role.assigneeDisplayName}`);
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

function compareCabinetAssignmentsByRole(left: ProjectCabinetAssignment, right: ProjectCabinetAssignment) {
  return getCabinetRolePriority(left.assigneeType) - getCabinetRolePriority(right.assigneeType);
}

function compareCabinetRoleAssignments(
  left: CabinetPacketRoleAssignment,
  right: CabinetPacketRoleAssignment,
) {
  const roleDiff = getCabinetRolePriority(left.assigneeType) - getCabinetRolePriority(right.assigneeType);
  if (roleDiff !== 0) {
    return roleDiff;
  }

  return left.assigneeDisplayName.localeCompare(right.assigneeDisplayName, 'ro');
}

function getCabinetRolePriority(value?: CabinetAssigneeType) {
  switch (value) {
    case 'discipline':
      return 4;
    case 'doctor':
      return 0;
    case 'cabinet-chief':
      return 1;
    case 'assistant':
      return 2;
    case 'responsible':
      return 3;
    default:
      return 5;
  }
}
