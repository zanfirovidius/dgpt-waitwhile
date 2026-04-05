'use client';

import { AttendanceConfig, getProjectAttendanceConfig } from '@/app/actions/attendance-config';
import { FeedbackConfig, getProjectFeedbackConfig } from '@/app/actions/feedback-config';
import { deleteProject, getProject, Project, updateProject } from '@/app/actions/projects';
import { ProjectTagBadges } from '@/components/projects/ProjectTagBadges';
import { ProjectTagPicker } from '@/components/projects/ProjectTagPicker';
import { ProjectStatusSwitch } from '@/components/projects/ProjectStatusSwitch';
import { getProjectStatusBadgeClass, getProjectStatusLabel, normalizeProjectStatus } from '@/lib/project-status';
import { sendVolunteerPortalTestSms } from '@/app/actions/volunteer-portal';
import { formatProjectDateRange } from '@/lib/project-dates';
import {
  AlertCircle, ArrowLeft,
  BarChart3,
  Clock,
  Edit2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  MapPin, MessageSquare,
  Save,
  Stethoscope,
  Smartphone,
  Trash2,
  Users,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type LoadedProjectState = {
  project: Project | null;
  feedbackConfig: FeedbackConfig | null;
  attendanceConfig: AttendanceConfig | null;
  error: string;
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Project>>({});
  const [feedbackConfig, setFeedbackConfig] = useState<FeedbackConfig | null>(null);
  const [attendanceConfig, setAttendanceConfig] = useState<AttendanceConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSmsTestOpen, setIsSmsTestOpen] = useState(false);
  const [isSendingSmsTest, setIsSendingSmsTest] = useState(false);
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTestMessage, setSmsTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [error, setError] = useState('');
  const [newVolunteerRole, setNewVolunteerRole] = useState('');

  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const loadProjectState = useCallback(async (): Promise<LoadedProjectState | null> => {
    if (!id) {
      return null;
    }

    const res = await getProject(id);

    if (!res.success || !res.data) {
      return {
        project: null,
        feedbackConfig: null,
        attendanceConfig: null,
        error: res.error || 'Proiectul nu a fost găsit',
      };
    }

    const [fRes, aRes] = await Promise.all([
      getProjectFeedbackConfig(id),
      getProjectAttendanceConfig(id),
    ]);

    return {
      project: res.data,
      feedbackConfig: fRes.success ? fRes.data ?? null : null,
      attendanceConfig: aRes.success ? aRes.data ?? null : null,
      error: '',
    };
  }, [id]);

  const refreshData = useCallback(async () => {
    const loadedState = await loadProjectState();

    if (!loadedState) {
      return;
    }

    setProject(loadedState.project);
    setEditData(loadedState.project ?? {});
    setFeedbackConfig(loadedState.feedbackConfig);
    setAttendanceConfig(loadedState.attendanceConfig);
    setError(loadedState.error);
    setIsLoading(false);
  }, [loadProjectState]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loadedState = await loadProjectState();

      if (!loadedState || cancelled) {
        return;
      }

      setProject(loadedState.project);
      setEditData(loadedState.project ?? {});
      setFeedbackConfig(loadedState.feedbackConfig);
      setAttendanceConfig(loadedState.attendanceConfig);
      setError(loadedState.error);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadProjectState]);

  const handleUpdate = async () => {
    if (!id || !editData) return;
    setIsSaving(true);
    const res = await updateProject(id, editData);
    if (res.success) {
      await refreshData();
      setNewVolunteerRole('');
      setIsEditing(false);
    } else {
      alert(res.error || 'Eroare la actualizarea proiectului');
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm('Sigur doriți să ștergeți acest proiect? Această acțiune va șterge, de asemenea, configurația de feedback și trimiterile asociate. Această acțiune nu poate fi anulată.')) return;
    
    setIsDeleting(true);
    const res = await deleteProject(id);
    if (res.success) {
      router.push('/projects');
    } else {
      alert(res.error || 'Eroare la ștergerea proiectului');
      setIsDeleting(false);
    }
  };

  const handleSendSmsTest = async () => {
    if (!project?.projectSlug) {
      setSmsTestMessage({
        type: 'error',
        text: 'Proiectul nu are încă un slug public pentru portalul voluntarului.',
      });
      return;
    }

    setIsSendingSmsTest(true);
    setSmsTestMessage(null);

    const res = await sendVolunteerPortalTestSms({
      projectSlug: project.projectSlug,
      phone: smsTestPhone,
    });

    if (res.success) {
      setSmsTestMessage({
        type: 'success',
        text: `SMS de test trimis pe ${res.data.maskedPhone} prin ${res.data.provider.toUpperCase()}.`,
      });
    } else {
      setSmsTestMessage({
        type: 'error',
        text: res.error || 'Nu am putut trimite SMS-ul de test.',
      });
    }

    setIsSendingSmsTest(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <div className="flex justify-center mb-4 text-error/30">
          <AlertCircle size={48} />
        </div>
        <h3 className="text-lg font-semibold text-base-content/60">{error || 'Proiectul nu a fost găsit'}</h3>
        <Link href="/projects" className="btn btn-sm btn-ghost mt-4 gap-2">
          <ArrowLeft size={16} /> Înapoi la Proiecte
        </Link>
      </div>
    );
  }

  const formattedDate = formatProjectDateRange(project, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-8xl">
      <div className="flex items-center justify-between">
        <Link href="/projects" className="btn btn-ghost btn-sm gap-2 text-base-content/60 hover:text-base-content">
          <ArrowLeft size={16} /> Proiecte
        </Link>
        <div className="flex gap-2">
            {!isEditing ? (
              <>
                <button onClick={() => setIsEditing(true)} className="btn btn-ghost btn-sm gap-2">
                  <Edit2 size={14} /> Editează
                </button>
                <button onClick={handleDelete} className="btn btn-ghost btn-sm text-error/60 hover:text-error gap-2" disabled={isDeleting}>
                  {isDeleting ? <span className="loading loading-spinner loading-xs"></span> : <Trash2 size={14} />} 
                  Șterge
                </button>
              </>
            ) : (
                <>
                  <button onClick={() => setIsEditing(false)} className="btn btn-ghost btn-sm gap-2" disabled={isSaving}>
                    <X size={14} /> Anulează
                  </button>
                  <button onClick={handleUpdate} className="btn btn-primary btn-sm gap-2" disabled={isSaving}>
                    {isSaving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={14} />} 
                    Salvează
                  </button>
                </>
            )}
        </div>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        {isEditing ? (
            <div className="space-y-4 animate-in fade-in duration-300">
                <div className="form-control">
                    <label className="label"><span className="label-text font-bold">Nume Proiect</span></label>
                    <input 
                      type="text" 
                      className="input input-bordered w-full" 
                      value={editData.name || ''} 
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })} 
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold">Data Început</span></label>
                        <input 
                          type="date" 
                          className="input input-bordered w-full" 
                          value={editData.startDate || ''} 
                          onChange={(e) => setEditData({ ...editData, startDate: e.target.value })} 
                        />
                    </div>
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold">Data Sfârșit</span></label>
                        <input 
                          type="date" 
                          className="input input-bordered w-full" 
                          value={editData.endDate || ''} 
                          onChange={(e) => setEditData({ ...editData, endDate: e.target.value })} 
                        />
                    </div>
                </div>
                <div className="form-control">
                    <label className="label"><span className="label-text font-bold">Locație / Sală</span></label>
                    <input 
                      type="text" 
                      className="input input-bordered w-full" 
                      value={editData.locationName || ''} 
                      onChange={(e) => setEditData({ ...editData, locationName: e.target.value })} 
                    />
                </div>

                <div className="form-control gap-3">
                    <label className="label"><span className="label-text font-bold">Status proiect</span></label>
                    <ProjectStatusSwitch
                      value={normalizeProjectStatus(editData.projectStatus as string | undefined)}
                      onChange={(value) => setEditData({ ...editData, projectStatus: value })}
                      disabled={isSaving}
                    />
                    <label className="label">
                      <span className="label-text-alt text-base-content/50">Controlează explicit dacă proiectul este în draft, activ sau încheiat.</span>
                    </label>
                </div>

                <div className="form-control gap-3">
                    <label className="label"><span className="label-text font-bold">Etichete regionale</span></label>
                    <ProjectTagPicker
                      value={editData.projectTags}
                      onChange={(projectTags) => setEditData({ ...editData, projectTags })}
                      disabled={isSaving}
                    />
                    <label className="label">
                      <span className="label-text-alt text-base-content/50">Poți asocia una sau mai multe regiuni proiectului pentru afișare și calendar.</span>
                    </label>
                </div>

                <div className="divider opacity-50 text-[10px] uppercase font-bold tracking-widest">Metadate Eveniment (Formular Public)</div>

                <div className="form-control">
                    <label className="label"><span className="label-text font-bold">Nume Eveniment (Afișat)</span></label>
                    <input 
                      type="text" 
                      className="input input-bordered w-full" 
                      value={editData.eventName || ''} 
                      onChange={(e) => setEditData({ ...editData, eventName: e.target.value })} 
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold">Oraș</span></label>
                        <input 
                          type="text" 
                          className="input input-bordered w-full" 
                          value={editData.city || ''} 
                          onChange={(e) => setEditData({ ...editData, city: e.target.value })} 
                        />
                    </div>
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold">Detalii Sală</span></label>
                        <input 
                          type="text" 
                          className="input input-bordered w-full" 
                          value={editData.venue || ''} 
                          onChange={(e) => setEditData({ ...editData, venue: e.target.value })} 
                        />
                    </div>
                </div>
                <div className="form-control">
                    <label className="label"><span className="label-text font-bold">Suffix Email Waitwhile</span></label>
                    <input 
                      type="text" 
                      placeholder="@dgpt.ro"
                      className="input input-bordered w-full" 
                      value={editData.waitwhileEmailDomainSuffix || ''} 
                      onChange={(e) => setEditData({ ...editData, waitwhileEmailDomainSuffix: e.target.value })} 
                    />
                    <label className="label">
                      <span className="label-text-alt text-base-content/50">Folosit pentru generarea conturilor de voluntari (ex: @dgpt-cj.ro)</span>
                    </label>
                </div>

                <div className="divider opacity-50 text-[10px] uppercase font-bold tracking-widest">Setări Voluntari</div>

                <div className="space-y-4 rounded-2xl border border-base-200 bg-base-200/30 p-5">
                  <div>
                    <h3 className="font-bold text-base-content">Roluri & Departamente</h3>
                    <p className="text-xs text-base-content/50 mt-1">
                      Aceste roluri sunt folosite atât în formularul de prezență, cât și în registrul de voluntari și la import.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(editData.volunteerRoles || []).map((role, idx) => (
                      <div key={`${role}-${idx}`} className="badge badge-lg border-base-300 gap-2 pr-1 h-10 pl-4 rounded-xl">
                        <span className="text-xs font-bold font-mono tracking-tight">{role}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-circle btn-sm hover:bg-error hover:text-white"
                          aria-label={`Elimină rolul ${role}`}
                          onClick={() =>
                            setEditData({
                              ...editData,
                              volunteerRoles: (editData.volunteerRoles || []).filter((_, roleIndex) => roleIndex !== idx),
                            })
                          }
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {(editData.volunteerRoles || []).length === 0 && (
                      <p className="text-[10px] italic opacity-30">Nu există roluri configurate pentru acest proiect.</p>
                    )}
                  </div>

                  <div className="join w-full max-w-md">
                    <input
                      type="text"
                      className="input input-bordered join-item flex-1 rounded-l-2xl"
                      placeholder="Ex: LOGISTICĂ"
                      value={newVolunteerRole}
                      onChange={(e) => setNewVolunteerRole(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') {
                          return;
                        }

                        e.preventDefault();
                        const normalizedRole = newVolunteerRole.trim().toUpperCase();
                        if (!normalizedRole) {
                          return;
                        }

                        const currentRoles = editData.volunteerRoles || [];
                        if (currentRoles.includes(normalizedRole)) {
                          setNewVolunteerRole('');
                          return;
                        }

                        setEditData({
                          ...editData,
                          volunteerRoles: [...currentRoles, normalizedRole],
                        });
                        setNewVolunteerRole('');
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary join-item rounded-r-2xl"
                      onClick={() => {
                        const normalizedRole = newVolunteerRole.trim().toUpperCase();
                        if (!normalizedRole) {
                          return;
                        }

                        const currentRoles = editData.volunteerRoles || [];
                        if (currentRoles.includes(normalizedRole)) {
                          setNewVolunteerRole('');
                          return;
                        }

                        setEditData({
                          ...editData,
                          volunteerRoles: [...currentRoles, normalizedRole],
                        });
                        setNewVolunteerRole('');
                      }}
                    >
                      Adaugă
                    </button>
                  </div>
                </div>
            </div>
        ) : (
            <>
                <div className="flex items-start justify-between gap-4 mb-6">
	                <div>
	                    <h2 className="text-2xl font-extrabold tracking-tight text-base-content">{project.name}</h2>
	                    <p className="text-sm text-primary font-medium mt-1 capitalize">{formattedDate}</p>
                      <ProjectTagBadges tags={project.projectTags} className="mt-3" size="md" />
	                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`badge badge-lg gap-1.5 py-3 ${getProjectStatusBadgeClass(project.projectStatus)}`}>
                    {getProjectStatusLabel(project.projectStatus)}
                  </div>
                  <div className="badge badge-outline badge-lg gap-1.5 py-3">
                    <MapPin size={14} className="text-primary" /> {project.locationName}
                  </div>
                </div>
                </div>

                <div className="divider"></div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-4 mb-8 text-sm">
                   <div>
                       <span className="block opacity-40 font-bold uppercase text-[10px] tracking-wider mb-1">Status Proiect</span>
                       <span className="font-medium">{getProjectStatusLabel(project.projectStatus)}</span>
                   </div>
                   <div>
                       <span className="block opacity-40 font-bold uppercase text-[10px] tracking-wider mb-1">Nume Eveniment</span>
                       <span className="font-medium">{project.eventName || '-'}</span>
                   </div>
	                   <div>
	                       <span className="block opacity-40 font-bold uppercase text-[10px] tracking-wider mb-1">Oraș / Sală</span>
	                       <span className="font-medium">{project.city || '-'}{project.city && project.venue ? ' / ' : ''}{project.venue || '-'}</span>
	                   </div>
                     <div>
                       <span className="block opacity-40 font-bold uppercase text-[10px] tracking-wider mb-1">Etichete regionale</span>
                       {project.projectTags && project.projectTags.length > 0 ? (
                         <ProjectTagBadges tags={project.projectTags} />
                       ) : (
                         <span className="font-medium">-</span>
                       )}
                     </div>
	                </div>

                <div className="bg-base-200/40 rounded-2xl p-6 border border-base-200 mb-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                          <Users size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-base-content">Voluntari & Waitwhile</h3>
                          <p className="text-xs text-base-content/50">Setări comune pentru registru, import și prezență</p>
                        </div>
                      </div>

                      <div>
                        <span className="block opacity-40 font-bold uppercase text-[10px] tracking-wider mb-1">Suffix Email Waitwhile</span>
                        <span className="font-medium">{project.waitwhileEmailDomainSuffix || '@dgpt.ro'}</span>
                      </div>
                    </div>

                    <div className="md:max-w-xl">
                      <span className="block opacity-40 font-bold uppercase text-[10px] tracking-wider mb-2">Roluri & Departamente</span>
                      <div className="flex flex-wrap gap-2">
                        {(project.volunteerRoles || []).map((role) => (
                          <div key={role} className="badge badge-lg border-base-300 h-10 px-4 rounded-xl">
                            <span className="text-xs font-bold font-mono tracking-tight">{role}</span>
                          </div>
                        ))}
                        {(project.volunteerRoles || []).length === 0 && (
                          <span className="text-sm text-base-content/50">Nu există roluri configurate.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <MessageSquare size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base-content">Formular Feedback Public</h3>
                        <p className="text-xs text-base-content/50">Colectați și gestionați răspunsurile proiectului</p>
                      </div>
                    </div>
                    <Link 
                        href={`/projects/${project.$id}/feedback`}
                        className="btn btn-primary btn-sm gap-2"
                    >
                        Gestionează Feedback
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {feedbackConfig && (
                      <>
                        <div className={`badge badge-outline badge-md gap-1.5 py-3 ${feedbackConfig.publicFeedbackFormStatus === 'active' ? 'opacity-100' : 'opacity-60'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${feedbackConfig.publicFeedbackFormStatus === 'active' ? 'bg-success animate-pulse' : 'bg-base-content/30'}`} />
                          {feedbackConfig.publicFeedbackFormStatus === 'active' ? 'Activ' : feedbackConfig.publicFeedbackFormStatus === 'inactive' ? 'Inactiv' : 'Schiță'}
                        </div>
                        {feedbackConfig.publicFeedbackFormStatus === 'active' && project.projectSlug && (
                          <a 
                            href={`/f/${project.projectSlug}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="badge badge-outline badge-md gap-1.5 py-3 hover:bg-base-content hover:text-base-100 transition-colors"
                          >
                            Vezi Formular Feedback <ExternalLink size={12} />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-secondary/5 rounded-2xl p-6 border border-secondary/10 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                        <Clock size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base-content">Prezență Voluntari</h3>
                        <p className="text-xs text-base-content/50">Gestionați orele și semnăturile echipei</p>
                      </div>
                    </div>
                    <Link 
                      href={`/projects/${project.$id}/attendance`}
                      className="btn btn-secondary btn-sm gap-2"
                    >
                      Gestionează Prezență
                    </Link>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {attendanceConfig && (
                      <>
                        <div className={`badge badge-outline badge-md gap-1.5 py-3 ${attendanceConfig.attendanceEnabled ? 'opacity-100' : 'opacity-60'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${attendanceConfig.attendanceEnabled ? 'bg-success animate-pulse' : 'bg-base-content/30'}`} />
                          {attendanceConfig.attendanceEnabled ? 'Activ' : 'Inactiv'}
                        </div>
                        {attendanceConfig.attendanceEnabled && project.projectSlug && (
                          <a 
                            href={`/a/${project.projectSlug}/attendance`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="badge badge-outline badge-md gap-1.5 py-3 hover:bg-base-content hover:text-base-100 transition-colors"
                          >
                            Vezi Formular Prezență <ExternalLink size={12} />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-accent/5 rounded-2xl p-6 border border-accent/10 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base-content">Instructaj Colectiv SSM/SU</h3>
                        <p className="text-xs text-base-content/50">Colectare semnături, validare instructor și PDF final arhivat</p>
                      </div>
                    </div>
                    <Link 
                      href={`/projects/${project.$id}/training`}
                      className="btn btn-accent btn-sm gap-2"
                    >
                      Gestionează Instructajul
                    </Link>
                  </div>
                </div>

                <div className="bg-secondary/5 rounded-2xl p-6 border border-secondary/10 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                        <Stethoscope size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base-content">Cabinete Medicale & Program</h3>
                        <p className="text-xs text-base-content/50">
                          Structură pe cabinete, materiale și asignări pe zile și intervale
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/projects/${project.$id}/cabinets`}
                      className="btn btn-secondary btn-sm gap-2"
                    >
                      Gestionează Cabinetele
                    </Link>
                  </div>
                </div>

                <div className="bg-warning/5 rounded-2xl p-6 border border-warning/10 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center text-warning">
                        <BarChart3 size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base-content">Occupancy Waitwhile</h3>
                        <p className="text-xs text-base-content/50">
                          Grad de ocupare preconfigurat pe locația și perioada proiectului
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/projects/${project.$id}/occupancy`}
                      className="btn btn-warning btn-sm gap-2"
                    >
                      Vezi Occupancy
                    </Link>
                  </div>
                </div>

                <div className="bg-error/5 rounded-2xl p-6 border border-error/10 mt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error">
                          <ShieldAlert size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-base-content">Incidente GDPR / Securitate</h3>
                          <p className="text-xs text-base-content/50">Raportare publică, evaluare DPO, registru și audit trail</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {project.projectSlug && (
                          <a
                            href={`/i/${project.projectSlug}/incident`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm gap-2"
                          >
                            Formular Public <ExternalLink size={14} />
                          </a>
                        )}
                        <Link 
                          href={`/projects/${project.$id}/incident-registry`}
                          className="btn btn-outline btn-sm gap-2"
                        >
                          Registru Oficial
                        </Link>
                        <Link 
                          href={`/projects/${project.$id}/incidents`}
                          className="btn btn-error btn-sm gap-2"
                        >
                          Gestionează Incidentele
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-accent/5 rounded-2xl p-6 border border-accent/10 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                        <Users size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base-content">Registru Voluntari</h3>
                        <p className="text-xs text-base-content/50">Import, CRUD și sincronizare Waitwhile</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {project.projectSlug && (
                        <a
                          href={`/v/${project.projectSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm gap-2"
                        >
                          Portal Public <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline btn-sm gap-2"
                        onClick={() => {
                          setIsSmsTestOpen((current) => !current);
                          setSmsTestMessage(null);
                        }}
                        disabled={!project.projectSlug}
                      >
                        <Smartphone size={14} />
                        Testează SMS OTP
                      </button>
                      <Link 
                        href={`/projects/${project.$id}/volunteers`}
                        className="btn btn-accent btn-sm gap-2"
                      >
                        Gestionează Voluntari
                      </Link>
                    </div>
                  </div>
                  {isSmsTestOpen && (
                    <div className="mt-4 rounded-2xl border border-accent/15 bg-base-100/80 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                        <label className="form-control flex-1">
                          <span className="label">
                            <span className="label-text font-semibold">Telefon pentru test OTP</span>
                          </span>
                          <input
                            type="tel"
                            className="input input-bordered w-full"
                            placeholder="07xxxxxxxx sau +407xxxxxxxx"
                            value={smsTestPhone}
                            onChange={(event) => setSmsTestPhone(event.target.value)}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-accent btn-sm gap-2"
                            onClick={handleSendSmsTest}
                            disabled={isSendingSmsTest || !smsTestPhone.trim()}
                          >
                            {isSendingSmsTest ? <span className="loading loading-spinner loading-xs" /> : <Smartphone size={14} />}
                            Trimite test
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setIsSmsTestOpen(false);
                              setSmsTestMessage(null);
                            }}
                          >
                            Închide
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-base-content/60">
                        Trimite un OTP real către numărul introdus, folosind providerul SMS configurat pentru portalul voluntarului.
                      </p>
                      {smsTestMessage && (
                        <div className={`mt-3 alert rounded-xl text-sm ${smsTestMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                          <AlertCircle size={16} />
                          <span>{smsTestMessage.text}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </>
        )}
      </div>
    </div>
  );
}
