'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Mail, Phone, Calendar, Clock, 
  CheckCircle2, AlertCircle, Trash2,
  ExternalLink, UserPlus, XCircle,
  FileText, Award, CreditCard, History
} from 'lucide-react';
import { getVolunteer, ProjectVolunteer, deleteVolunteer } from '@/app/actions/volunteers';
import { getVolunteerAttendanceEntries, AttendanceEntry } from '@/app/actions/attendance';
import { createWaitwhileAccountAction, deleteWaitwhileAccountAction } from '@/app/actions/volunteer-waitwhile';
import { getProject, Project } from '@/app/actions/projects';

export default function VolunteerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const volunteerId = typeof params.volunteerId === 'string' ? params.volunteerId : params.volunteerId?.[0];
  const projectId = typeof params.id === 'string' ? params.id : params.id?.[0];

  const [volunteer, setVolunteer] = useState<ProjectVolunteer | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingWW, setIsProcessingWW] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!volunteerId || !projectId) return;
      setIsLoading(true);
      const [volRes, attRes, projRes] = await Promise.all([
        getVolunteer(volunteerId),
        getVolunteerAttendanceEntries(volunteerId),
        getProject(projectId)
      ]);

      if (volRes.success) setVolunteer(volRes.data!);
      if (attRes.success) setAttendance(attRes.data || []);
      if (projRes.success) setProject(projRes.data!);
      
      setIsLoading(false);
    };
    fetchData();
  }, [volunteerId, projectId]);

  const handleWWCreate = async () => {
    if (!volunteer) return;
    setIsProcessingWW(true);
    const res = await createWaitwhileAccountAction(volunteer.$id!);
    if (res.success) {
        const updated = await getVolunteer(volunteer.$id!);
        if (updated.success) setVolunteer(updated.data!);
    } else {
        alert(res.error);
    }
    setIsProcessingWW(false);
  };

  const handleWWDelete = async () => {
    if (!volunteer || !window.confirm('Sigur doriți să ștergeți contul Waitwhile?')) return;
    setIsProcessingWW(true);
    const res = await deleteWaitwhileAccountAction(volunteer.$id!);
    if (res.success) {
        const updated = await getVolunteer(volunteer.$id!);
        if (updated.success) setVolunteer(updated.data!);
    } else {
        alert(res.error);
    }
    setIsProcessingWW(false);
  };

  const handleDelete = async () => {
    if (!volunteer || !window.confirm('Sigur doriți să ștergeți acest voluntar definitiv?')) return;
    const res = await deleteVolunteer(volunteer.$id!);
    if (res.success) {
        router.push(`/projects/${projectId}/volunteers`);
    } else {
        alert(res.error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-xs font-bold opacity-30 uppercase tracking-widest">Se încarcă profilul...</p>
      </div>
    );
  }

  if (!volunteer) {
    return (
      <div className="alert alert-error max-w-lg mx-auto mt-20">
        <AlertCircle />
        <span>Voluntarul nu a fost găsit.</span>
        <Link href={`/projects/${projectId}/volunteers`} className="btn btn-ghost btn-sm">Înapoi</Link>
      </div>
    );
  }

  const totalHours = attendance.reduce((acc, curr) => acc + (curr.totalHoursDecimal || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}/volunteers`} className="btn btn-ghost btn-circle">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              {volunteer.firstName} {volunteer.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge badge-outline badge-sm font-medium uppercase tracking-[0.14em]">{volunteer.activityCategory}</span>
              <span className={`badge badge-sm font-medium ${volunteer.status === 'active' ? 'badge-success' : 'badge-ghost'}`}>
                {volunteer.status === 'active' ? 'ACTIV' : 'INACTIV'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {project?.projectSlug && (
            <a
              href={`/v/${project.projectSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm gap-2 rounded-xl"
            >
              <ExternalLink size={16} /> Portal Public
            </a>
          )}
          <button onClick={handleDelete} className="btn btn-ghost btn-sm text-error gap-2 rounded-xl">
            <Trash2 size={16} /> Șterge
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-sm">
            <div className="border-b border-base-200 bg-base-200/35 p-6 text-center">
              <div className="avatar placeholder mb-4">
                <div className="h-20 w-20 rounded-2xl bg-base-200 text-accent">
                  <span className="text-2xl font-semibold">{volunteer.firstName?.[0]}{volunteer.lastName?.[0]}</span>
                </div>
              </div>
              <h2 className="text-xl font-semibold">{volunteer.firstName} {volunteer.lastName}</h2>
              <p className="text-xs text-base-content/50 font-medium">Voluntar din {new Date(volunteer.$createdAt!).toLocaleDateString('ro-RO')}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-accent">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold opacity-35 uppercase tracking-[0.16em]">Email</p>
                  <p className="font-bold">{volunteer.email || 'Nespecificat'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-accent">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold opacity-35 uppercase tracking-[0.16em]">Telefon</p>
                  <p className="font-bold">{volunteer.phone || 'Nespecificat'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-accent">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold opacity-35 uppercase tracking-[0.16em]">Adresă</p>
                  <p className="font-bold">{volunteer.address || 'Nespecificată'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-accent">
                  <CreditCard size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold opacity-35 uppercase tracking-[0.16em]">Identitate</p>
                  <p className="font-bold">
                    {volunteer.cnp || volunteer.identitySeries || volunteer.identityNumber
                      ? `CNP ${volunteer.cnp || '-'} • CI ${volunteer.identitySeries || '-'} ${volunteer.identityNumber || '-'}`
                      : 'Nespecificată'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Waitwhile Status */}
          <div className="card overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-sm">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Status Waitwhile</h3>
                {volunteer.waitwhileAccountCreated ? (
                  <span className="badge badge-success badge-sm font-medium">ACTIV</span>
                ) : (
                  <span className="badge badge-ghost badge-sm font-medium">FĂRĂ CONT</span>
                )}
              </div>

              {volunteer.waitwhileAccountCreated ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-base-200 bg-base-200/40 p-4">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-base-content/45">Email utilizat</p>
                    <p className="break-all font-mono text-sm font-semibold text-base-content/80">{volunteer.waitwhileEmailUsed}</p>
                  </div>
                  <button 
                    onClick={handleWWDelete}
                    className="btn btn-outline btn-error btn-sm w-full gap-2 rounded-xl"
                    disabled={isProcessingWW}
                  >
                    {isProcessingWW ? <span className="loading loading-spinner loading-xs"></span> : <XCircle size={14} />}
                    Dezactivează Contul
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-base-content/50 leading-relaxed italic text-center">
                    Acest voluntar nu are încă un cont Waitwhile configurat pentru acest proiect.
                  </p>
                  <button 
                    onClick={handleWWCreate}
                    className="btn btn-primary btn-sm w-full gap-2 rounded-xl"
                    disabled={isProcessingWW}
                  >
                    {isProcessingWW ? <span className="loading loading-spinner loading-xs"></span> : <UserPlus size={14} />}
                    Crează Cont Waitwhile
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Attendance & Stats */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-base-content/45">
                <Clock size={16} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Ore totale</p>
              </div>
              <p className="text-3xl font-semibold text-base-content">{totalHours.toFixed(1)}</p>
            </div>
            <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-base-content/45">
                <Calendar size={16} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Prezențe</p>
              </div>
              <p className="text-3xl font-semibold text-base-content">{attendance.length}</p>
            </div>
            <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-base-content/45">
                <History size={16} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Validări</p>
              </div>
              <p className="text-3xl font-semibold text-base-content">
                {attendance.filter(a => a.coordinatorValidated).length}
              </p>
            </div>
          </div>

          {/* Attendance History */}
          <div className="card rounded-2xl border border-base-200 bg-base-100 p-6 shadow-sm sm:p-8">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <History className="text-primary" /> Istoric Prezență
              </h3>
            </div>

            <div className="overflow-x-auto">
              {attendance.length === 0 ? (
                <div className="text-center py-20 opacity-30">
                  <Clock size={48} className="mx-auto mb-4" strokeWidth={1} />
                  <p className="font-bold">Nu există încă prezențe înregistrate</p>
                  <p className="text-xs italic">După primul check-in, istoricul voluntarului va apărea aici.</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr className="border-b-2 border-base-200">
                      <th className="pl-0 text-xs font-semibold uppercase tracking-[0.16em]">Data</th>
                      <th className="text-xs font-semibold uppercase tracking-[0.16em]">Interval</th>
                      <th className="text-center text-xs font-semibold uppercase tracking-[0.16em]">Durată</th>
                      <th className="text-right text-xs font-semibold uppercase tracking-[0.16em]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200/50">
                    {attendance.map((entry) => (
                      <tr key={entry.$id} className="hover:bg-base-200/30 transition-all">
                        <td className="py-4 pl-0">
                          <p className="font-bold">{new Date(entry.attendanceDate).toLocaleDateString('ro-RO', { day: '2-digit', month: 'long' })}</p>
                          <p className="text-[10px] opacity-40 uppercase font-semibold tracking-[0.14em]">{entry.departmentRole}</p>
                        </td>
                        <td className="py-4 font-medium text-xs">
                          <div className="flex items-center gap-2">
                            <span className="opacity-60">{entry.checkInAt ? new Date(entry.checkInAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            <span className="opacity-20">→</span>
                            <span className="font-bold">{entry.checkOutAt ? new Date(entry.checkOutAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : 'ACTIV'}</span>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <span className="badge badge-ghost font-bold text-xs">{entry.totalHoursDecimal?.toFixed(1) || '0.0'} ore</span>
                        </td>
                        <td className="text-right py-4">
                          {entry.coordinatorValidated ? (
                            <div className="flex items-center justify-end gap-1 text-success">
                              <CheckCircle2 size={14} />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Validat</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 opacity-20">
                              <Clock size={14} />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Preluat</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Future Modules Placeholders */}
          <div className="pointer-events-none grid grid-cols-2 gap-4 opacity-50 grayscale">
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-base-300 bg-base-100 p-6">
              <div className="flex items-center gap-4">
                <CreditCard className="text-base-content/40" />
                <span className="text-sm font-bold">Generare Ecuson</span>
              </div>
              <span className="rounded-lg bg-base-200 px-2 py-1 text-[10px] font-semibold uppercase">În curând</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-base-300 bg-base-100 p-6">
              <div className="flex items-center gap-4">
                <Award className="text-base-content/40" />
                <span className="text-sm font-bold">Generare Diplomă</span>
              </div>
              <span className="rounded-lg bg-base-200 px-2 py-1 text-[10px] font-semibold uppercase">În curând</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
