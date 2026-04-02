'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import { 
  ArrowLeft, Users, Search, Filter, Plus, Upload, 
  Trash2, Edit2, XCircle, 
  UserPlus, Mail, Phone, ExternalLink, RefreshCw, Stethoscope, CalendarDays, Clock,
} from 'lucide-react';
import { getProject, Project } from '@/app/actions/projects';
import { 
  getProjectVolunteers, 
  ProjectVolunteer, 
  deleteVolunteer, 
  bulkDeleteVolunteers 
} from '@/app/actions/volunteers';
import { getProjectCabinetAssignments } from '@/app/actions/cabinets';
import { getDoctorsRegistry } from '@/app/actions/doctors';
import { 
    createWaitwhileAccountAction, 
    deleteWaitwhileAccountAction,
    bulkCreateWaitwhileAccountsAction,
    bulkDeleteWaitwhileAccountsAction
} from '@/app/actions/volunteer-waitwhile';
import { DoctorAvatar } from '@/components/doctors/DoctorAvatar';
import { VolunteerModal } from '@/components/volunteers/VolunteerModal';
import { ImportVolunteersModal } from '@/components/volunteers/ImportVolunteersModal';
import type { ProjectCabinetAssignment } from '@/lib/cabinet-types';
import type { DoctorRecord } from '@/lib/doctor-types';

type AssignedDoctorSummary = {
  id: string;
  doctor: Pick<DoctorRecord, '$id' | 'fullName' | 'profileImageUrl' | 'profileImageUploadedAt'> | null;
  doctorId?: string;
  fullName: string;
  professionalGrade?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  assignmentCount: number;
  cabinetCount: number;
  assignments: ProjectCabinetAssignment[];
};

export default function VolunteersPage() {
  const params = useParams();
  const projectId = typeof params.id === 'string' ? params.id : params.id?.[0];

  const [project, setProject] = useState<Project | null>(null);
  const [volunteers, setVolunteers] = useState<ProjectVolunteer[]>([]);
  const [assignedDoctors, setAssignedDoctors] = useState<AssignedDoctorSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingWW, setIsProcessingWW] = useState(false);
  
  // Filtering & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [waitwhileFilter, setWaitwhileFilter] = useState<'has_account' | 'no_account' | 'all'>('all');
  const [categories, setCategories] = useState<string[]>([]);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modals
  const [isVolunteerModalOpen, setIsVolunteerModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<ProjectVolunteer | null>(null);

  const fetchVolunteers = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    const res = await getProjectVolunteers(projectId, {
        search: searchQuery,
        category: categoryFilter,
        waitwhileStatus: waitwhileFilter === 'all' ? undefined : waitwhileFilter,
    });
    if (res.success) {
        setVolunteers(res.data || []);
        setTotal(res.total || 0);
    }
    setIsLoading(false);
  }, [projectId, searchQuery, categoryFilter, waitwhileFilter]);

  const fetchAssignedDoctors = useCallback(async () => {
    if (!projectId) return;

    const [assignmentsRes, doctorsRes] = await Promise.all([
      getProjectCabinetAssignments(projectId),
      getDoctorsRegistry(),
    ]);

    if (!assignmentsRes.success || !doctorsRes.success) {
      return;
    }

    const doctorsById = new Map(doctorsRes.data.map((doctor) => [doctor.$id || '', doctor]));
    const grouped = new Map<string, ProjectCabinetAssignment[]>();

    for (const assignment of assignmentsRes.data) {
      if (assignment.assigneeType !== 'doctor' || (!assignment.doctorId && !assignment.doctorName)) {
        continue;
      }

      const key = assignment.doctorId || `name:${assignment.doctorName}`;
      const current = grouped.get(key) || [];
      current.push(assignment);
      grouped.set(key, current);
    }

    const summaries = [...grouped.entries()]
      .map(([key, items]) => {
        const assignments = [...items].sort((left, right) => {
          const leftKey = `${left.assignmentDate} ${left.startTime}`;
          const rightKey = `${right.assignmentDate} ${right.startTime}`;
          return leftKey.localeCompare(rightKey, 'ro');
        });
        const linkedDoctor = assignments[0]?.doctorId ? doctorsById.get(assignments[0].doctorId || '') : undefined;

        return {
          id: key,
          doctor: linkedDoctor
            ? {
                $id: linkedDoctor.$id,
                fullName: linkedDoctor.fullName,
                profileImageUrl: linkedDoctor.profileImageUrl,
                profileImageUploadedAt: linkedDoctor.profileImageUploadedAt,
              }
            : null,
          doctorId: linkedDoctor?.$id || assignments[0]?.doctorId || '',
          fullName: linkedDoctor?.fullName || assignments[0]?.doctorName || 'Medic neidentificat',
          professionalGrade: linkedDoctor?.professionalGrade || '',
          specialty: linkedDoctor?.specialty || assignments[0]?.cabinetSpecialty || '',
          phone: linkedDoctor?.phone || '',
          email: linkedDoctor?.email || '',
          assignmentCount: assignments.length,
          cabinetCount: new Set(assignments.map((assignment) => assignment.cabinetId)).size,
          assignments,
        } satisfies AssignedDoctorSummary;
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ro'));

    setAssignedDoctors(summaries);
  }, [projectId]);

  useEffect(() => {
    const init = async () => {
        if (!projectId) return;
        const projRes = await getProject(projectId);
        if (projRes.success && projRes.data) {
            setProject(projRes.data);
            setCategories(projRes.data.volunteerRoles || ['VOLUNTAR']);
        }
        await Promise.all([fetchVolunteers(), fetchAssignedDoctors()]);
    };
    void init();
  }, [projectId, fetchAssignedDoctors, fetchVolunteers]);

  const handleRefresh = async () => {
    await Promise.all([fetchVolunteers(), fetchAssignedDoctors()]);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === volunteers.length) {
        setSelectedIds([]);
    } else {
        setSelectedIds(volunteers.map(v => v.$id!));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Sigur doriți să ștergeți acest voluntar?')) return;
    const res = await deleteVolunteer(id);
    if (res.success) {
        fetchVolunteers();
    } else {
        alert(res.error);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Sigur doriți să ștergeți ${selectedIds.length} voluntari?`)) return;
    const res = await bulkDeleteVolunteers(selectedIds);
    if (res.success) {
        setSelectedIds([]);
        fetchVolunteers();
    } else {
        alert('Unele ștergeri au eșuat.');
        fetchVolunteers();
    }
  };
  
  const handleWWCreate = async (id: string) => {
    setIsProcessingWW(true);
    const res = await createWaitwhileAccountAction(id);
    if (res.success) {
        fetchVolunteers();
    } else {
        alert(res.error);
    }
    setIsProcessingWW(false);
  };

  const handleWWDelete = async (id: string) => {
    if (!window.confirm('Sigur doriți să ștergeți contul Waitwhile al acestui voluntar?')) return;
    setIsProcessingWW(true);
    const res = await deleteWaitwhileAccountAction(id);
    if (res.success) {
        fetchVolunteers();
    } else {
        alert(res.error);
    }
    setIsProcessingWW(false);
  };

  const handleBulkWWCreate = async () => {
    if (!window.confirm(`Generați conturi Waitwhile pentru ${selectedIds.length} voluntari?`)) return;
    setIsProcessingWW(true);
    const res = await bulkCreateWaitwhileAccountsAction(selectedIds);
    if (res.success) {
        setSelectedIds([]);
        fetchVolunteers();
    } else {
        alert('Unele conturi nu au putut fi create.');
        fetchVolunteers();
    }
    setIsProcessingWW(false);
  };

  const handleBulkWWDelete = async () => {
    if (!window.confirm(`Ștergeți conturile Waitwhile pentru ${selectedIds.length} voluntari?`)) return;
    setIsProcessingWW(true);
    const res = await bulkDeleteWaitwhileAccountsAction(selectedIds);
    if (res.success) {
        setSelectedIds([]);
        fetchVolunteers();
    } else {
        alert('Unele ștergeri au eșuat.');
        fetchVolunteers();
    }
    setIsProcessingWW(false);
  };

  const openEditModal = (v: ProjectVolunteer) => {
    setEditingVolunteer(v);
    setIsVolunteerModalOpen(true);
  };

  const openAddModal = () => {
    setEditingVolunteer(null);
    setIsVolunteerModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <Link 
              href={`/projects/${projectId}`} 
              className="btn btn-ghost btn-sm btn-circle"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-base-content flex items-center gap-2">
                <Users className="text-accent" /> Registru Voluntari
              </h1>
              <p className="text-xs text-base-content/50 font-medium">
                {project?.name} • {total} voluntari înregistrați
              </p>
            </div>
        </div>
        <div className="flex gap-2">
            {project?.projectSlug && (
              <a
                href={`/v/${project.projectSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm gap-2 rounded-xl"
              >
                <ExternalLink size={16} /> Portal Public
              </a>
            )}
            <button 
                onClick={() => setIsImportModalOpen(true)}
                className="btn btn-outline btn-sm gap-2 rounded-xl"
            >
                <Upload size={16} /> Import Excel
            </button>
            <button 
                onClick={openAddModal}
                className="btn btn-accent btn-sm gap-2 rounded-xl"
            >
                <Plus size={16} /> Adaugă Voluntar
            </button>
        </div>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-base-content">
              <Stethoscope className="text-secondary" size={18} />
              Medici alocați în cabinete
            </h2>
            <p className="mt-1 text-sm text-base-content/60">
              Rezumat rapid al medicilor programați în cabinetele proiectului, direct lângă registrul de voluntari.
            </p>
          </div>
          <div className="badge badge-outline badge-lg">{assignedDoctors.length} medici</div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {assignedDoctors.length > 0 ? (
            assignedDoctors.map((doctor) => (
              <div key={doctor.id} className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
                <div className="flex items-start gap-3">
                  {doctor.doctor ? (
                    <DoctorAvatar doctor={doctor.doctor} size="sm" />
                  ) : (
                    <div className="avatar h-10 w-10">
                      <div className="rounded-2xl border border-base-300 bg-base-200 text-xs font-black text-base-content/70 flex items-center justify-center">
                        {doctor.fullName
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {doctor.doctorId ? (
                        <Link
                          href={`/doctors/${doctor.doctorId}`}
                          className="font-bold text-base-content hover:text-secondary transition-colors"
                        >
                          {doctor.fullName}
                        </Link>
                      ) : (
                        <div className="font-bold text-base-content">{doctor.fullName}</div>
                      )}
                      <span className="badge badge-ghost">{doctor.assignmentCount} intervale</span>
                      <span className="badge badge-ghost">{doctor.cabinetCount} cabinete</span>
                    </div>
                    <div className="mt-1 text-sm text-base-content/65">
                      {[doctor.professionalGrade, doctor.specialty].filter(Boolean).join(' · ') || 'Fără detalii suplimentare'}
                    </div>
                    {(doctor.email || doctor.phone) ? (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-base-content/55">
                        {doctor.email ? <span className="flex items-center gap-1.5"><Mail size={12} /> {doctor.email}</span> : null}
                        {doctor.phone ? <span className="flex items-center gap-1.5"><Phone size={12} /> {doctor.phone}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {doctor.assignments.slice(0, 3).map((assignment) => (
                    <div key={assignment.$id} className="rounded-2xl border border-base-300 bg-base-100 px-3 py-2 text-sm text-base-content/70">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-base-content">
                        <CalendarDays size={13} className="text-base-content/45" />
                        {formatAssignmentDate(assignment.assignmentDate)}
                        <span className="text-base-content/35">·</span>
                        <Clock size={13} className="text-base-content/45" />
                        {assignment.startTime} - {assignment.endTime}
                      </div>
                      <div className="mt-1 text-xs text-base-content/60">
                        {assignment.cabinetIdentifier} · {assignment.cabinetName}
                        {assignment.cabinetSpecialty ? ` · ${assignment.cabinetSpecialty}` : ''}
                      </div>
                    </div>
                  ))}
                  {doctor.assignments.length > 3 ? (
                    <div className="text-xs font-semibold text-base-content/50">
                      + încă {doctor.assignments.length - 3} intervale în program
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-base-300 px-5 py-6 text-sm text-base-content/55 xl:col-span-2">
              Nu există încă medici alocați în cabinetele acestui proiect.
            </div>
          )}
        </div>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-3xl p-6 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30" size={18} />
                    <input 
                        type="text" 
                        placeholder="Caută după nume, email sau telefon..." 
                        className="input input-bordered w-full pl-12 rounded-2xl bg-base-200/30 focus:bg-base-100 transition-all border-base-200"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="dropdown dropdown-bottom">
                    <label tabIndex={0} className="btn btn-ghost btn-sm gap-2 rounded-xl border border-base-200 bg-base-200/30">
                        <Filter size={16} /> Categorie: {categoryFilter === 'all' ? 'Toate' : categoryFilter}
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-[20] menu p-2 shadow-2xl bg-base-100 rounded-2xl w-52 mt-2 border border-base-200">
                        <li><button onClick={() => setCategoryFilter('all')}>Toate</button></li>
                        {categories.map(cat => (
                            <li key={cat}><button onClick={() => setCategoryFilter(cat)}>{cat}</button></li>
                        ))}
                    </ul>
                </div>
                <div className="dropdown dropdown-bottom">
                    <label tabIndex={0} className="btn btn-ghost btn-sm gap-2 rounded-xl border border-base-200 bg-base-200/30">
                        Waitwhile: {waitwhileFilter === 'all' ? 'Oricare' : waitwhileFilter === 'has_account' ? 'Cu Cont' : 'Fără Cont'}
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-[20] menu p-2 shadow-2xl bg-base-100 rounded-2xl w-52 mt-2 border border-base-200">
                        <li><button onClick={() => setWaitwhileFilter('all')}>Oricare</button></li>
                        <li><button onClick={() => setWaitwhileFilter('has_account')}>Cu Cont</button></li>
                        <li><button onClick={() => setWaitwhileFilter('no_account')}>Fără Cont</button></li>
                    </ul>
                </div>
                <button 
                  onClick={() => void handleRefresh()}
                  className="btn btn-ghost btn-sm btn-square rounded-xl hover:bg-base-200/50 transition-all"
                  disabled={isLoading}
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            {selectedIds.length > 0 && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300 bg-base-200/50 p-2 pr-4 rounded-2xl border border-base-200">
                    <span className="text-xs font-bold opacity-60 ml-2">{selectedIds.length} selectați</span>
                    
                    <div className="flex gap-1">
                        <button onClick={handleBulkWWCreate} className="btn btn-ghost btn-xs gap-1 rounded-lg text-primary hover:bg-primary/10" disabled={isProcessingWW}>
                            <UserPlus size={12} /> Crează Waitwhile
                        </button>
                        <button onClick={handleBulkWWDelete} className="btn btn-ghost btn-xs gap-1 rounded-lg text-error hover:bg-error/10" disabled={isProcessingWW}>
                            <Trash2 size={12} /> Șterge Waitwhile
                        </button>
                        <div className="divider divider-horizontal mx-0 w-px h-4 self-center opacity-20"></div>
                        <button onClick={handleBulkDelete} className="btn btn-error btn-xs gap-1 rounded-lg" disabled={isProcessingWW}>
                            <Trash2 size={12} /> Șterge Voluntari
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* List Content */}
        <div className="overflow-x-auto min-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <span className="loading loading-spinner loading-lg text-primary"></span>
                <p className="text-xs font-bold opacity-30 uppercase tracking-widest">Se încarcă voluntarii...</p>
            </div>
          ) : volunteers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
                <Users size={64} strokeWidth={1} />
                <p className="text-lg font-medium">Nu am găsit niciun voluntar</p>
                <button onClick={openAddModal} className="btn btn-ghost btn-sm gap-2 underline">Adaugă primul voluntar</button>
            </div>
          ) : (
            <table className="table table-md w-full">
              <thead>
                <tr className="bg-base-200/30 text-base-content/50 border-b border-base-200">
                    <th className="w-10">
                        <input 
                            type="checkbox" 
                            className="checkbox checkbox-sm checkbox-accent" 
                            checked={selectedIds.length === volunteers.length && volunteers.length > 0}
                            onChange={toggleSelectAll}
                        />
                    </th>
                    <th className="font-bold py-4">Voluntar</th>
                    <th className="font-bold">Contact</th>
                    <th className="font-bold">Categorie</th>
                    <th className="font-bold">Status Waitwhile</th>
                    <th className="font-bold text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200/50">
                {volunteers.map((v) => (
                  <tr key={v.$id} className="group hover:bg-base-200/20 transition-all">
                    <td className="py-4">
                        <input 
                            type="checkbox" 
                            className="checkbox checkbox-sm checkbox-accent" 
                            checked={selectedIds.includes(v.$id!)}
                            onChange={() => toggleSelection(v.$id!)}
                        />
                    </td>
                    <td className="py-4">
                        <div className="flex items-center gap-3">
                            <div className="avatar placeholder">
                                <div className="bg-gradient-to-br from-base-200 to-base-300 text-base-content/40 rounded-xl w-10">
                                    <span className="text-xs font-bold">{v.firstName?.[0]}{v.lastName?.[0]}</span>
                                </div>
                            </div>
                            <div>
                                <Link 
                                    href={`/projects/${projectId}/volunteers/${v.$id}`}
                                    className="font-bold text-base-content hover:text-accent transition-colors"
                                >
                                    {v.firstName} {v.lastName}
                                </Link>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`badge badge-xs ${v.status === 'active' ? 'badge-success' : 'badge-ghost'} font-bold`}>{v.status}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td className="py-4">
                        <div className="flex flex-col text-xs gap-1 opacity-60">
                            {v.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {v.email}</div>}
                            {v.phone && <div className="flex items-center gap-1.5"><Phone size={12} /> {v.phone}</div>}
                        </div>
                    </td>
                    <td className="py-4">
                        <span className="px-2.5 py-1 rounded-xl bg-base-200 text-base-content/70 text-[10px] font-black tracking-wider uppercase border border-base-300">
                            {v.activityCategory}
                        </span>
                    </td>
                    <td className="py-4">
                        {v.waitwhileAccountCreated ? (
                            <div className="flex items-center gap-3 group/status">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                    <span className="text-xs font-bold text-success/80">Activ</span>
                                </div>
                                <div className="hidden group-hover/status:flex items-center ml-2 space-x-2">
                                    <span className="text-[10px] opacity-40 italic">{v.waitwhileEmailUsed}</span>
                                    <button 
                                        onClick={() => handleWWDelete(v.$id!)} 
                                        className="btn btn-ghost btn-xs btn-circle text-error/30 hover:text-error hover:bg-error/10"
                                        title="Șterge cont Waitwhile"
                                        disabled={isProcessingWW}
                                    >
                                        <XCircle size={12} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 group/status">
                                <div className="flex items-center gap-2 opacity-30">
                                    <div className="w-2 h-2 rounded-full bg-base-content/20" />
                                    <span className="text-xs font-bold">Fără cont</span>
                                </div>
                                <button 
                                    onClick={() => handleWWCreate(v.$id!)} 
                                    className="hidden group-hover/status:flex btn btn-ghost btn-xs gap-1 rounded-lg text-primary hover:bg-primary/10 transition-all"
                                    disabled={isProcessingWW}
                                >
                                    <UserPlus size={12} /> Crează
                                </button>
                            </div>
                        )}
                    </td>
                    <td className="text-right py-4">
                        <div className="flex justify-end gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditModal(v)} className="btn btn-ghost btn-xs btn-square hover:bg-accent/10 hover:text-accent">
                                <Edit2 size={14} />
                            </button>
                            <Link 
                                href={`/projects/${projectId}/volunteers/${v.$id}`}
                                className="btn btn-ghost btn-xs btn-square hover:bg-primary/10 hover:text-primary"
                            >
                                <ExternalLink size={14} />
                            </Link>
                            <button onClick={() => handleDelete(v.$id!)} className="btn btn-ghost btn-xs btn-square hover:bg-error/10 hover:text-error">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <VolunteerModal 
        isOpen={isVolunteerModalOpen}
        onClose={() => setIsVolunteerModalOpen(false)}
        onSuccess={fetchVolunteers}
        projectId={projectId!}
        volunteer={editingVolunteer}
        categories={categories}
      />

      <ImportVolunteersModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={fetchVolunteers}
        projectId={projectId!}
        categories={categories}
      />
    </div>
  );
}

function formatAssignmentDate(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(parseISO(value), 'EEE, d MMM', { locale: ro });
  } catch {
    return value;
  }
}
