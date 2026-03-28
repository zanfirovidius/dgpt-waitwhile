'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, User, Mail, Phone, Calendar, Clock, 
  CheckCircle2, AlertCircle, Trash2, Edit2, 
  ExternalLink, UserCheck, UserPlus, XCircle,
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
  const [error, setError] = useState('');

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
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}/volunteers`} className="btn btn-ghost btn-circle">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
              {volunteer.firstName} {volunteer.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge badge-accent badge-sm font-bold uppercase tracking-wider">{volunteer.activityCategory}</span>
              <span className={`badge badge-sm font-bold ${volunteer.status === 'active' ? 'badge-success' : 'badge-ghost'}`}>
                {volunteer.status === 'active' ? 'ACTIV' : 'INACTIV'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete} className="btn btn-ghost btn-sm text-error gap-2 rounded-xl">
            <Trash2 size={16} /> Șterge
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card bg-base-100 border border-base-200 shadow-xl rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-accent/20 via-base-100 to-base-100 p-8 text-center border-b border-base-200">
              <div className="avatar placeholder mb-4">
                <div className="bg-gradient-to-br from-accent/40 to-accent/60 text-white rounded-3xl w-24 h-24 shadow-2xl shadow-accent/20">
                  <span className="text-3xl font-black">{volunteer.firstName?.[0]}{volunteer.lastName?.[0]}</span>
                </div>
              </div>
              <h2 className="text-xl font-bold">{volunteer.firstName} {volunteer.lastName}</h2>
              <p className="text-xs text-base-content/50 font-medium">Voluntar din {new Date(volunteer.$createdAt!).toLocaleDateString('ro-RO')}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-accent">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Email</p>
                  <p className="font-bold">{volunteer.email || 'Nespecificat'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-accent">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Telefon</p>
                  <p className="font-bold">{volunteer.phone || 'Nespecificat'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Waitwhile Status */}
          <div className="card bg-base-100 border border-base-200 shadow-xl rounded-3xl overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] opacity-40">Status Waitwhile</h3>
                {volunteer.waitwhileAccountCreated ? (
                  <span className="badge badge-success badge-sm font-black">ACTIV</span>
                ) : (
                  <span className="badge badge-ghost badge-sm font-black">FĂRĂ CONT</span>
                )}
              </div>

              {volunteer.waitwhileAccountCreated ? (
                <div className="space-y-4">
                  <div className="bg-success/5 border border-success/20 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-success/60 uppercase tracking-wider mb-1">Email Utilizat</p>
                    <p className="text-sm font-mono font-bold text-success break-all">{volunteer.waitwhileEmailUsed}</p>
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
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-primary/5 border border-primary/10 p-6 rounded-3xl relative overflow-hidden group">
              <Clock className="absolute -right-2 -bottom-2 text-primary/10 group-hover:scale-110 transition-transform duration-500" size={80} />
              <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1 relative z-10">Ore Totale</p>
              <p className="text-4xl font-black text-primary relative z-10">{totalHours.toFixed(1)}</p>
            </div>
            <div className="bg-accent/5 border border-accent/10 p-6 rounded-3xl relative overflow-hidden group">
              <Calendar className="absolute -right-2 -bottom-2 text-accent/10 group-hover:scale-110 transition-transform duration-500" size={80} />
              <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-1 relative z-10">Prezențe</p>
              <p className="text-4xl font-black text-accent relative z-10">{attendance.length}</p>
            </div>
            <div className="bg-success/5 border border-success/10 p-6 rounded-3xl relative overflow-hidden group">
              <History className="absolute -right-2 -bottom-2 text-success/10 group-hover:scale-110 transition-transform duration-500" size={80} />
              <p className="text-[10px] font-black text-success uppercase tracking-widest mb-1 relative z-10">Validări</p>
              <p className="text-4xl font-black text-success relative z-10">
                {attendance.filter(a => a.coordinatorValidated).length}
              </p>
            </div>
          </div>

          {/* Attendance History */}
          <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                <History className="text-primary" /> Istoric Prezență
              </h3>
            </div>

            <div className="overflow-x-auto">
              {attendance.length === 0 ? (
                <div className="text-center py-20 opacity-30">
                  <Clock size={48} className="mx-auto mb-4" strokeWidth={1} />
                  <p className="font-bold">Niciun record de prezență găsit</p>
                  <p className="text-xs italic">Când voluntarul va face check-in, datele vor apărea aici.</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr className="border-b-2 border-base-200">
                      <th className="font-black text-xs uppercase tracking-widest pl-0">Data</th>
                      <th className="font-black text-xs uppercase tracking-widest">Interval</th>
                      <th className="font-black text-xs uppercase tracking-widest text-center">Durată</th>
                      <th className="font-black text-xs uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200/50">
                    {attendance.map((entry) => (
                      <tr key={entry.$id} className="hover:bg-base-200/30 transition-all">
                        <td className="py-4 pl-0">
                          <p className="font-bold">{new Date(entry.attendanceDate).toLocaleDateString('ro-RO', { day: '2-digit', month: 'long' })}</p>
                          <p className="text-[10px] opacity-40 uppercase font-black">{entry.departmentRole}</p>
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
                              <span className="text-[10px] font-black uppercase">Validat</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 opacity-20">
                              <Clock size={14} />
                              <span className="text-[10px] font-black uppercase">Preluat</span>
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
          <div className="grid grid-cols-2 gap-4 opacity-50 pointer-events-none grayscale">
            <div className="bg-base-200 p-6 rounded-3xl border border-dashed border-base-300 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CreditCard className="text-base-content/40" />
                <span className="text-sm font-bold">Generare Ecuson</span>
              </div>
              <span className="text-[10px] font-black uppercase bg-base-300 px-2 py-1 rounded-lg">Soon</span>
            </div>
            <div className="bg-base-200 p-6 rounded-3xl border border-dashed border-base-300 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Award className="text-base-content/40" />
                <span className="text-sm font-bold">Generare Diplomă</span>
              </div>
              <span className="text-[10px] font-black uppercase bg-base-300 px-2 py-1 rounded-lg">Soon</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
