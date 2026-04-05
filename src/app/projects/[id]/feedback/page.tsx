'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getProject, Project } from '@/app/actions/projects';
import { getProjectFeedbackConfig, updateProjectFeedbackConfig, resetProjectFeedbackConfigToDefaults, FeedbackConfig } from '@/app/actions/feedback-config';
import { getProjectSubmissions, updateSubmissionStatus, getProjectSubmissionsCSV, FeedbackSubmission, deleteSubmission } from '@/app/actions/submissions';
import { 
  ArrowLeft, Save, RefreshCw, MessageSquare, Settings, 
  CheckCircle2, AlertCircle, Clock, ExternalLink,
  ChevronRight, MoreVertical, Download,
  User, Mail, Phone, Calendar, MapPin, ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import QRCodeModule from '@/components/QRCodeModule';

export default function ProjectFeedbackPage() {
  const params = useParams();
  const projectId = typeof params.id === 'string' ? params.id : params.id?.[0];

  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<FeedbackConfig | null>(null);
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'setup' | 'config' | 'submissions'>('setup');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<FeedbackSubmission | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchData = async () => {
      const [projRes, confRes, subRes] = await Promise.all([
        getProject(projectId),
        getProjectFeedbackConfig(projectId),
        getProjectSubmissions(projectId)
      ]);

      if (projRes.success) setProject(projRes.data!);
      if (confRes.success) setConfig(confRes.data!);
      if (subRes.success) setSubmissions(subRes.data || []);
      
      setLoading(false);
      
      // Default to Submissions if setup is done
      if (confRes.data?.setupCompleted && subRes.data && subRes.data.length > 0) {
        setTab('submissions');
      } else if (confRes.data?.setupCompleted) {
        setTab('config');
      }
    };
    
    fetchData();
  }, [projectId]);

  const handleSaveConfig = async () => {
    if (!projectId || !config) return;
    setSaving(true);
    setMessage(null);
    const res = await updateProjectFeedbackConfig(projectId, config);
    if (res.success) {
      setMessage({ type: 'success', text: 'Configuration updated!' });
      // Refresh to update validation status
      const updated = await getProjectFeedbackConfig(projectId);
      if (updated.success) setConfig(updated.data!);
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to update' });
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this project to platform defaults? All overrides will be lost.')) return;
    if (!projectId) return;
    setLoading(true);
    const res = await resetProjectFeedbackConfigToDefaults(projectId);
    if (res.success) {
      const updated = await getProjectFeedbackConfig(projectId);
      if (updated.success) setConfig(updated.data!);
      setMessage({ type: 'success', text: 'Reset to defaults!' });
    }
    setLoading(false);
  };

  const handleUpdateSubmissionStatus = async (id: string, status: string) => {
    const res = await updateSubmissionStatus(id, status);
    if (res.success) {
      setSubmissions(prev => prev.map(s => s.$id === id ? { ...s, status } : s));
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('Ești sigur că vrei să ștergi acest feedback? Această acțiune este ireversibilă.')) return;
    const res = await deleteSubmission(id);
    if (res.success) {
      setSubmissions(prev => prev.filter(s => s.$id !== id));
      setMessage({ type: 'success', text: 'Feedback șters cu succes' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Eroare la ștergere' });
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );

  if (!project || !config) return (
    <div className="text-center py-20">
      <h3 className="text-lg font-semibold text-base-content/60">Proiectul sau configurația nu au fost găsite</h3>
      <Link href="/projects" className="btn btn-sm btn-ghost mt-4"><ArrowLeft size={16} /> Înapoi la Proiecte</Link>
    </div>
  );

  const missingItems = JSON.parse(config.setupMissingItemsJson || '[]');

  const stats = {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'new' || s.status === 'in_review').length,
    resolved: submissions.filter(s => s.status === 'resolved').length
  };

  return (
    <>
      <div className="space-y-6">
      {/* breadcrumbs */}
      <div className="text-sm breadcrumbs text-base-content/50">
        <ul>
          <li><Link href="/projects">Projects</Link></li>
          <li><Link href={`/projects/${projectId}`}>{project.name}</Link></li>
          <li className="text-base-content font-medium">Feedback</li>
        </ul>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-3 mt-1">
             <div className={`badge badge-sm gap-1.5 py-3 ${config.publicFeedbackFormStatus === 'active' ? 'badge-success' : 'badge-ghost'}`}>
               {config.publicFeedbackFormStatus === 'active' ? 'Active' : 'Inactive'}
             </div>
             {config.projectSlug && (
                <a href={`/f/${config.projectSlug}`} target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Public URL: /f/{config.projectSlug} <ExternalLink size={10} />
                </a>
             )}
          </div>
        </div>
        
        <div className="flex gap-2">
            {tab === 'config' && (
                <>
                    <button onClick={handleReset} className="btn btn-ghost btn-sm gap-2">
                        <RefreshCw size={14} /> Resetează Setări
                    </button>
                    <button onClick={handleSaveConfig} className="btn btn-primary btn-sm gap-2" disabled={saving}>
                        {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={14} />} 
                        Salvează Modificări
                    </button>
                </>
            )}
        </div>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} py-3`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 mb-2">
        <div className="stats shadow-sm bg-base-100 border border-base-200 rounded-3xl overflow-hidden">
          <div className="stat">
            <div className="stat-figure text-primary opacity-20"><MessageSquare size={40} /></div>
            <div className="stat-title font-bold text-xs uppercase tracking-widest opacity-60">Total Feedback</div>
            <div className="stat-value text-primary">{stats.total}</div>
            <div className="stat-desc font-medium text-[10px]">Toate categoriile</div>
          </div>
        </div>
        <div className="stats shadow-sm bg-base-100 border border-base-200 rounded-3xl overflow-hidden">
          <div className="stat">
            <div className="stat-figure text-warning opacity-20"><AlertCircle size={40} /></div>
            <div className="stat-title font-bold text-xs uppercase tracking-widest opacity-60">În Așteptare / Revizuire</div>
            <div className="stat-value text-warning">{stats.pending}</div>
            <div className="stat-desc font-medium text-[10px]">Necesită atenție imediată</div>
          </div>
        </div>
        <div className="stats shadow-sm bg-base-100 border border-base-200 rounded-3xl overflow-hidden">
          <div className="stat">
            <div className="stat-figure text-success opacity-20"><CheckCircle2 size={40} /></div>
            <div className="stat-title font-bold text-xs uppercase tracking-widest opacity-60">Rezolvate</div>
            <div className="stat-value text-success">{stats.resolved}</div>
            <div className="stat-desc font-medium text-[10px]">Feedback-uri finalizate</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-lifted">
        <button className={`tab ${tab === 'setup' ? 'tab-active font-bold' : ''}`} onClick={() => setTab('setup')}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className={config.setupCompleted ? 'text-success' : 'text-base-content/30'} />
            Listă Verificare
          </div>
        </button>
        <button className={`tab ${tab === 'submissions' ? 'tab-active font-bold' : ''}`} onClick={() => setTab('submissions')}>
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            Trimiteri
            {submissions.length > 0 && <span className="badge badge-sm badge-primary ml-1">{submissions.length}</span>}
          </div>
        </button>
        <button className={`tab ${tab === 'config' ? 'tab-active font-bold' : ''}`} onClick={() => setTab('config')}>
          <div className="flex items-center gap-2">
            <Settings size={16} />
            Configurare Formular
          </div>
        </button>
      </div>

      <div className="bg-base-100 border-x border-b border-base-200 rounded-b-xl p-6 min-h-[400px]">
        
        {/* TAB: SETUP */}
        {tab === 'setup' && (
          <div className="max-w-xl mx-auto space-y-8 animate-in slide-in-from-bottom-2 duration-300">
            <div className="text-center space-y-2">
              <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${config.setupCompleted ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                {config.setupCompleted ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
              </div>
              <h2 className="text-xl font-bold">
                {config.setupCompleted ? 'Formularul este Gata!' : 'Configurare în Curs'}
              </h2>
              <p className="text-base-content/60 text-sm">
                {config.setupCompleted 
                  ? 'Toate câmpurile obligatorii sunt completate. Acum puteți seta statusul pe "Activ".' 
                  : 'Următoarele elemente lipsesc înainte ca formularul să poată fi publicat.'}
              </p>
            </div>

            <div className="bg-base-200/50 rounded-xl p-4 divide-y divide-base-300/50">
               {config.setupCompleted ? (
                   <div className="p-4 flex items-center justify-between">
                       <span className="text-sm font-medium">Vizibilitate Formular</span>
                       <select 
                         className="select select-bordered select-sm w-40"
                         value={config.publicFeedbackFormStatus}
                         onChange={(e) => {
                             setConfig({ ...config, publicFeedbackFormStatus: e.target.value });
                             handleSaveConfig();
                         }}
                       >
                           <option value="draft">Draft (Ascuns)</option>
                           <option value="active">Activ (Public)</option>
                           <option value="inactive">Pauzat</option>
                       </select>
                   </div>
               ) : (
                  missingItems.map((item: string, i: number) => (
                    <div key={i} className="p-4 flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-error/10 text-error flex items-center justify-center text-[10px] font-bold">!</div>
                       <span className="text-sm text-base-content/80 font-medium">Lipsește: {item}</span>
                       <ChevronRight size={14} className="ml-auto text-base-content/20" />
                    </div>
                  ))
               )}
            </div>

            <div className="text-center">
                <button className="btn btn-ghost btn-sm text-primary" onClick={() => setTab('config')}>
                    Mergi la Configurare <ChevronRight size={14} />
                </button>
            </div>
          </div>
        )}

        {/* TAB: SUBMISSIONS */}
        {tab === 'submissions' && (
          <div className="animate-in fade-in duration-300 space-y-4">
            <div className="flex justify-end">
                <button 
                  onClick={async () => {
                    const res = await getProjectSubmissionsCSV(projectId!);
                    if (res.success && res.data) {
                        const blob = new Blob([res.data], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.setAttribute('hidden', '');
                        a.setAttribute('href', url);
                        a.setAttribute('download', `feedback-${project.name}-${new Date().toISOString().split('T')[0]}.csv`);
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    } else {
                        alert(res.error || 'Failed to export CSV');
                    }
                  }}
                  className="btn btn-outline btn-sm gap-2"
                  disabled={submissions.length === 0}
                >
                    <Download size={14} /> Exportă CSV
                </button>
            </div>

            {submissions.length === 0 ? (
                <div className="text-center py-20 opacity-40 italic">
                    <MessageSquare size={48} className="mx-auto mb-4" />
                    <p>Nicio trimitere momentan.</p>
                </div>
            ) : (
                <div className="overflow-x-visible pb-32">
                    <table className="table table-zebra w-full">
                        <thead>
                            <tr>
                                <th>Categorie</th>
                                <th>Fragment Mesaj</th>
                                <th>De la</th>
                                <th>Data</th>
                                <th>Status</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {submissions.map((sub) => (
                                <tr key={sub.$id}>
                                    <td><span className="badge badge-sm badge-outline uppercase text-[10px]">{sub.category}</span></td>
                                    <td className="max-w-xs truncate text-sm">{sub.message}</td>
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{sub.isAnonymous ? 'Anonim' : sub.fullName}</span>
                                            {!sub.isAnonymous && <span className="text-[10px] opacity-40">{sub.email}</span>}
                                        </div>
                                    </td>
                                    <td className="text-xs opacity-60">
                                        {new Date(sub.$createdAt!).toLocaleDateString('ro-RO')}
                                    </td>
                                    <td>
                                          <select 
                                            className={`select select-ghost select-xs font-bold ${sub.status === 'new' ? 'text-primary' : sub.status === 'resolved' ? 'text-success' : 'text-base-content/40'}`}
                                            value={sub.status}
                                            onChange={(e) => handleUpdateSubmissionStatus(sub.$id!, e.target.value)}
                                          >
                                              <option value="new">NOU</option>
                                              <option value="in_review">ÎN REVIZUIRE</option>
                                              <option value="resolved">REZOLVAT</option>
                                              <option value="archived">ARHIVAT</option>
                                          </select>
                                    </td>
                                    <td>
                                        <div className="dropdown dropdown-end">
                                            <button type="button" tabIndex={0} className="btn btn-ghost btn-xs" aria-label={`Acțiuni pentru feedback ${sub.$id}`}>
                                              <MoreVertical size={14} />
                                            </button>
                                            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-40 border border-base-200">
                                                <li><button onClick={() => setSelectedSubmission(sub)}>Vezi Detalii</button></li>
                                                <li className="text-error"><button onClick={() => handleDeleteSubmission(sub.$id!)}>Șterge</button></li>
                                            </ul>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
          </div>
        )}

        {/* TAB: CONFIGURATION */}
        {tab === 'config' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-right-2 duration-300">
             <div className="space-y-6">
                 <div className="form-control">
                    <label className="label"><span className="label-text font-bold">Slug URL Public</span></label>
                    <div className="flex gap-2">
                        <span className="bg-base-200 px-3 flex items-center rounded-lg text-sm text-base-content/40 font-mono">/f/</span>
                        <input 
                          type="text" 
                          value={config.projectSlug} 
                          onChange={(e) => setConfig({ ...config, projectSlug: e.target.value })}
                          className="input input-bordered flex-1 focus:input-primary"
                        />
                    </div>
                 </div>

                 <div className="form-control">
                    <label className="label"><span className="label-text font-bold">Titlu Formular Feedback</span></label>
                    <input 
                      type="text" 
                      value={config.feedbackFormTitle} 
                      onChange={(e) => setConfig({ ...config, feedbackFormTitle: e.target.value })}
                      className="input input-bordered w-full"
                    />
                 </div>

                 <div className="form-control w-full">
                    <label className="label pb-1"><span className="label-text font-bold">Text Introductiv</span></label>
                    <textarea 
                      value={config.feedbackFormIntroText} 
                      onChange={(e) => setConfig({ ...config, feedbackFormIntroText: e.target.value })}
                      className="textarea textarea-bordered w-full h-24"
                    />
                 </div>
                 
                 <div className="form-control w-full">
                    <label className="label pb-1"><span className="label-text font-bold">Mesaj de Succes</span></label>
                    <textarea 
                      value={config.feedbackSuccessMessage} 
                      onChange={(e) => setConfig({ ...config, feedbackSuccessMessage: e.target.value })}
                      className="textarea textarea-bordered w-full h-24"
                    />
                 </div>
             </div>

             <div className="space-y-6">
                 <QRCodeModule 
                    url={typeof window !== 'undefined' ? `${window.location.origin}/f/${config.projectSlug}` : ''}
                    title={project.name}
                    subtitle="Scanează pentru a lăsa un feedback"
                    active={config.publicFeedbackFormStatus === 'active'}
                 />

                 <div className="card bg-base-200/30 border border-base-200">
                    <div className="card-body p-4 space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-base-content/40">Suprascriere Operator</h3>
                        
                        <div className="form-control">
                            <label className="label"><span className="label-text font-medium text-xs">Nume Legal</span></label>
                            <input 
                              type="text" 
                              value={config.operatorLegalName} 
                              onChange={(e) => setConfig({ ...config, operatorLegalName: e.target.value })}
                              className="input input-bordered input-sm w-full"
                            />
                        </div>
                        
                        <div className="form-control">
                            <label className="label"><span className="label-text font-medium text-xs">Email DPO</span></label>
                            <input 
                              type="email" 
                              value={config.dpoEmail} 
                              onChange={(e) => setConfig({ ...config, dpoEmail: e.target.value })}
                              className="input input-bordered input-sm w-full"
                            />
                        </div>

                        <div className="form-control w-full">
                            <label className="label pb-1"><span className="label-text font-medium text-xs">Notă de Confidențialitate (Markdown/Text)</span></label>
                            <textarea 
                              value={config.privacyNoticeText} 
                              onChange={(e) => setConfig({ ...config, privacyNoticeText: e.target.value })}
                              className="textarea textarea-bordered textarea-sm w-full h-32 text-[10px]"
                            />
                        </div>
                    </div>
                 </div>
                 
                 <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-4">
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary"
                          checked={config.publicFeedbackFormStatus === 'active'}
                          onChange={(e) => setConfig({ ...config, publicFeedbackFormStatus: e.target.checked ? 'active' : 'inactive' })}
                          disabled={!config.setupCompleted}
                        />
                        <span className="label-text font-bold">Activ Public</span>
                    </label>
                    <p className="text-[10px] text-base-content/40 ml-14">
                        {!config.setupCompleted ? 'Completați lista de verificare pentru a activa acest formular.' : 'Când este activ, formularul este disponibil participanților.'}
                    </p>
                 </div>
              </div>
           </div>
        )}

      </div>

      {/* Detail Modal */}
      {selectedSubmission && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl rounded-3xl p-0 overflow-hidden border border-base-300 shadow-2xl animate-in zoom-in duration-200">
            <div className="bg-primary p-6 text-primary-content flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
              <div className="relative z-10">
                <h3 className="text-xl font-bold">Detalii Feedback</h3>
                <p className="text-[10px] opacity-70 uppercase tracking-widest font-black">ID Document: {selectedSubmission.$id}</p>
              </div>
              <button className="btn btn-sm btn-circle btn-ghost relative z-10" onClick={() => setSelectedSubmission(null)} aria-label="Închide detaliile feedbackului">✕</button>
            </div>
            
            <div className="p-8 space-y-8 bg-base-100">
              <div className="grid grid-cols-2 gap-8 pb-6 border-b border-base-200">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Status Curent</label>
                  <div className={`text-sm font-bold flex items-center gap-2 ${selectedSubmission.status === 'new' ? 'text-primary' : selectedSubmission.status === 'resolved' ? 'text-success' : 'text-base-content/60'}`}>
                    <div className={`w-2 h-2 rounded-full animate-pulse ${selectedSubmission.status === 'new' ? 'bg-primary' : selectedSubmission.status === 'resolved' ? 'bg-success' : 'bg-base-content/40'}`} />
                    {selectedSubmission.status.toUpperCase()}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Data Trimiterii</label>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <Clock size={14} className="text-base-content/30" />
                    {new Date(selectedSubmission.$createdAt!).toLocaleString('ro-RO')}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Mesaj Complet</label>
                <div className="bg-base-200/50 p-6 rounded-2xl text-base leading-relaxed whitespace-pre-wrap border border-base-300/30 font-medium">
                  {selectedSubmission.message}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Identitate Participant</label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm"><User size={18} /></div>
                       <div className="flex flex-col">
                           <span className="text-sm font-bold">{selectedSubmission.isAnonymous ? 'Anonim' : selectedSubmission.fullName}</span>
                           <span className="text-[10px] opacity-40 uppercase font-bold tracking-tighter">{selectedSubmission.isAnonymous ? 'Nicio dată de contact' : 'Date de contact furnizate'}</span>
                       </div>
                    </div>
                    {!selectedSubmission.isAnonymous && (
                       <div className="space-y-2 ml-1">
                         <div className="flex items-center gap-3 text-xs font-medium bg-base-200/30 p-2 rounded-lg">
                           <Mail size={14} className="text-primary/60" /> {selectedSubmission.email}
                         </div>
                         <div className="flex items-center gap-3 text-xs font-medium bg-base-200/30 p-2 rounded-lg">
                           <Phone size={14} className="text-primary/60" /> {selectedSubmission.phone}
                         </div>
                       </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Context Eveniment</label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm font-medium bg-base-200/30 p-2 rounded-lg">
                        <Calendar size={14} className="text-secondary/60" /> 
                        <span><span className="opacity-40 font-bold mr-1">Data:</span> {selectedSubmission.participationDate}</span>
                    </div>
                    {selectedSubmission.subLocation && (
                        <div className="flex items-center gap-3 text-sm font-medium bg-base-200/30 p-2 rounded-lg">
                            <MapPin size={14} className="text-secondary/60" /> 
                            <span><span className="opacity-40 font-bold mr-1">Locație:</span> {selectedSubmission.subLocation}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3 text-sm font-medium bg-base-200/30 p-2 rounded-lg">
                        <MessageSquare size={14} className="text-secondary/60" /> 
                        <span><span className="opacity-40 font-bold mr-1">Categorie:</span> <span className="uppercase text-[10px] badge badge-sm badge-outline font-black">{selectedSubmission.category}</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {!selectedSubmission.isAnonymous && (
                <div className={`p-5 rounded-2xl border flex items-center gap-4 transition-colors ${selectedSubmission.consentToBeContacted ? 'bg-success/5 border-success/20 text-success' : 'bg-warning/5 border-warning/20 text-warning'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedSubmission.consentToBeContacted ? 'bg-success/20' : 'bg-warning/20'}`}>
                    <ShieldCheck size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider opacity-60">Consimțământ Contact</span>
                    <span className="text-sm font-bold">
                        {selectedSubmission.consentToBeContacted ? 'Utilizatorul a acceptat să fie contactat' : 'Utilizatorul NU dorește să fie contactat'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-base-200/50 flex justify-end gap-3 border-t border-base-200">
              <button className="btn btn-ghost rounded-2xl px-8" onClick={() => setSelectedSubmission(null)}>Închide</button>
            </div>
          </div>
          <div className="modal-backdrop bg-base-900/60 backdrop-blur-md" onClick={() => setSelectedSubmission(null)}></div>
        </div>
      )}
    </div>
    </>
  );
}
