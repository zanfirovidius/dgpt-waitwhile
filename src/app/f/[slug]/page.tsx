'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createAdminClient } from '@/lib/appwrite-server';
import { Query } from 'node-appwrite';
import { submitFeedback, FeedbackSubmission } from '@/app/actions/submissions';
import { 
  CheckCircle2, AlertCircle, Send, User, Mail, Phone, 
  ChevronRight, Calendar, MessageSquare, ShieldCheck, MapPin
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// We need a way to fetch the project/config by slug PUBLICLY
// I'll add a specific action for this.
import { getProjectBySlug } from '@/app/actions/projects';

export default function PublicFeedbackFormPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : params.slug?.[0];

  const [project, setProject] = useState<any>(null);
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
             setError('This feedback form is not currently accepting responses.');
          } else {
             setProject(res.data);
          }
        } else {
          setError('We could not find the project you are looking for.');
        }
      } catch (err) {
        setError('An error occurred while loading the form.');
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
      alert(res.error || 'Failed to submit feedback. Please try again.');
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
      <div className="max-w-md w-full bg-base-100 p-8 rounded-3xl shadow-xl text-center space-y-4">
        <AlertCircle size={48} className="mx-auto text-error/50" />
        <h1 className="text-xl font-bold">Formular Indisponibil</h1>
        <p className="text-base-content/60">{error}</p>
        <div className="pt-4 text-[10px] text-base-content/30 uppercase tracking-widest font-bold">Din Grija Pentru Tine</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4 animate-in fade-in zoom-in duration-500">
      <div className="max-w-md w-full bg-base-100 p-8 rounded-[2.5rem] shadow-2xl text-center space-y-8 border border-base-300/50">
        <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">Formular Feedback</div>
            <div className="text-xs font-black uppercase tracking-widest opacity-30">Din Grija Pentru Tine</div>
        </div>

        <div className="space-y-4">
            <div className="w-24 h-24 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto shadow-inner mb-2">
                <CheckCircle2 size={48} />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-base-content">Vă mulțumim!</h1>
            <p className="text-base font-medium text-base-content/60 leading-relaxed px-4">
                Feedback-ul dumneavoastră a fost înregistrat cu succes.
            </p>
        </div>

        <div className="pt-8 border-t border-base-200 space-y-6">
             <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Operator</p>
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
                className="btn btn-primary btn-block btn-lg rounded-2xl shadow-xl shadow-primary/20 gap-3"
             >
                <ChevronRight size={20} className="rotate-180" />
                Înapoi la formular
             </button>
             
             <div className="pt-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/20 italic">Din Grija Pentru Tine</p>
             </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-base-200 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* Header Card */}
        <div className="bg-gradient-to-br from-primary to-secondary p-8 rounded-[2rem] text-primary-content shadow-xl shadow-primary/20 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
             <div className="relative z-10 space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                    {project.project.eventName || project.config.feedbackFormTitle}
                </h1>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80">
                    <MapPin size={14} /> {project.project.city ? `${project.project.city}${project.project.venue ? `, ${project.project.venue}` : ''}` : project.project.locationName}
                </div>
                {project.config.feedbackFormIntroText && (
                    <p className="text-sm opacity-90 leading-relaxed pt-2 max-w-sm">
                        {project.config.feedbackFormIntroText}
                    </p>
                )}
             </div>
        </div>

        {/* Form Card */}
        <div className="bg-base-100 rounded-[2rem] shadow-xl border border-base-300/50 p-6 sm:p-10">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Participation Section */}
            <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-base-content/30 flex items-center gap-2">
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
                <h3 className="text-sm font-black uppercase tracking-widest text-base-content/30 flex items-center gap-2">
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
                              className={`btn btn-xs rounded-full px-4 capitalize ${formData.category === cat ? 'btn-primary' : 'btn-ghost bg-base-200'}`}
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
                    <h3 className="text-sm font-black uppercase tracking-widest text-base-content/30 flex items-center gap-2">
                        <User size={16} /> Opțiuni Contact (Opțional)
                    </h3>
                    <span className="text-[10px] font-bold text-base-content/40 uppercase">Sigur și Confidențial</span>
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
                    <div className="form-control p-4 bg-primary/5 rounded-2xl border border-primary/10 animate-in slide-in-from-top-2 overflow-hidden w-full">
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
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-base-content/40">
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
              className="btn btn-primary btn-block h-14 rounded-2xl text-lg gap-2 shadow-xl shadow-primary/20"
            >
                {submitting ? <span className="loading loading-spinner"></span> : <Send size={20} />}
                Trimite Feedback
            </button>
          </form>
        </div>

        <div className="text-center pb-8 opacity-20 hover:opacity-100 transition-opacity">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content">Din Grija Pentru Tine</p>
        </div>
      </div>
    </div>
  );
}
