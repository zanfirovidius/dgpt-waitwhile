'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { submitFeedback } from '@/app/actions/submissions';
import { 
  CheckCircle2, AlertCircle, Send, User, Mail, Phone, 
  ChevronRight, Calendar, MessageSquare, ShieldCheck, MapPin
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { getProjectBySlug } from '@/app/actions/projects';

type PublicFeedbackProject = NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>['data']>;

export default function PublicFeedbackFormPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : params.slug?.[0];

  const [project, setProject] = useState<PublicFeedbackProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    participationDate: new Date().toISOString().split('T')[0],
    subLocation: '',
    category: 'general',
    message: '',
    fullName: '',
    email: '',
    phone: '',
    consentToBeContacted: false,
  });

  useEffect(() => {
    const targetSlug = slug;
    if (!targetSlug || typeof targetSlug !== 'string') return;
    
    async function fetchProject() {
      try {
        const res = await getProjectBySlug(targetSlug as string);
        if (res.success && res.data) {
          if (res.data.config.publicFeedbackFormStatus !== 'active') {
             setError('Acest formular nu mai primește răspunsuri în acest moment.');
          } else {
             setProject(res.data);
          }
        } else {
          setError('Nu am găsit proiectul căutat.');
        }
      } catch {
        setError('A apărut o eroare la încărcarea formularului.');
      }
      setLoading(false);
    }
    fetchProject();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    
    setSubmitting(true);
    const res = await submitFeedback({
        ...formData,
        projectId: project.project.$id,
    });
    
    if (res.success) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      alert(res.error || 'Nu am putut trimite feedback-ul. Încearcă din nou.');
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="max-w-md w-full rounded-2xl border border-base-200 bg-base-100 p-8 text-center space-y-4 shadow-sm">
        <AlertCircle size={48} className="mx-auto text-error/50" />
        <h1 className="text-xl font-bold">Formular Indisponibil</h1>
        <p className="text-base-content/60">{error}</p>
        <div className="pt-4 text-[10px] text-base-content/30 uppercase tracking-widest font-semibold">Din Grija Pentru Tine</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="max-w-md w-full rounded-[1.75rem] border border-base-200 bg-base-100 p-8 text-center space-y-8 shadow-sm">
        <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-base-content/45">Formular feedback</div>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-25">Din Grija Pentru Tine</div>
        </div>

        <div className="space-y-4">
            <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 size={40} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-base-content">Vă mulțumim!</h1>
            <p className="text-base font-medium text-base-content/60 leading-relaxed px-4">
                Feedback-ul dumneavoastră a fost înregistrat cu succes.
            </p>
        </div>

        <div className="pt-8 border-t border-base-200 space-y-6">
             <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">Operator</p>
                <p className="text-xs font-bold text-base-content/70">{project.config.operatorName}</p>
             </div>

             <button 
                onClick={() => {
                    setSubmitted(false);
                    setFormData({
                        participationDate: new Date().toISOString().split('T')[0],
                        subLocation: '',
                        category: 'general',
                        message: '',
                        fullName: '',
                        email: '',
                        phone: '',
                        consentToBeContacted: false,
                    });
                }}
                className="btn btn-primary btn-block btn-lg rounded-xl shadow-sm gap-3"
             >
                <ChevronRight size={20} className="rotate-180" />
                Înapoi la formular
             </button>
             
             <div className="pt-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-base-content/20 italic">Din Grija Pentru Tine</p>
             </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-base-200 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* Header Card */}
        <div className="rounded-[1.75rem] border border-base-200 bg-base-100 p-6 shadow-sm sm:p-8">
             <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-base-content/45">Formular feedback</div>
                <h1 className="text-2xl font-semibold tracking-tight leading-tight text-base-content sm:text-[2rem]">
                    {project.project.eventName || project.config.feedbackFormTitle}
                </h1>
                <div className="flex items-center gap-2 text-xs font-medium text-base-content/55">
                    <MapPin size={14} /> {project.project.city ? `${project.project.city}${project.project.venue ? `, ${project.project.venue}` : ''}` : project.project.locationName}
                </div>
                {project.config.feedbackFormIntroText && (
                    <p className="max-w-lg pt-1 text-sm leading-relaxed text-base-content/70">
                        {project.config.feedbackFormIntroText}
                    </p>
                )}
             </div>
        </div>

        {/* Form Card */}
        <div className="rounded-[1.75rem] border border-base-200 bg-base-100 p-6 shadow-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Participation Section */}
            <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/40">
                    <Calendar size={16} /> Detalii Participare
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold text-xs">Data participării</span></label>
                        <input 
                          type="date" 
                          required
                          value={formData.participationDate}
                          onChange={(e) => setFormData({ ...formData, participationDate: e.target.value })}
                          className="input input-bordered w-full focus:input-primary bg-base-200/50"
                        />
                    </div>
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold text-xs text-base-content/50">Locație / Stand (Opțional)</span></label>
                        <input 
                          type="text" 
                          placeholder="ex: Control General"
                          value={formData.subLocation}
                          onChange={(e) => setFormData({ ...formData, subLocation: e.target.value })}
                          className="input input-bordered w-full focus:input-primary bg-base-200/50"
                        />
                    </div>
                </div>
            </div>

            {/* Feedback Content */}
            <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/40">
                    <MessageSquare size={16} /> Feedback-ul tău
                </h3>
                <div className="form-control">
                    <label className="label"><span className="label-text font-bold text-xs">Categorie</span></label>
                    <div className="flex flex-wrap gap-2">
                        {['general', 'serviciu', 'organizare', 'medical', 'altul'].map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setFormData({ ...formData, category: cat })}
                              className={`btn btn-sm rounded-xl px-4 capitalize font-medium ${
                                formData.category === cat
                                  ? 'btn-ghost border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
                                  : 'btn-ghost border border-base-200 bg-base-200/50 text-base-content/70 hover:bg-base-200'
                              }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="form-control flex flex-col items-start w-full">
                    <label className="label pb-1"><span className="label-text font-bold text-xs">Cum a fost experiența ta?</span></label>
                    <textarea 
                      required
                      placeholder="Împărtășește-ne gândurile tale..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="textarea textarea-bordered w-full h-32 focus:textarea-primary bg-base-200/50 text-base"
                    />
                </div>
            </div>

            {/* Optional Contact */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/40">
                        <User size={16} /> Opțiuni Contact (Opțional)
                    </h3>
                    <span className="text-[10px] font-medium text-base-content/40 uppercase">Sigur și confidențial</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    <div className="form-control">
                        <div className="relative">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30" />
                            <input 
                              type="text" 
                              placeholder="Nume Complet"
                              value={formData.fullName}
                              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                              className="input input-bordered w-full pl-12 focus:input-primary bg-base-200/50"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="relative">
                            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30" />
                            <input 
                              type="email" 
                              placeholder="Adresă Email"
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              className="input input-bordered w-full pl-12 focus:input-primary bg-base-200/50"
                            />
                        </div>
                        <div className="relative">
                            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30" />
                            <input 
                              type="tel" 
                              placeholder="Număr Telefon"
                              value={formData.phone}
                              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                              className="input input-bordered w-full pl-12 focus:input-primary bg-base-200/50"
                            />
                        </div>
                    </div>
                </div>
                
                {(formData.fullName || formData.email || formData.phone) && (
                    <div className="form-control w-full overflow-hidden rounded-xl border border-base-200 bg-base-200/40 p-4">
                        <label className="flex cursor-pointer justify-start gap-4 items-start p-0 w-full group">
                            <input 
                                type="checkbox" 
                                required
                                checked={formData.consentToBeContacted}
                                onChange={(e) => setFormData({ ...formData, consentToBeContacted: e.target.checked })}
                                className="checkbox checkbox-primary checkbox-sm mt-0.5 shrink-0 transition-transform group-hover:scale-110" 
                            />
                            <span className="label-text text-[11px] sm:text-xs leading-relaxed flex-1 break-words opacity-80 group-hover:opacity-100 transition-opacity">
                                {project.config.feedbackFormConsentText}
                            </span>
                        </label>
                    </div>
                )}
            </div>

            {/* Privacy Section */}
            <div className="bg-base-200 p-6 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/40">
                    <ShieldCheck size={16} /> Confidențialitatea datelor (GDPR)
                </div>
                <div className="text-[10px] text-base-content/60 max-h-32 overflow-y-auto pr-2 leading-relaxed prose-markdown">
                    <ReactMarkdown>{project.config.privacyNoticeText}</ReactMarkdown>
                </div>
                <div className="text-[10px] font-bold text-base-content/30">
                    Operator: {project.config.operatorLegalName} • Responsabil date: {project.config.dpoEmail}
                </div>
            </div>

            {/* Submit */}
            <button 
              type="submit" 
              disabled={submitting}
              className="btn btn-primary btn-block h-14 rounded-xl text-base gap-2 shadow-sm"
            >
                {submitting ? <span className="loading loading-spinner"></span> : <Send size={20} />}
                Trimite Feedback
            </button>
          </form>
        </div>

        <div className="pb-8 text-center opacity-25">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-base-content">Din Grija Pentru Tine</p>
        </div>
      </div>
    </div>
  );
}
