'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eachDayOfInterval, format, isValid, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Download,
  Edit2,
  FileBadge2,
  LayoutTemplate,
  Package,
  Plus,
  Printer,
  Save,
  Stethoscope,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getProject, Project } from '@/app/actions/projects';
import { getProjectVolunteers, type ProjectVolunteer } from '@/app/actions/volunteers';
import {
  createProjectCabinet,
  deleteProjectCabinet,
  deleteProjectCabinetAssignment,
  getCabinetPrintTemplateState,
  getProjectCabinetAssignments,
  getProjectCabinets,
  saveProjectCabinetAssignment,
  selectProjectCabinetTemplateFromLibrary,
  updateProjectCabinet,
} from '@/app/actions/cabinets';
import { getDoctorsRegistry } from '@/app/actions/doctors';
import { getPlatformTemplateLibrary } from '@/app/actions/platform-templates';
import { DoctorModal } from '@/components/doctors/DoctorModal';
import { DoctorAvatar } from '@/components/doctors/DoctorAvatar';
import { SearchableSelect } from '@/components/SearchableSelect';
import type {
  CabinetDailyPacket,
  CabinetAssignmentFormInput,
  CabinetFormInput,
  CabinetMaterialItem,
  CabinetPrintTemplateRecord,
  CabinetSpecialtyScheduleSlot,
  ProjectCabinet,
  ProjectCabinetAssignment,
} from '@/lib/cabinet-types';
import type { DoctorRecord } from '@/lib/doctor-types';
import { getDoctorSpecialtyOptions } from '@/lib/doctor-defaults';
import type { PlatformTemplateRecord } from '@/lib/platform-template-types';
import {
  buildCabinetDailyPackets,
  buildCabinetRoleSummaryLines,
  getCabinetPrintTemplateSourceLabel,
} from '@/lib/cabinet-print-utils';
import {
  getCabinetAssigneeTypeLabel,
  getCabinetAssignmentAssigneeName,
} from '@/lib/cabinet-utils';

type FlashMessage = {
  type: 'success' | 'error';
  text: string;
};

type DoctorModalTarget = 'assignment' | null;
type TemplateScope = 'project' | 'platform';
type CabinetTemplateState = {
  projectTemplate: CabinetPrintTemplateRecord | null;
  platformTemplate: CabinetPrintTemplateRecord | null;
  activeSource: 'project' | 'platform' | 'bundled';
};

function createMaterialItem(): CabinetMaterialItem {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `material-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    label: '',
    checked: false,
  };
}

function createEmptyCabinetForm(projectId = ''): CabinetFormInput {
  return {
    projectId,
    name: '',
    identifier: '',
    specialty: '',
    ultrasoundAvailable: false,
    materials: [],
    specialtySchedule: [],
    notes: '',
  };
}

function createScheduleSlot(assignmentDate = ''): CabinetSpecialtyScheduleSlot {
  return {
    assignmentId: '',
    assignmentDate,
    startTime: '',
    endTime: '',
    specialty: '',
    materials: [],
    notes: '',
  };
}

function createEmptyAssignmentForm(projectId = '', assignmentDate = ''): CabinetAssignmentFormInput {
  return {
    projectId,
    cabinetId: '',
    cabinetSpecialty: '',
    materials: [],
    assignmentDate,
    startTime: '',
    endTime: '',
    assigneeType: 'doctor',
    doctorId: '',
    volunteerId: '',
    responsibleName: '',
    notes: '',
  };
}

function buildProjectDayOptions(project?: Project | null) {
  if (!project?.startDate) {
    return [] as { value: string; label: string; shortLabel: string }[];
  }

  const start = parseISO(project.startDate);
  const end = parseISO(project.endDate || project.startDate);

  if (!isValid(start) || !isValid(end)) {
    return [] as { value: string; label: string; shortLabel: string }[];
  }

  return eachDayOfInterval({ start, end }).map((date) => ({
    value: format(date, 'yyyy-MM-dd'),
    label: format(date, 'EEEE, d MMMM yyyy', { locale: ro }),
    shortLabel: format(date, 'EEE d MMM', { locale: ro }),
  }));
}

function getVolunteerDisplayName(volunteer?: Pick<ProjectVolunteer, 'firstName' | 'lastName'> | null) {
  return [volunteer?.firstName || '', volunteer?.lastName || '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ProjectCabinetsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [projectVolunteers, setProjectVolunteers] = useState<ProjectVolunteer[]>([]);
  const [cabinets, setCabinets] = useState<ProjectCabinet[]>([]);
  const [assignments, setAssignments] = useState<ProjectCabinetAssignment[]>([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [message, setMessage] = useState<FlashMessage | null>(null);

  const [editingCabinetId, setEditingCabinetId] = useState<string | null>(null);
  const [cabinetForm, setCabinetForm] = useState<CabinetFormInput>(createEmptyCabinetForm(projectId));
  const [isSavingCabinet, setIsSavingCabinet] = useState(false);
  const [deletingCabinetId, setDeletingCabinetId] = useState<string | null>(null);

  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<CabinetAssignmentFormInput>(
    createEmptyAssignmentForm(projectId, ''),
  );
  const [selectedHumanSlotId, setSelectedHumanSlotId] = useState('');
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);

  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [doctorModalKey, setDoctorModalKey] = useState(0);
  const [doctorModalTarget, setDoctorModalTarget] = useState<DoctorModalTarget>(null);
  const [templateState, setTemplateState] = useState<CabinetTemplateState>({
    projectTemplate: null,
    platformTemplate: null,
    activeSource: 'bundled',
  });
  const [platformPlacardTemplates, setPlatformPlacardTemplates] = useState<PlatformTemplateRecord[]>([]);
  const [templateActionScope, setTemplateActionScope] = useState<TemplateScope | null>(null);
  const [selectedLibraryTemplateId, setSelectedLibraryTemplateId] = useState('');
  const projectTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const cabinetFormCardRef = useRef<HTMLDivElement | null>(null);
  const cabinetNameInputRef = useRef<HTMLInputElement | null>(null);

  const loadDoctors = useCallback(async () => {
    const doctorsResult = await getDoctorsRegistry();
    if (!doctorsResult.success) {
      throw new Error(doctorsResult.error || 'Nu am putut încărca registrul medicilor.');
    }

    setDoctors(doctorsResult.data);
    return doctorsResult.data;
  }, []);

  const reloadTemplateState = useCallback(async () => {
    const result = await getCabinetPrintTemplateState(projectId);
    if (!result.success) {
      throw new Error(result.error || 'Nu am putut actualiza template-urile pentru planșe.');
    }

    setTemplateState(result.data);
    setSelectedLibraryTemplateId(result.data.projectTemplate?.libraryTemplateId || '');
    return result.data;
  }, [projectId]);

  const loadPage = useCallback(async () => {
    setLoading(true);

    try {
      const [
        projectResult,
        doctorsResult,
        volunteersResult,
        cabinetsResult,
        assignmentsResult,
        templateResult,
        libraryResult,
      ] = await Promise.all([
        getProject(projectId),
        getDoctorsRegistry(),
        getProjectVolunteers(projectId, { limit: 1000 }),
        getProjectCabinets(projectId),
        getProjectCabinetAssignments(projectId),
        getCabinetPrintTemplateState(projectId),
        getPlatformTemplateLibrary({ category: 'cabinet-placard-a4', fileType: 'pptx' }),
      ]);

      if (!projectResult.success || !projectResult.data) {
        throw new Error(projectResult.error || 'Proiectul nu a fost găsit.');
      }

      if (!doctorsResult.success) {
        throw new Error(doctorsResult.error || 'Nu am putut încărca medicii.');
      }

      if (!volunteersResult.success || !volunteersResult.data) {
        throw new Error(volunteersResult.error || 'Nu am putut încărca voluntarii proiectului.');
      }

      if (!cabinetsResult.success) {
        throw new Error(cabinetsResult.error || 'Nu am putut încărca cabinetele.');
      }

      if (!assignmentsResult.success) {
        throw new Error(assignmentsResult.error || 'Nu am putut încărca programările.');
      }

      if (!templateResult.success) {
        throw new Error(templateResult.error || 'Nu am putut încărca template-urile pentru planșe.');
      }

      setProject(projectResult.data);
      setDoctors(doctorsResult.data);
      setProjectVolunteers(volunteersResult.data);
      setCabinets(cabinetsResult.data);
      setAssignments(assignmentsResult.data);
      setTemplateState(templateResult.data);
      if (!libraryResult?.success) {
        throw new Error(libraryResult?.error || 'Nu am putut încărca biblioteca de template-uri.');
      }
      setPlatformPlacardTemplates(libraryResult.data);
      setSelectedLibraryTemplateId(
        templateResult.data.projectTemplate?.libraryTemplateId ||
          '',
      );

      const dayOptions = buildProjectDayOptions(projectResult.data);
      const nextDay = dayOptions[0]?.value || projectResult.data.startDate || '';
      setSelectedDay((current) => (current && dayOptions.some((day) => day.value === current) ? current : nextDay));
      setCabinetForm(createEmptyCabinetForm(projectId));
      setAssignmentForm(createEmptyAssignmentForm(projectId, nextDay));
      setSelectedHumanSlotId('');
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Nu am putut încărca modulul cabinetelor.',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!selectedDay || editingAssignmentId) {
      return;
    }

    setAssignmentForm((current) => ({
      ...current,
      projectId,
      assignmentDate: selectedDay,
      startTime: '',
      endTime: '',
      cabinetSpecialty: '',
      materials: [],
    }));
    setSelectedHumanSlotId('');
  }, [editingAssignmentId, projectId, selectedDay]);

  useEffect(() => {
    if (!editingCabinetId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      cabinetFormCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      window.requestAnimationFrame(() => {
        cabinetNameInputRef.current?.focus();
        cabinetNameInputRef.current?.select();
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editingCabinetId]);

  const dayOptions = useMemo(() => buildProjectDayOptions(project), [project]);

  const activeDoctors = useMemo(
    () =>
      doctors
        .filter((doctor) => doctor.status !== 'archived')
        .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ro')),
    [doctors],
  );

  const activeProjectVolunteers = useMemo(
    () =>
      projectVolunteers
        .filter((volunteer) => volunteer.status !== 'archived')
        .sort((left, right) =>
          getVolunteerDisplayName(left).localeCompare(getVolunteerDisplayName(right), 'ro'),
        ),
    [projectVolunteers],
  );

  const disciplineAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.assigneeType === 'discipline')
        .sort((left, right) =>
          left.assignmentDate === right.assignmentDate
            ? left.startTime === right.startTime
              ? left.cabinetIdentifier.localeCompare(right.cabinetIdentifier, 'ro')
              : left.startTime.localeCompare(right.startTime, 'ro')
            : left.assignmentDate.localeCompare(right.assignmentDate, 'ro'),
        ),
    [assignments],
  );

  const humanAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.assigneeType !== 'discipline'),
    [assignments],
  );

  const disciplineAssignmentsBySlot = useMemo(() => {
    const map = new Map<string, ProjectCabinetAssignment>();

    for (const assignment of disciplineAssignments) {
      map.set(
        `${assignment.cabinetId}|${assignment.assignmentDate}|${assignment.startTime}|${assignment.endTime}`,
        assignment,
      );
    }

    return map;
  }, [disciplineAssignments]);

  const selectedDayDisciplineAssignments = useMemo(
    () => disciplineAssignments.filter((assignment) => assignment.assignmentDate === selectedDay),
    [disciplineAssignments, selectedDay],
  );

  const selectedDayAssignments = useMemo(
    () =>
      humanAssignments
        .filter((assignment) => assignment.assignmentDate === selectedDay)
        .sort((left, right) =>
          left.startTime === right.startTime
            ? left.cabinetIdentifier === right.cabinetIdentifier
              ? getCabinetAssigneeTypeLabel(left.assigneeType).localeCompare(
                  getCabinetAssigneeTypeLabel(right.assigneeType),
                  'ro',
                )
              : left.cabinetIdentifier.localeCompare(right.cabinetIdentifier, 'ro')
            : left.startTime.localeCompare(right.startTime, 'ro'),
        ),
    [humanAssignments, selectedDay],
  );

  const selectedDayAllAssignments = useMemo(
    () =>
      assignments.filter((assignment) => assignment.assignmentDate === selectedDay),
    [assignments, selectedDay],
  );

  const selectedAssignmentDoctor = useMemo(
    () => doctors.find((doctor) => doctor.$id === assignmentForm.doctorId) || null,
    [assignmentForm.doctorId, doctors],
  );

  const selectedAssignmentVolunteer = useMemo(
    () => projectVolunteers.find((volunteer) => volunteer.$id === assignmentForm.volunteerId) || null,
    [assignmentForm.volunteerId, projectVolunteers],
  );

  const selectedAssignmentCabinet = useMemo(
    () => cabinets.find((cabinet) => cabinet.$id === assignmentForm.cabinetId) || null,
    [assignmentForm.cabinetId, cabinets],
  );

  const selectedCabinetDisciplineSlots = useMemo(
    () =>
      selectedDayDisciplineAssignments
        .filter((assignment) => assignment.cabinetId === assignmentForm.cabinetId)
        .sort((left, right) =>
          left.startTime === right.startTime
            ? left.endTime.localeCompare(right.endTime, 'ro')
            : left.startTime.localeCompare(right.startTime, 'ro'),
        ),
    [assignmentForm.cabinetId, selectedDayDisciplineAssignments],
  );

  const selectedHumanSlot = useMemo(
    () =>
      selectedCabinetDisciplineSlots.find((assignment) => assignment.$id === selectedHumanSlotId) || null,
    [selectedCabinetDisciplineSlots, selectedHumanSlotId],
  );

  const assignmentCountByCabinetId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const assignment of humanAssignments) {
      counts.set(assignment.cabinetId, (counts.get(assignment.cabinetId) || 0) + 1);
    }

    return counts;
  }, [humanAssignments]);

  const specialtySlotCountByCabinetId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const assignment of disciplineAssignments) {
      counts.set(assignment.cabinetId, (counts.get(assignment.cabinetId) || 0) + 1);
    }

    return counts;
  }, [disciplineAssignments]);

  const selectedDayStats = useMemo(() => {
    const total = selectedDayAssignments.length;
    const disciplineAssigned = selectedDayDisciplineAssignments.length;
    const doctorAssigned = selectedDayAssignments.filter((assignment) => assignment.assigneeType === 'doctor').length;
    const assistantAssigned = selectedDayAssignments.filter((assignment) => assignment.assigneeType === 'assistant').length;
    const cabinetChiefAssigned = selectedDayAssignments.filter((assignment) => assignment.assigneeType === 'cabinet-chief').length;
    const responsibleAssigned = selectedDayAssignments.filter((assignment) => assignment.assigneeType === 'responsible').length;
    const unassigned = selectedDayAssignments.filter((assignment) => assignment.assigneeType === 'unassigned').length;

    return { total, disciplineAssigned, doctorAssigned, assistantAssigned, cabinetChiefAssigned, responsibleAssigned, unassigned };
  }, [selectedDayAssignments, selectedDayDisciplineAssignments]);

  const selectedDayPackets = useMemo<CabinetDailyPacket[]>(
    () =>
      buildCabinetDailyPackets({
        cabinets,
        assignments: selectedDayAllAssignments,
        doctors,
      }),
    [cabinets, doctors, selectedDayAllAssignments],
  );

  const activeTemplate = templateState.projectTemplate || templateState.platformTemplate;
  const selectedLibraryTemplate = useMemo(
    () => platformPlacardTemplates.find((template) => template.$id === selectedLibraryTemplateId) || null,
    [platformPlacardTemplates, selectedLibraryTemplateId],
  );
  const dailyChecklistHref = selectedDay
    ? `/projects/${projectId}/cabinets/checklist?date=${encodeURIComponent(selectedDay)}`
    : '';
  const dailyChecklistPdfHref = selectedDay
    ? `/api/projects/${projectId}/cabinets/checklist-pdf?date=${encodeURIComponent(selectedDay)}`
    : '';

  const resetCabinetForm = useCallback(() => {
    setEditingCabinetId(null);
    setCabinetForm(createEmptyCabinetForm(projectId));
  }, [projectId]);

  const resetAssignmentForm = useCallback(() => {
    setEditingAssignmentId(null);
    setAssignmentForm(createEmptyAssignmentForm(projectId, selectedDay));
    setSelectedHumanSlotId('');
  }, [projectId, selectedDay]);

  const handleAssignmentCabinetChange = useCallback((cabinetId: string) => {
    setSelectedHumanSlotId('');
    setAssignmentForm((current) => ({
      ...current,
      cabinetId,
      assignmentDate: selectedDay,
      startTime: '',
      endTime: '',
      cabinetSpecialty: '',
      materials: [],
    }));
  }, [selectedDay]);

  const handleDoctorSaved = async (savedDoctor?: DoctorRecord) => {
    setDoctorModalOpen(false);
    setDoctorModalTarget(null);

    if (!savedDoctor) {
      await loadDoctors();
      return;
    }

    setDoctors((current) => {
      const existingIndex = current.findIndex((doctor) => doctor.$id === savedDoctor.$id);
      if (existingIndex === -1) {
        return [...current, savedDoctor].sort((left, right) => left.fullName.localeCompare(right.fullName, 'ro'));
      }

      const next = [...current];
      next[existingIndex] = savedDoctor;
      return next.sort((left, right) => left.fullName.localeCompare(right.fullName, 'ro'));
    });

    if (doctorModalTarget === 'assignment') {
      setAssignmentForm((current) => ({
        ...current,
        assigneeType: 'doctor',
        doctorId: savedDoctor.$id || '',
        volunteerId: '',
        cabinetSpecialty: '',
        responsibleName: '',
      }));
    }

    setMessage({
      type: 'success',
      text: `Medicul ${savedDoctor.fullName} a fost adăugat în registrul global și este disponibil imediat.`,
    });
  };

  const handleSaveCabinet = async () => {
    setIsSavingCabinet(true);
    setMessage(null);

    const result = editingCabinetId
      ? await updateProjectCabinet(editingCabinetId, cabinetForm)
      : await createProjectCabinet(cabinetForm);

    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setIsSavingCabinet(false);
      return;
    }

    const assignmentsResult = await getProjectCabinetAssignments(projectId);
    if (!assignmentsResult.success) {
      setMessage({ type: 'error', text: assignmentsResult.error });
      setIsSavingCabinet(false);
      return;
    }

    setCabinets((current) => {
      if (editingCabinetId) {
        return current.map((cabinet) => (cabinet.$id === result.data.$id ? result.data : cabinet));
      }

      return [...current, result.data].sort((left, right) =>
        `${left.identifier} ${left.name}`.localeCompare(`${right.identifier} ${right.name}`, 'ro'),
      );
    });
    setAssignments(assignmentsResult.data);

    setMessage({
      type: 'success',
      text: editingCabinetId
        ? 'Cabinetul a fost actualizat.'
        : 'Cabinetul a fost creat și este disponibil pentru programare.',
    });
    resetCabinetForm();
    setIsSavingCabinet(false);
  };

  const handleEditCabinet = (cabinet: ProjectCabinet) => {
    setEditingCabinetId(cabinet.$id || null);
    setCabinetForm({
      projectId: cabinet.projectId,
      name: cabinet.name,
      identifier: cabinet.identifier,
      specialty: cabinet.specialty || '',
      ultrasoundAvailable: cabinet.ultrasoundAvailable,
      materials: cabinet.materials || [],
      specialtySchedule: disciplineAssignments
        .filter((assignment) => assignment.cabinetId === cabinet.$id)
        .map((assignment) => ({
          assignmentId: assignment.$id || '',
          assignmentDate: assignment.assignmentDate,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          specialty: assignment.cabinetSpecialty || '',
          materials: assignment.materials || [],
          notes: assignment.notes || '',
        })),
      notes: cabinet.notes || '',
    });
  };

  const handleDeleteCabinet = async (cabinet: ProjectCabinet) => {
    if (!cabinet.$id) {
      return;
    }

    if (!window.confirm(`Sigur vrei să ștergi cabinetul "${cabinet.identifier} · ${cabinet.name}"? Programările aferente vor fi eliminate.`)) {
      return;
    }

    setDeletingCabinetId(cabinet.$id);
    setMessage(null);

    const result = await deleteProjectCabinet(cabinet.$id);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setDeletingCabinetId(null);
      return;
    }

    setCabinets((current) => current.filter((item) => item.$id !== cabinet.$id));
    setAssignments((current) => current.filter((assignment) => assignment.cabinetId !== cabinet.$id));

    if (editingCabinetId === cabinet.$id) {
      resetCabinetForm();
    }

    if (assignmentForm.cabinetId === cabinet.$id) {
      resetAssignmentForm();
    }

    setMessage({
      type: 'success',
      text: 'Cabinetul și programările lui au fost șterse.',
    });
    setDeletingCabinetId(null);
  };

  const handleSaveAssignment = async () => {
    if (!selectedHumanSlot) {
      setMessage({
        type: 'error',
        text: 'Selectează mai întâi un slot de specialitate definit pe cabinet.',
      });
      return;
    }

    setIsSavingAssignment(true);
    setMessage(null);

    const result = await saveProjectCabinetAssignment(assignmentForm, editingAssignmentId || undefined);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setIsSavingAssignment(false);
      return;
    }

    setAssignments((current) => {
      if (editingAssignmentId) {
        return current.map((assignment) => (assignment.$id === result.data.$id ? result.data : assignment));
      }

      return [...current, result.data];
    });

    setMessage({
      type: 'success',
      text: editingAssignmentId
        ? 'Programarea a fost actualizată.'
        : 'Intervalul a fost adăugat în program.',
    });
    resetAssignmentForm();
    setIsSavingAssignment(false);
  };

  const handleEditAssignment = (assignment: ProjectCabinetAssignment) => {
    setEditingAssignmentId(assignment.$id || null);
    setSelectedDay(assignment.assignmentDate);
    const linkedDisciplineAssignment = disciplineAssignments.find(
      (item) =>
        item.cabinetId === assignment.cabinetId &&
        item.assignmentDate === assignment.assignmentDate &&
        item.startTime === assignment.startTime &&
        item.endTime === assignment.endTime,
    );
    setSelectedHumanSlotId(linkedDisciplineAssignment?.$id || '');
    setAssignmentForm({
      projectId: assignment.projectId,
      cabinetId: assignment.cabinetId,
      cabinetSpecialty: '',
      materials: [],
      assignmentDate: assignment.assignmentDate,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      assigneeType: assignment.assigneeType,
      doctorId: assignment.doctorId || '',
      volunteerId: assignment.volunteerId || '',
      responsibleName: assignment.responsibleName || '',
      notes: assignment.notes || '',
    });
  };

  const handleDeleteAssignment = async (assignment: ProjectCabinetAssignment) => {
    if (!assignment.$id) {
      return;
    }

    if (!window.confirm(`Ștergi intervalul ${assignment.startTime}-${assignment.endTime} din ${assignment.cabinetIdentifier || assignment.cabinetName}?`)) {
      return;
    }

    setDeletingAssignmentId(assignment.$id);
    setMessage(null);

    const result = await deleteProjectCabinetAssignment(assignment.$id);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setDeletingAssignmentId(null);
      return;
    }

    setAssignments((current) => current.filter((item) => item.$id !== assignment.$id));
    if (editingAssignmentId === assignment.$id) {
      resetAssignmentForm();
    }

    setMessage({
      type: 'success',
      text: 'Programarea a fost eliminată.',
    });
    setDeletingAssignmentId(null);
  };

  const handleTemplateFileSelected = async (
    event: ChangeEvent<HTMLInputElement>,
    scope: TemplateScope,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setTemplateActionScope(scope);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('scopeType', scope);
      formData.append('projectId', projectId);

      const response = await fetch('/api/cabinet-print-templates', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Template-ul nu a putut fi încărcat.');
      }

      await reloadTemplateState();
      setMessage({
        type: 'success',
        text:
          scope === 'project'
            ? 'Template-ul proiectului a fost actualizat. Planșele A4 vor folosi imediat noua variantă.'
            : 'Template-ul platformei a fost actualizat și devine fallback pentru proiectele fără template propriu.',
      });
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Template-ul nu a putut fi încărcat.',
      });
    } finally {
      setTemplateActionScope(null);
      event.target.value = '';
    }
  };

  const handleDeleteTemplate = async (
    scope: TemplateScope,
    template: CabinetPrintTemplateRecord | null,
  ) => {
    if (!template?.$id) {
      return;
    }

    if (!window.confirm(`Ștergi ${scope === 'project' ? 'template-ul proiectului' : 'template-ul platformei'}?`)) {
      return;
    }

    setTemplateActionScope(scope);
    setMessage(null);

    try {
      const response = await fetch(`/api/cabinet-print-templates/${template.$id}?projectId=${projectId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Template-ul nu a putut fi șters.');
      }

      await reloadTemplateState();
      setMessage({
        type: 'success',
        text: scope === 'project' ? 'Template-ul proiectului a fost eliminat.' : 'Template-ul platformei a fost eliminat.',
      });
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Template-ul nu a putut fi șters.',
      });
    } finally {
      setTemplateActionScope(null);
    }
  };

  const handleSelectLibraryTemplate = async () => {
    if (!selectedLibraryTemplateId) {
      setMessage({
        type: 'error',
        text: 'Selectează mai întâi un template din biblioteca platformei.',
      });
      return;
    }

    setTemplateActionScope('project');
    setMessage(null);

    const result = await selectProjectCabinetTemplateFromLibrary(projectId, selectedLibraryTemplateId);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setTemplateActionScope(null);
      return;
    }

    await reloadTemplateState();
    setMessage({
      type: 'success',
      text: 'Template-ul selectat din biblioteca platformei este activ acum pentru acest proiect.',
    });
    setTemplateActionScope(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-20 text-center">
        <AlertCircle className="mx-auto mb-4 text-error/40" size={44} />
        <h2 className="text-xl font-black">Proiectul nu a fost găsit.</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href={`/projects/${projectId}`} className="btn btn-ghost btn-sm gap-2 px-0">
            <ArrowLeft size={14} /> Înapoi la proiect
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-black text-base-content">
            <Stethoscope className="text-primary" size={28} />
            Cabinete Medicale & Program
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Configurezi cabinetele fizice ale evenimentului, definești sloturile de specialitate pentru fiecare cabinet și apoi aloci personalul pe acele sloturi.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/40">Cabinete</div>
            <div className="mt-1 text-2xl font-black">{cabinets.length}</div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/40">Alocări</div>
            <div className="mt-1 text-2xl font-black">{assignments.length}</div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/40">Voluntari activi</div>
            <div className="mt-1 text-2xl font-black">{activeProjectVolunteers.length}</div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert rounded-2xl text-sm ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          <AlertCircle size={16} />
          <span>{message.text}</span>
        </div>
      )}

      <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-base-content">{project.eventName || project.name}</h2>
            <p className="text-sm text-base-content/60">
              {project.city || project.locationName}
              {project.venue ? ` · ${project.venue}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dayOptions.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`btn btn-sm rounded-full ${selectedDay === day.value ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                onClick={() => {
                  setSelectedDay(day.value);
                  if (!editingAssignmentId) {
                    setAssignmentForm((current) => ({ ...current, assignmentDate: day.value }));
                  }
                }}
              >
                {day.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-base-content">
              <LayoutTemplate className="text-secondary" size={20} />
              Template planșe A4
            </h2>
            <p className="mt-1 text-sm text-base-content/60">
              Template-ul PPTX este folosit pentru planșa de cabinet generată din programul zilei. Placeholder-ele suportate sunt{' '}
              <code>{'{{name}}'}</code>, <code>{'{{cabinet}}'}</code> pentru disciplina afișată pe planșă, <code>{'{{room}}'}</code> pentru cabinetul fizic, <code>{'{{cabinetCode}}'}</code>,{' '}
              <code>{'{{specialty}}'}</code> pentru disciplina intervalului, <code>{'{{interval}}'}</code>, <code>{'{{date}}'}</code>,{' '}
              <code>{'{{event}}'}</code> și <code>{'{{location}}'}</code>.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-base-content/70">
            În uz acum: <span className="font-black">{getCabinetPrintTemplateSourceLabel(templateState.activeSource)}</span>
            {activeTemplate ? ` · ${activeTemplate.templateName}` : ' · planșa default inclusă'}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/45">Template proiect</div>
                <div className="mt-1 text-lg font-black text-base-content">
                  {templateState.projectTemplate?.templateName || 'Fără override de proiect'}
                </div>
                <div className="mt-1 text-xs text-base-content/55">
                  {templateState.projectTemplate?.originalFileName || 'Dacă lipsește, proiectul poate folosi un template selectat din biblioteca platformei sau planșa default inclusă.'}
                </div>
              </div>
              <span className={`badge ${templateState.projectTemplate ? 'badge-primary badge-outline' : 'badge-ghost'}`}>
                {templateState.projectTemplate ? 'Activ' : 'Fallback'}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <input
                ref={projectTemplateInputRef}
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={(event) => void handleTemplateFileSelected(event, 'project')}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm gap-2"
                onClick={() => projectTemplateInputRef.current?.click()}
                disabled={templateActionScope === 'project'}
              >
                {templateActionScope === 'project' ? <span className="loading loading-spinner loading-xs" /> : <Upload size={14} />}
                {templateState.projectTemplate?.templateFileId ? 'Schimbă upload-ul proiectului' : 'Încarcă template proiect'}
              </button>
              {templateState.projectTemplate && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm gap-2 text-error"
                  onClick={() => void handleDeleteTemplate('project', templateState.projectTemplate)}
                  disabled={templateActionScope === 'project'}
                >
                  <Trash2 size={14} /> Elimină
                </button>
              )}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/45">Bibliotecă platformă</div>
                <div className="mt-1 text-lg font-black text-base-content">
                  {selectedLibraryTemplate?.templateName || 'Selectează un template salvat'}
                </div>
                <div className="mt-1 text-xs text-base-content/55">
                  {selectedLibraryTemplate?.originalFileName || 'Template-urile din biblioteca platformei se administrează central și se pot reutiliza în proiecte.'}
                </div>
              </div>
              <span className={`badge ${selectedLibraryTemplate ? 'badge-secondary badge-outline' : 'badge-ghost'}`}>
                {selectedLibraryTemplate ? 'Selectat' : 'Disponibil'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <select
                className="select select-bordered w-full"
                value={selectedLibraryTemplateId}
                onChange={(event) => setSelectedLibraryTemplateId(event.target.value)}
              >
                <option value="">Planșa default inclusă</option>
                {platformPlacardTemplates.map((template) => (
                  <option key={template.$id} value={template.$id}>
                    {template.templateName} · {template.originalFileName}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() => void handleSelectLibraryTemplate()}
                  disabled={!selectedLibraryTemplateId || templateActionScope === 'project'}
                >
                  {templateActionScope === 'project' ? <span className="loading loading-spinner loading-xs" /> : <Upload size={14} />}
                  Folosește pentru proiect
                </button>
                <Link href="/templates" className="btn btn-ghost btn-sm gap-2">
                  <LayoutTemplate size={14} /> Gestionează biblioteca
                </Link>
              </div>

              {templateState.platformTemplate ? (
                <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-3 text-xs text-base-content/60">
                  <div>
                    Există și un fallback platformă legacy activ:{' '}
                    <span className="font-semibold text-base-content">{templateState.platformTemplate.templateName}</span>.
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs mt-2 gap-1 text-error"
                    onClick={() => void handleDeleteTemplate('platform', templateState.platformTemplate)}
                    disabled={templateActionScope === 'platform'}
                  >
                    {templateActionScope === 'platform' ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={12} />}
                    Elimină fallback-ul legacy
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1.35fr]">
        <div className="space-y-6">
          <div
            ref={cabinetFormCardRef}
            className={`rounded-[2rem] border bg-base-100 p-6 shadow-sm transition-colors ${
              editingCabinetId ? 'border-primary/40 ring-1 ring-primary/15' : 'border-base-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-base-content">
                  {editingCabinetId ? 'Editează cabinetul fizic' : 'Cabinet fizic nou'}
                </h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Definești spațiul fizic, echiparea lui fixă și programul de specialități pe zile și intervale. Personalul se alocă ulterior doar pe sloturile definite aici.
                </p>
              </div>
              {editingCabinetId && (
                <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={resetCabinetForm}>
                  <X size={14} /> Renunță
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label"><span className="label-text font-semibold">Nume cabinet</span></span>
                <input
                  ref={cabinetNameInputRef}
                  type="text"
                  className="input input-bordered w-full"
                  placeholder="CARDIOLOGIE 1"
                  value={cabinetForm.name}
                  onChange={(event) => setCabinetForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="form-control">
                <span className="label"><span className="label-text font-semibold">Cod / identificator</span></span>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  placeholder="C1"
                  value={cabinetForm.identifier}
                  onChange={(event) => setCabinetForm((current) => ({ ...current, identifier: event.target.value }))}
                />
              </label>

              <label className="form-control md:col-span-2">
                <span className="label"><span className="label-text">Specialitate implicită / fallback</span></span>
                <SearchableSelect
                  value={cabinetForm.specialty || ''}
                  options={getDoctorSpecialtyOptions(cabinetForm.specialty)}
                  placeholder="Alege specialitatea implicită"
                  emptyOptionLabel="Cabinet flexibil / fără fallback"
                  searchPlaceholder="Caută specialitatea"
                  onChange={(value) => setCabinetForm((current) => ({ ...current, specialty: value }))}
                />
              </label>

              <div className="md:col-span-2 rounded-2xl border border-secondary/15 bg-secondary/5 p-4 text-sm text-base-content/70">
                Specialitatea implicită rămâne doar fallback. Programul real al cabinetului, pe zile și intervale, se definește mai jos și devine baza pentru alocarea medicilor, asistenților și șefilor de cabinet.
              </div>

              <label className="form-control md:col-span-2">
                <span className="label"><span className="label-text">Echipare ecograf</span></span>
                <div className="join">
                  <button
                    type="button"
                    className={`btn join-item flex-1 ${cabinetForm.ultrasoundAvailable ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCabinetForm((current) => ({ ...current, ultrasoundAvailable: true }))}
                  >
                    Cu ecograf
                  </button>
                  <button
                    type="button"
                    className={`btn join-item flex-1 ${!cabinetForm.ultrasoundAvailable ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCabinetForm((current) => ({ ...current, ultrasoundAvailable: false }))}
                  >
                    Fără ecograf
                  </button>
                </div>
              </label>

              <label className="form-control md:col-span-2">
                <span className="label"><span className="label-text">Observații operative</span></span>
                <textarea
                  className="textarea textarea-bordered min-h-24 w-full"
                  placeholder="Observații despre flux, aparatură sau setup."
                  value={cabinetForm.notes || ''}
                  onChange={(event) => setCabinetForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-black text-base-content">
                    <Clock size={16} className="text-primary" />
                    Program specialități pe cabinet
                  </h3>
                  <p className="mt-1 text-xs text-base-content/60">
                    Aici definești ce disciplină funcționează în cabinetul fizic, pe zi și pe interval. După salvare, aceste sloturi vor putea primi medici, asistenți și șefi de cabinet.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() =>
                    setCabinetForm((current) => ({
                      ...current,
                      specialtySchedule: [...(current.specialtySchedule || []), createScheduleSlot(selectedDay)],
                    }))
                  }
                >
                  <Plus size={14} /> Adaugă slot
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {(cabinetForm.specialtySchedule || []).map((slot, slotIndex) => (
                  <div key={slot.assignmentId || `slot-${slotIndex}`} className="rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="form-control">
                        <span className="label"><span className="label-text font-semibold">Ziua</span></span>
                        <select
                          className="select select-bordered w-full"
                          value={slot.assignmentDate}
                          onChange={(event) =>
                            setCabinetForm((current) => ({
                              ...current,
                              specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                itemIndex === slotIndex ? { ...item, assignmentDate: event.target.value } : item,
                              ),
                            }))
                          }
                        >
                          <option value="">Selectează ziua</option>
                          {dayOptions.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="form-control">
                          <span className="label"><span className="label-text">Ora început</span></span>
                          <input
                            type="time"
                            className="input input-bordered w-full"
                            value={slot.startTime}
                            onChange={(event) =>
                              setCabinetForm((current) => ({
                                ...current,
                                specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                  itemIndex === slotIndex ? { ...item, startTime: event.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </label>

                        <label className="form-control">
                          <span className="label"><span className="label-text">Ora final</span></span>
                          <input
                            type="time"
                            className="input input-bordered w-full"
                            value={slot.endTime}
                            onChange={(event) =>
                              setCabinetForm((current) => ({
                                ...current,
                                specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                  itemIndex === slotIndex ? { ...item, endTime: event.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </label>
                      </div>

                      <label className="form-control md:col-span-2">
                        <span className="label"><span className="label-text">Specialitatea din interval</span></span>
                        <SearchableSelect
                          value={slot.specialty || ''}
                          options={getDoctorSpecialtyOptions(slot.specialty)}
                          placeholder="Alege specialitatea din acest interval"
                          emptyOptionLabel="Cabinet non-clinic / fără specialitate"
                          searchPlaceholder="Caută specialitatea"
                          onChange={(value) =>
                            setCabinetForm((current) => ({
                              ...current,
                              specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                itemIndex === slotIndex ? { ...item, specialty: value } : item,
                              ),
                            }))
                          }
                        />
                      </label>

                      <label className="form-control md:col-span-2">
                        <span className="label"><span className="label-text">Observații slot</span></span>
                        <textarea
                          className="textarea textarea-bordered min-h-20 w-full"
                          placeholder="Ex: consultații eco doar în prima parte a zilei"
                          value={slot.notes || ''}
                          onChange={(event) =>
                            setCabinetForm((current) => ({
                              ...current,
                              specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                itemIndex === slotIndex ? { ...item, notes: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-2xl border border-base-300 bg-base-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black text-base-content">Materiale specifice slotului</h4>
                          <p className="mt-1 text-xs text-base-content/55">
                            Se combină cu echiparea fixă a cabinetului în checklist și în planșe.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-outline btn-xs gap-2"
                            onClick={() =>
                              setCabinetForm((current) => ({
                                ...current,
                                specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                  itemIndex === slotIndex
                                    ? { ...item, materials: [...(item.materials || []), createMaterialItem()] }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <Plus size={12} /> Material
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs gap-2 text-error"
                            onClick={() =>
                              setCabinetForm((current) => ({
                                ...current,
                                specialtySchedule: (current.specialtySchedule || []).filter((_, itemIndex) => itemIndex !== slotIndex),
                              }))
                            }
                          >
                            <Trash2 size={12} /> Șterge slot
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {(slot.materials || []).map((material, materialIndex) => (
                          <div key={material.id} className="grid gap-3 rounded-2xl border border-base-300 bg-base-100 p-3 md:grid-cols-[auto,1fr,auto] md:items-center">
                            <label className="label cursor-pointer gap-3 px-0">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-primary"
                                checked={material.checked}
                                onChange={(event) =>
                                  setCabinetForm((current) => ({
                                    ...current,
                                    specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                      itemIndex === slotIndex
                                        ? {
                                            ...item,
                                            materials: (item.materials || []).map((slotMaterial, slotMaterialIndex) =>
                                              slotMaterialIndex === materialIndex
                                                ? { ...slotMaterial, checked: event.target.checked }
                                                : slotMaterial,
                                            ),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <span className="label-text text-xs text-base-content/60">Pregătit</span>
                            </label>
                            <input
                              type="text"
                              className="input input-bordered w-full"
                              placeholder="Ex: kit eco, set pansament, consumabile dedicate"
                              value={material.label}
                              onChange={(event) =>
                                setCabinetForm((current) => ({
                                  ...current,
                                  specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                    itemIndex === slotIndex
                                      ? {
                                          ...item,
                                          materials: (item.materials || []).map((slotMaterial, slotMaterialIndex) =>
                                            slotMaterialIndex === materialIndex
                                              ? { ...slotMaterial, label: event.target.value }
                                              : slotMaterial,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-error"
                              onClick={() =>
                                setCabinetForm((current) => ({
                                  ...current,
                                  specialtySchedule: (current.specialtySchedule || []).map((item, itemIndex) =>
                                    itemIndex === slotIndex
                                      ? {
                                          ...item,
                                          materials: (item.materials || []).filter((_, slotMaterialIndex) => slotMaterialIndex !== materialIndex),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}

                        {(slot.materials || []).length === 0 && (
                          <div className="rounded-2xl border border-dashed border-base-300 px-4 py-4 text-sm text-base-content/55">
                            Slotul nu are încă materiale specifice. Se va folosi doar echiparea standard a cabinetului.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {(cabinetForm.specialtySchedule || []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-base-300 px-4 py-5 text-sm text-base-content/55">
                    Cabinetul nu are încă sloturi de specialitate definite. Le poți adăuga acum sau ulterior, la editare.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-black text-base-content">
                    <Package size={16} className="text-secondary" />
                    Echipare fixă & materiale standard
                  </h3>
                  <p className="mt-1 text-xs text-base-content/55">
                    Ce definești aici rămâne legat de cabinetul fizic. La programare poți adăuga și materiale specifice disciplinei din interval.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() =>
                    setCabinetForm((current) => ({
                      ...current,
                      materials: [...(current.materials || []), createMaterialItem()],
                    }))
                  }
                >
                  <Plus size={14} /> Adaugă material
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {(cabinetForm.materials || []).map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-2xl border border-base-300 bg-base-100 p-3 md:grid-cols-[auto,1fr,auto] md:items-center">
                    <label className="label cursor-pointer gap-3 px-0">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary"
                        checked={item.checked}
                        onChange={(event) =>
                          setCabinetForm((current) => ({
                            ...current,
                            materials: (current.materials || []).map((material, materialIndex) =>
                              materialIndex === index
                                ? { ...material, checked: event.target.checked }
                                : material,
                            ),
                          }))
                        }
                      />
                      <span className="label-text text-xs text-base-content/60">Pregătit</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full"
                      placeholder="Ex: Holter TA, consumabile sterile, gel eco"
                      value={item.label}
                      onChange={(event) =>
                        setCabinetForm((current) => ({
                          ...current,
                          materials: (current.materials || []).map((material, materialIndex) =>
                            materialIndex === index
                              ? { ...material, label: event.target.value }
                              : material,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() =>
                        setCabinetForm((current) => ({
                          ...current,
                          materials: (current.materials || []).filter((_, materialIndex) => materialIndex !== index),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {(cabinetForm.materials || []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-base-300 px-4 py-5 text-sm text-base-content/55">
                    Nu ai adăugat încă echiparea de bază pentru acest cabinet fizic.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {editingCabinetId && (
                <button type="button" className="btn btn-ghost gap-2" onClick={resetCabinetForm}>
                  <X size={14} /> Anulează
                </button>
              )}
              <button type="button" className="btn btn-primary gap-2" onClick={handleSaveCabinet} disabled={isSavingCabinet}>
                {isSavingCabinet ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                {editingCabinetId ? 'Salvează cabinetul' : 'Creează cabinetul'}
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-base-content">Structura cabinetelor</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Overview rapid al cabinetelor fizice definite pentru acest proiect.
                </p>
              </div>
              <div className="badge badge-outline badge-lg">{cabinets.length} cabinete</div>
            </div>

            <div className="mt-5 space-y-3">
              {cabinets.map((cabinet) => {
                const checkedMaterials = (cabinet.materials || []).filter((item) => item.checked).length;
                const totalMaterials = (cabinet.materials || []).length;

                return (
                  <div key={cabinet.$id} className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge badge-primary badge-outline">{cabinet.identifier}</span>
                          <h3 className="text-lg font-black text-base-content">{cabinet.name}</h3>
                          <span className={`badge ${cabinet.ultrasoundAvailable ? 'badge-secondary' : 'badge-ghost'}`}>
                            {cabinet.ultrasoundAvailable ? 'Cu ecograf' : 'Fără ecograf'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-base-content/60">
                          <span className="badge badge-ghost">
                            {cabinet.specialty ? `Fallback: ${cabinet.specialty}` : 'Cabinet flexibil'}
                          </span>
                          <span className="badge badge-ghost">
                            Echipare: {checkedMaterials}/{totalMaterials}
                          </span>
                          <span className="badge badge-ghost">
                            Sloturi: {specialtySlotCountByCabinetId.get(cabinet.$id || '') || 0}
                          </span>
                          <span className="badge badge-ghost">
                            Personal alocat: {assignmentCountByCabinetId.get(cabinet.$id || '') || 0}
                          </span>
                        </div>
                        {cabinet.notes ? (
                          <p className="text-sm text-base-content/70">{cabinet.notes}</p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm gap-2"
                          onClick={() => handleEditCabinet(cabinet)}
                        >
                          <Edit2 size={14} /> Editează
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm gap-2 text-error"
                          onClick={() => void handleDeleteCabinet(cabinet)}
                          disabled={deletingCabinetId === cabinet.$id}
                        >
                          {deletingCabinetId === cabinet.$id ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={14} />}
                          Șterge
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {cabinets.length === 0 && (
                <div className="rounded-[1.5rem] border border-dashed border-base-300 px-5 py-6 text-sm text-base-content/55">
                  Nu există cabinete definite încă. Creează primul cabinet în formularul din stânga.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-black text-base-content">Programare pe zile și intervale</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Pentru ziua selectată alegi cabinetul fizic și unul dintre sloturile de specialitate deja definite pe acel cabinet. Apoi aloci personalul pe acel slot.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="badge badge-outline badge-lg">{selectedDayStats.total} alocări</div>
                <div className="badge badge-outline badge-lg">{selectedDayStats.disciplineAssigned} sloturi</div>
                <div className="badge badge-outline badge-lg">{selectedDayStats.doctorAssigned} medici</div>
                <div className="badge badge-outline badge-lg">{selectedDayStats.assistantAssigned} asistenți</div>
                <div className="badge badge-outline badge-lg">{selectedDayStats.cabinetChiefAssigned} șefi cabinet</div>
                <div className="badge badge-outline badge-lg">{selectedDayStats.responsibleAssigned} responsabili</div>
                <div className={`badge badge-lg ${selectedDayStats.unassigned > 0 ? 'badge-warning' : 'badge-ghost'}`}>
                  {selectedDayStats.unassigned} neasignate
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/45">Zi selectată</div>
                  <div className="mt-1 text-lg font-black text-base-content">
                    {dayOptions.find((day) => day.value === selectedDay)?.label || 'Alege o zi'}
                  </div>
                </div>
                {editingAssignmentId && (
                  <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={resetAssignmentForm}>
                    <X size={14} /> Renunță la editare
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="form-control">
                  <span className="label"><span className="label-text font-semibold">Cabinet</span></span>
                  <select
                    className="select select-bordered w-full"
                    value={assignmentForm.cabinetId}
                    onChange={(event) => handleAssignmentCabinetChange(event.target.value)}
                    disabled={cabinets.length === 0}
                  >
                    <option value="">Selectează cabinetul</option>
                    {cabinets.map((cabinet) => (
                      <option key={cabinet.$id} value={cabinet.$id}>
                        {cabinet.identifier} · {cabinet.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-control">
                  <span className="label"><span className="label-text font-semibold">Slot de specialitate</span></span>
                  <select
                    className="select select-bordered w-full"
                    value={selectedHumanSlotId}
                    onChange={(event) => {
                      const nextSlotId = event.target.value;
                      const selectedSlot = selectedCabinetDisciplineSlots.find((slot) => slot.$id === nextSlotId) || null;

                      setSelectedHumanSlotId(nextSlotId);
                      setAssignmentForm((current) => ({
                        ...current,
                        assignmentDate: selectedSlot?.assignmentDate || selectedDay,
                        startTime: selectedSlot?.startTime || '',
                        endTime: selectedSlot?.endTime || '',
                        cabinetSpecialty: selectedSlot?.cabinetSpecialty || '',
                        materials: selectedSlot?.materials || [],
                      }));
                    }}
                    disabled={!assignmentForm.cabinetId}
                  >
                    <option value="">Selectează slotul definit pe cabinet</option>
                    {selectedCabinetDisciplineSlots.map((slot) => (
                      <option key={slot.$id} value={slot.$id}>
                        {slot.startTime}-{slot.endTime} · {slot.cabinetSpecialty || 'Cabinet non-clinic'}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedAssignmentCabinet && (
                  <div className="md:col-span-2 rounded-2xl border border-base-300 bg-base-50 p-4 text-sm text-base-content/70">
                    <div className="font-semibold text-base-content">
                      {selectedAssignmentCabinet.identifier} · {selectedAssignmentCabinet.name}
                    </div>
                    <div className="mt-1">
                      Sloturi definite pentru {dayOptions.find((day) => day.value === selectedDay)?.shortLabel || selectedDay}: {selectedCabinetDisciplineSlots.length}
                    </div>
                    <div className="mt-1">
                      Echipare fizică definită: {(selectedAssignmentCabinet.materials || []).length} articole
                      {selectedAssignmentCabinet.ultrasoundAvailable ? ' · cu ecograf' : ' · fără ecograf'}
                    </div>
                    {selectedHumanSlot ? (
                      <div className="mt-1">
                        Slot activ: {selectedHumanSlot.startTime}-{selectedHumanSlot.endTime}
                        {selectedHumanSlot.cabinetSpecialty ? ` · ${selectedHumanSlot.cabinetSpecialty}` : ' · cabinet non-clinic'}
                      </div>
                    ) : (
                      <div className="mt-1">
                        Alege un slot definit pe cabinet. Dacă nu există încă, editează cabinetul fizic și adaugă programul de specialități.
                      </div>
                    )}
                    {!selectedCabinetDisciplineSlots.length && selectedAssignmentCabinet.$id ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm gap-2"
                          onClick={() => handleEditCabinet(selectedAssignmentCabinet)}
                        >
                          <Edit2 size={14} /> Editează sloturile cabinetului
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                <label className="form-control md:col-span-2">
                  <span className="label"><span className="label-text">Tip alocare personal</span></span>
                  <select
                    className="select select-bordered w-full"
                    value={assignmentForm.assigneeType || 'doctor'}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({
                        ...current,
                        assigneeType: event.target.value as CabinetAssignmentFormInput['assigneeType'],
                        doctorId: event.target.value === 'doctor' ? current.doctorId || '' : '',
                        volunteerId:
                          event.target.value === 'assistant' || event.target.value === 'cabinet-chief'
                            ? current.volunteerId || ''
                            : '',
                        responsibleName:
                          event.target.value === 'responsible' ? current.responsibleName || '' : '',
                      }))
                    }
                  >
                    <option value="doctor">Medic</option>
                    <option value="assistant">Asistent medical</option>
                    <option value="cabinet-chief">Șef cabinet</option>
                    <option value="responsible">Responsabil / tehnician</option>
                  </select>
                </label>

                {selectedHumanSlot && (
                  <div className="md:col-span-2 rounded-2xl border border-secondary/15 bg-secondary/5 p-4 text-sm text-base-content/70">
                    Personalul se alocă pe slotul {selectedHumanSlot.startTime}-{selectedHumanSlot.endTime}
                    {selectedHumanSlot.cabinetSpecialty ? ` pentru ${selectedHumanSlot.cabinetSpecialty}` : ''}.
                    {(selectedHumanSlot.materials || []).length > 0
                      ? ` Slotul are ${(selectedHumanSlot.materials || []).length} materiale specifice deja definite pentru checklist.`
                      : ' Slotul nu are materiale specifice suplimentare.'}
                  </div>
                )}

                {assignmentForm.assigneeType === 'doctor' && (
                  <div className="md:col-span-2 space-y-3 rounded-2xl border border-secondary/15 bg-base-100 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <label className="form-control flex-1">
                        <span className="label"><span className="label-text">Medic pe interval</span></span>
                        <select
                          className="select select-bordered w-full"
                          value={assignmentForm.doctorId || ''}
                          onChange={(event) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              doctorId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Selectează medicul</option>
                          {activeDoctors.map((doctor) => (
                            <option key={doctor.$id} value={doctor.$id}>
                              {doctor.fullName} {doctor.specialty ? `· ${doctor.specialty}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-outline gap-2"
                        onClick={() => {
                          setDoctorModalTarget('assignment');
                          setDoctorModalKey((current) => current + 1);
                          setDoctorModalOpen(true);
                        }}
                      >
                        <UserPlus size={14} /> Medic nou
                      </button>
                    </div>

                    {selectedAssignmentDoctor && (
                      <div className="flex items-center gap-3 rounded-2xl border border-base-300 bg-base-50 p-3">
                        <DoctorAvatar doctor={selectedAssignmentDoctor} size="sm" />
                        <div>
                          <div className="font-bold">{selectedAssignmentDoctor.fullName}</div>
                          <div className="text-xs text-base-content/60">
                            {selectedAssignmentDoctor.professionalGrade}
                            {selectedAssignmentDoctor.specialty ? ` · ${selectedAssignmentDoctor.specialty}` : ''}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {assignmentForm.assigneeType === 'responsible' && (
                  <label className="form-control md:col-span-2">
                    <span className="label"><span className="label-text">Responsabil / tehnician</span></span>
                    <input
                      type="text"
                      className="input input-bordered w-full"
                      placeholder="Ex: Operator EKG"
                      value={assignmentForm.responsibleName || ''}
                      onChange={(event) =>
                        setAssignmentForm((current) => ({
                          ...current,
                          responsibleName: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}

                {(assignmentForm.assigneeType === 'assistant' || assignmentForm.assigneeType === 'cabinet-chief') && (
                  <div className="md:col-span-2 space-y-3 rounded-2xl border border-secondary/15 bg-base-100 p-4">
                    <div className="flex flex-col gap-3">
                      <label className="form-control">
                        <span className="label">
                          <span className="label-text">
                            {assignmentForm.assigneeType === 'assistant' ? 'Asistent medical pe interval' : 'Șef cabinet pe interval'}
                          </span>
                        </span>
                        <select
                          className="select select-bordered w-full"
                          value={assignmentForm.volunteerId || ''}
                          onChange={(event) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              volunteerId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Selectează voluntarul</option>
                          {activeProjectVolunteers.map((volunteer) => (
                            <option key={volunteer.$id} value={volunteer.$id}>
                              {getVolunteerDisplayName(volunteer)}
                              {volunteer.activityCategory ? ` · ${volunteer.activityCategory}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      {activeProjectVolunteers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-base-300 px-4 py-4 text-sm text-base-content/60">
                          Nu există încă voluntari activi în proiect. Adaugă-i mai întâi în registrul voluntarilor.
                          <div className="mt-3">
                            <Link href={`/projects/${projectId}/volunteers`} className="btn btn-outline btn-sm gap-2">
                              <Users size={14} /> Deschide registrul voluntarilor
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedAssignmentVolunteer && (
                      <div className="rounded-2xl border border-base-300 bg-base-50 p-3">
                        <div className="font-bold">{getVolunteerDisplayName(selectedAssignmentVolunteer)}</div>
                        <div className="text-xs text-base-content/60">
                          {selectedAssignmentVolunteer.activityCategory || 'Voluntar proiect'}
                          {selectedAssignmentVolunteer.email ? ` · ${selectedAssignmentVolunteer.email}` : ''}
                          {selectedAssignmentVolunteer.phone ? ` · ${selectedAssignmentVolunteer.phone}` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <label className="form-control md:col-span-2">
                  <span className="label"><span className="label-text">Observații interval</span></span>
                  <textarea
                    className="textarea textarea-bordered min-h-24 w-full"
                    placeholder="Ex: necesită asistent suplimentar după ora 14:00"
                    value={assignmentForm.notes || ''}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {editingAssignmentId && (
                  <button type="button" className="btn btn-ghost gap-2" onClick={resetAssignmentForm}>
                    <X size={14} /> Anulează
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary gap-2"
                  onClick={handleSaveAssignment}
                  disabled={isSavingAssignment || cabinets.length === 0 || !selectedHumanSlot}
                >
                  {isSavingAssignment ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                  {editingAssignmentId ? 'Salvează intervalul' : 'Adaugă în program'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-base-content">Programul zilei</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Vizualizare operațională pentru ziua selectată, ordonată pe intervale.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dailyChecklistPdfHref && (
                  <a href={dailyChecklistPdfHref} className="btn btn-outline btn-sm gap-2" target="_blank" rel="noreferrer">
                    <Download size={14} /> PDF checklist
                  </a>
                )}
                {dailyChecklistHref && (
                  <Link href={dailyChecklistHref} target="_blank" className="btn btn-outline btn-sm gap-2">
                    <Printer size={14} /> Checklist zi
                  </Link>
                )}
                <div className="badge badge-outline badge-lg">
                  {dayOptions.find((day) => day.value === selectedDay)?.shortLabel || 'Fără zi selectată'}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-base-300">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Interval</th>
                      <th>Cabinet</th>
                      <th>Disciplină</th>
                      <th>Alocare</th>
                      <th>Observații</th>
                      <th className="text-right">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDayAssignments.map((assignment) => (
                      <tr key={assignment.$id}>
                        <td>
                          <div className="flex items-center gap-2 font-semibold">
                            <Clock size={14} className="text-base-content/40" />
                            {assignment.startTime} - {assignment.endTime}
                          </div>
                        </td>
                        <td>
                          <div className="font-bold">{assignment.cabinetIdentifier}</div>
                          <div className="text-xs text-base-content/55">{assignment.cabinetName}</div>
                        </td>
                        <td>
                          {disciplineAssignmentsBySlot.get(
                            `${assignment.cabinetId}|${assignment.assignmentDate}|${assignment.startTime}|${assignment.endTime}`,
                          )?.cabinetSpecialty || 'Non-clinic'}
                        </td>
                        <td>
                          <div className="space-y-1">
                            <div className="font-medium">
                              {getCabinetAssignmentAssigneeName(assignment) || 'Neasignat'}
                            </div>
                            <div className="text-xs text-base-content/55">{getCabinetAssigneeTypeLabel(assignment.assigneeType)}</div>
                          </div>
                        </td>
                        <td className="max-w-xs">
                          <span className="line-clamp-2 text-sm text-base-content/65">
                            {assignment.notes || '-'}
                          </span>
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <a
                              href={`/api/projects/${projectId}/cabinets/placards/${assignment.$id}`}
                              className="btn btn-ghost btn-xs gap-1"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileBadge2 size={12} /> Planșă A4
                            </a>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs gap-1"
                              onClick={() => handleEditAssignment(assignment)}
                            >
                              <Edit2 size={12} /> Editează
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs gap-1 text-error"
                              onClick={() => void handleDeleteAssignment(assignment)}
                              disabled={deletingAssignmentId === assignment.$id}
                            >
                              {deletingAssignmentId === assignment.$id ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={12} />}
                              Șterge
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {selectedDayAssignments.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                            <Users className="text-base-content/25" size={36} />
                            <div>
                              <div className="font-semibold text-base-content/70">Nu există încă alocări de personal pentru ziua selectată.</div>
                              <p className="mt-1 text-sm text-base-content/50">
                                Definește sloturile din cabinetul fizic și apoi alocă personalul pe ele din formularul de mai sus.
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-base-content">Checklist derivat pe cabinete</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Se construiește automat din cabinetul fizic, disciplina configurată pe interval și persoana alocată în programul zilei.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-outline badge-lg">{selectedDayPackets.length} fișe</span>
                {dailyChecklistPdfHref && (
                  <a href={dailyChecklistPdfHref} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm gap-2">
                    <Download size={14} /> PDF simplu
                  </a>
                )}
                {dailyChecklistHref && (
                  <Link href={dailyChecklistHref} target="_blank" className="btn btn-outline btn-sm gap-2">
                    <Download size={14} /> Deschide pentru print
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              {selectedDayPackets.map((packet) => (
                <div key={packet.assignmentId} className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-primary badge-outline">{packet.cabinetIdentifier || 'CAB'}</span>
                        <h3 className="text-lg font-black text-base-content">{packet.cabinetLabel}</h3>
                        <span className="badge badge-ghost">{packet.intervalLabel}</span>
                        <span className={`badge ${packet.ultrasoundAvailable ? 'badge-secondary' : 'badge-ghost'}`}>
                          {packet.ultrasoundAvailable ? 'Cu ecograf' : 'Fără ecograf'}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-base-content/70">
                        {buildCabinetRoleSummaryLines(packet.roleAssignments).map((line) => (
                          <div key={`${packet.assignmentId}-${line}`}>
                            <span className="font-semibold">{line}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-sm text-base-content/60">
                        {packet.specialty || 'Cabinet non-clinic'}
                      </div>
                      {packet.notes ? <p className="text-sm text-base-content/65">{packet.notes}</p> : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/projects/${projectId}/cabinets/placards/${packet.assignmentId}`}
                        className="btn btn-outline btn-sm gap-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileBadge2 size={14} /> Planșă A4
                      </a>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {packet.materials.length > 0 ? (
                      packet.materials.map((material) => (
                        <div
                          key={material.id}
                          className="flex items-start gap-3 rounded-2xl border border-base-300 bg-base-100 px-3 py-3"
                        >
                          <span
                            className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border text-[11px] font-black ${
                              material.checked
                                ? 'border-secondary bg-secondary/15 text-secondary'
                                : 'border-base-300 text-base-content/35'
                            }`}
                          >
                            {material.checked ? '✓' : ''}
                          </span>
                          <span className="text-sm text-base-content/80">{material.label}</span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-base-300 px-4 py-5 text-sm text-base-content/55 md:col-span-2">
                        Nu există materiale configurate pentru acest cabinet.
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {selectedDayPackets.length === 0 && (
                <div className="rounded-[1.5rem] border border-dashed border-base-300 px-5 py-6 text-sm text-base-content/55">
                  Nu există încă fișe de cabinet pentru ziua selectată. Adaugă intervale în program pentru a genera checklist-ul operațional.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DoctorModal
        key={doctorModalKey}
        isOpen={doctorModalOpen}
        doctor={null}
        onClose={() => {
          setDoctorModalOpen(false);
          setDoctorModalTarget(null);
        }}
        onSaved={(doctor) => void handleDoctorSaved(doctor)}
      />
    </div>
  );
}
