'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getProjectBySlug } from '@/app/actions/projects';
import { submitAttendanceAction } from '@/app/actions/attendance';
import { getProjectAttendanceConfig, AttendanceConfig } from '@/app/actions/attendance-config';
import SignatureCanvas from 'react-signature-canvas';
import { 
  CheckCircle2, Clock, LogIn, LogOut, 
  RefreshCw, AlertCircle,
  ShieldCheck, ChevronRight, ArrowLeft, MapPin
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type Step = 'access' | 'identity' | 'action' | 'checkout-details' | 'success';

const STEP_WEIGHTS: Record<Step, number> = {
    'access': 1,
    'identity': 2,
    'action': 3,
    'checkout-details': 4,
    'success': 5
};

function resolveInitialStep(config: AttendanceConfig | null, urlToken?: string | null): Step {
    if (!config) {
        return 'access';
    }

    if (config.attendanceAccessMode !== 'token') {
        return 'identity';
    }

    if (urlToken && config.attendanceAccessToken === urlToken) {
        return 'identity';
    }

    return 'access';
}

export default function PublicAttendancePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const projectSlug = params.projectSlug as string;
    const urlToken = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [project, setProject] = useState<any>(null);
    const [config, setConfig] = useState<AttendanceConfig | null>(null);
    const [step, setStep] = useState<Step>('access');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        volunteerFullName: '',
        volunteerEmail: '',
        volunteerPhone: '',
        departmentRole: '',
        attendanceDate: new Date().toISOString().split('T')[0],
        token: urlToken || '',
        pin: '',
        action: 'check-in' as 'check-in' | 'check-out',
        breakMinutes: 0,
        notes: '',
        signatureImageId: '',
    });

    const sigCanvas = useRef<SignatureCanvas>(null);

    useEffect(() => {
        async function load() {
            try {
                const res = await getProjectBySlug(projectSlug);
                if (!res.success) throw new Error(res.error || 'Proiectul nu a fost găsit.');
                setProject(res.data?.project);

                const confRes = await getProjectAttendanceConfig(res.data?.project.$id!);
                if (!confRes.success) throw new Error('Modulul de prezență nu este configurat.');
                setConfig(confRes.data!);
                setStep(resolveInitialStep(confRes.data!, urlToken));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [projectSlug, urlToken]);

    const handleAccessSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (config?.attendanceAccessMode === 'token' && formData.token !== config.attendanceAccessToken) {
            setError('Token de acces invalid.');
            return;
        }
        setStep('identity');
    };

    const handleIdentitySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.volunteerFullName || !formData.departmentRole) {
            setError('Vă rugăm să completați numele și rolul.');
            return;
        }
        setError(null);
        setStep('action');
    };

    const handleActionSelect = (action: 'check-in' | 'check-out') => {
        setFormData({ ...formData, action });
        setError(null);
        if (action === 'check-in') {
            handleSubmit('check-in');
        } else {
            setStep('checkout-details');
        }
    };

    const handleSubmit = async (actionOverride?: 'check-in' | 'check-out') => {
        setIsSubmitting(true);
        setError(null);

        const action = actionOverride || formData.action;
        let signatureImageId = formData.signatureImageId;

        if (action === 'check-out' && config?.signatureRequiredAtCheckout) {
            if (sigCanvas.current?.isEmpty()) {
                setError('Semnătura este obligatorie la check-out.');
                setIsSubmitting(false);
                return;
            }
            signatureImageId = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png') || '';
        }

        try {
            const res = await submitAttendanceAction({
                ...formData,
                projectSlug,
                action,
                signatureImageId,
            });

            if (res.success) {
                setStep('success');
            } else {
                setError(res.error || 'A apărut o eroare la salvare.');
            }
        } catch (err: any) {
            setError(err.message || 'Eroare de sistem.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-base-200">
            <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
    );

    return (
        <div className="min-h-screen bg-base-200 py-8 px-4">
            <div className="max-w-xl mx-auto space-y-6">
                
                {/* Header Card */}
                <div className="bg-gradient-to-br from-primary to-secondary p-8 rounded-[2rem] text-primary-content shadow-xl shadow-primary/20 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                     <div className="relative z-10 space-y-2 text-center">
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                            {project?.eventName || project?.name}
                        </h1>
                        <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80">
                            <MapPin size={14} /> {project?.city ? `${project.city}${project.venue ? `, ${project.venue}` : ''}` : (project?.locationName || 'Locație nespecificată')}
                        </div>
                        <p className="text-sm opacity-90 font-medium pt-2">
                             Prezență Voluntari
                        </p>
                     </div>
                </div>

                <div className="bg-base-100 rounded-[2rem] shadow-xl border border-base-300/50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
                    
                    {/* Progress Bar */}
                    <div className="w-full h-1 bg-base-200">
                        <div 
                            className="bg-primary h-full transition-all duration-500" 
                            style={{ width: `${(STEP_WEIGHTS[step]) / 5 * 100}%` }}
                        />
                    </div>

                    <div className="p-8 flex-1 flex flex-col justify-center gap-6">
                        
                        {error && (
                            <div className="alert alert-error text-xs py-2 rounded-xl">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* STEP: ACCESS */}
                        {step === 'access' && config?.attendanceAccessMode === 'token' && (
                            <form onSubmit={handleAccessSubmit} className="space-y-6">
                                <div className="text-center space-y-2">
                                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary">
                                        <ShieldCheck size={32} />
                                    </div>
                                    <h2 className="text-xl font-bold">Verificare Acces</h2>
                                    <p className="text-sm opacity-60">Introduceți token-ul primit pentru a accesa formularul.</p>
                                </div>
                                <div className="form-control">
                                    <input 
                                        type="text" 
                                        placeholder="Introduceți Token-ul" 
                                        className="input input-bordered input-lg w-full rounded-2xl text-center font-mono tracking-widest focus:input-primary bg-base-200/50"
                                        value={formData.token}
                                        onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                                        required
                                    />
                                </div>
                                <button className="btn btn-primary btn-lg w-full rounded-2xl gap-2 font-bold shadow-xl shadow-primary/20">
                                    Continuă <ChevronRight size={20} />
                                </button>
                            </form>
                        )}

                        {/* STEP: IDENTITY */}
                        {step === 'identity' && (
                            <form onSubmit={handleIdentitySubmit} className="space-y-6">
                                <div className="text-center space-y-2">
                                    <h2 className="text-xl font-bold">Cine ești?</h2>
                                    <p className="text-sm opacity-60">Te rugăm să te identifici pentru evidența orelor.</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-bold">Nume Complet</span></label>
                                        <input 
                                            type="text" 
                                            placeholder="Popescu Ion"
                                            className="input input-bordered input-lg w-full rounded-2xl focus:input-primary bg-base-200/50"
                                            value={formData.volunteerFullName}
                                            onChange={(e) => setFormData({ ...formData, volunteerFullName: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="form-control">
                                            <label className="label pb-1"><span className="label-text font-bold text-xs opacity-60">Email (Opțional)</span></label>
                                            <input 
                                                type="email" 
                                                placeholder="Ex: ion@dgpt.ro"
                                                className="input input-bordered input-md w-full rounded-xl bg-base-200/50 focus:input-primary"
                                                value={formData.volunteerEmail}
                                                onChange={(e) => setFormData({ ...formData, volunteerEmail: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-control">
                                            <label className="label pb-1"><span className="label-text font-bold text-xs opacity-60">Telefon (Opțional)</span></label>
                                            <input 
                                                type="tel" 
                                                placeholder="Ex: 0722..."
                                                className="input input-bordered input-md w-full rounded-xl bg-base-200/50 focus:input-primary"
                                                value={formData.volunteerPhone}
                                                onChange={(e) => setFormData({ ...formData, volunteerPhone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-control">
                                        <label className="label pb-1"><span className="label-text font-bold text-sm">Rol / Departament</span></label>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {(config?.attendanceRoles && config.attendanceRoles.length > 0 
                                                ? config.attendanceRoles 
                                                : ['ORGANIZATOR', 'ASISTENT', 'MEDIC', 'SECRETARIAT', 'VOLUNTAR', 'PROTOCOL', 'ȘEF-CABINET']
                                            ).map((role) => (
                                                <button
                                                    key={role}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, departmentRole: role })}
                                                    className={`btn btn-sm rounded-xl px-4 h-11 border-none transition-all flex-1 min-w-[120px] sm:flex-initial ${
                                                        formData.departmentRole === role 
                                                        ? 'btn-primary shadow-xl shadow-primary/20 scale-105 font-black' 
                                                        : 'bg-base-200 hover:bg-base-300 text-base-content/70 font-bold'
                                                    }`}
                                                >
                                                    {role}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <button className="btn btn-primary btn-lg w-full rounded-2xl gap-2 font-bold shadow-xl shadow-primary/20">
                                    Continuă <ChevronRight size={20} />
                                </button>
                            </form>
                        )}

                        {/* STEP: ACTION */}
                        {step === 'action' && (
                            <div className="space-y-8 py-4">
                                <div className="text-center space-y-2">
                                    <h2 className="text-xl font-bold">Ce vrei să faci?</h2>
                                    <p className="text-sm opacity-60">Alege tipul de acțiune pentru astăzi.</p>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <button 
                                        onClick={() => handleActionSelect('check-in')}
                                        className="btn btn-lg h-32 flex flex-col gap-2 rounded-3xl border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all text-primary"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting && formData.action === 'check-in' ? <span className="loading loading-spinner"></span> : <LogIn size={32} />}
                                        <div className="flex flex-col">
                                            <span className="font-black text-lg">CHECK-IN</span>
                                            <span className="text-[10px] opacity-60 font-bold uppercase tracking-widest">Începe activitatea</span>
                                        </div>
                                    </button>
                                    <button 
                                        onClick={() => handleActionSelect('check-out')}
                                        className="btn btn-lg h-32 flex flex-col gap-2 rounded-3xl border-2 border-secondary/20 hover:border-secondary hover:bg-secondary/5 transition-all text-secondary"
                                        disabled={isSubmitting}
                                    >
                                        <LogOut size={32} />
                                        <div className="flex flex-col">
                                            <span className="font-black text-lg">CHECK-OUT</span>
                                            <span className="text-[10px] opacity-60 font-bold uppercase tracking-widest">Finalizează activitatea</span>
                                        </div>
                                    </button>
                                </div>
                                <button onClick={() => setStep('identity')} className="btn btn-ghost btn-sm mx-auto flex gap-2">
                                    <ArrowLeft size={14} /> Schimbă identitatea
                                </button>
                            </div>
                        )}

                        {/* STEP: CHECKOUT DETAILS */}
                        {step === 'checkout-details' && (
                            <div className="space-y-6">
                                <div className="text-center space-y-2">
                                    <h2 className="text-xl font-bold">Finalizare Zi</h2>
                                    <p className="text-sm opacity-60">Confirmă orele și semnează pe tabletă.</p>
                                </div>

                                {config?.breakFieldEnabled && (
                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-bold text-center w-full">Minute de pauză (total)</span></label>
                                        <div className="flex items-center gap-4 justify-center">
                                            <button className="btn btn-circle btn-outline btn-primary" onClick={() => setFormData(f => ({ ...f, breakMinutes: Math.max(0, f.breakMinutes - 15) }))}>-15</button>
                                            <span className="text-3xl font-black w-20 text-center">{formData.breakMinutes}</span>
                                            <button className="btn btn-circle btn-outline btn-primary" onClick={() => setFormData(f => ({ ...f, breakMinutes: f.breakMinutes + 15 }))}>+15</button>
                                        </div>
                                    </div>
                                )}

                                {config?.signatureRequiredAtCheckout && (
                                    <div className="space-y-2">
                                        <label className="label"><span className="label-text font-bold">Semnătura ta</span></label>
                                        <div className="bg-base-200 rounded-2xl border-2 border-dashed border-base-300 overflow-hidden relative touch-none">
                                            <SignatureCanvas 
                                                ref={sigCanvas}
                                                penColor='black' 
                                                canvasProps={{
                                                    className: 'signature-canvas w-full h-48 cursor-crosshair',
                                                }}
                                            />
                                            <button 
                                                onClick={() => sigCanvas.current?.clear()}
                                                className="absolute bottom-2 right-2 btn btn-xs btn-ghost gap-1 opacity-40 hover:opacity-100"
                                            >
                                                <RefreshCw size={10} /> Șterge
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="form-control w-full">
                                    <label className="label pb-1"><span className="label-text font-bold text-sm">Note / Observații</span></label>
                                    <textarea 
                                        className="textarea textarea-bordered rounded-2xl h-24 w-full focus:textarea-primary bg-base-200/50"
                                        placeholder="Scrie aici orice observație sau feedback despre tura de astăzi..."
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    />
                                </div>

                                <div className="form-control w-full">
                                    <label className="label cursor-pointer justify-start gap-4">
                                        <input type="checkbox" className="checkbox checkbox-primary rounded-lg" required />
                                        <span className="label-text text-xs leading-snug">Confirm că prezența înregistrată este corectă și am respectat normele evenimentului.</span>
                                    </label>
                                </div>

                                <button 
                                    onClick={() => handleSubmit()}
                                    className="btn btn-primary btn-lg w-full rounded-2xl gap-2 font-bold shadow-xl shadow-primary/20"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? <span className="loading loading-spinner"></span> : <><CheckCircle2 size={20} /> Salvează și Închide</>}
                                </button>
                                
                                <button onClick={() => setStep('action')} className="btn btn-ghost btn-sm w-full">
                                    Înapoi
                                </button>
                            </div>
                        )}

                        {/* STEP: SUCCESS */}
                        {step === 'success' && (
                            <div className="py-8 text-center space-y-8 animate-in fade-in zoom-in duration-500">
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">Prezență Voluntari</div>
                                    <div className="text-xs font-black uppercase tracking-widest opacity-30">Din Grija Pentru Tine</div>
                                </div>

                                <div className="space-y-4">
                                    <div className="w-24 h-24 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto shadow-inner mb-2">
                                        <CheckCircle2 size={48} />
                                    </div>
                                    <h1 className="text-3xl font-black tracking-tight text-base-content">Excelent!</h1>
                                    <p className="text-base font-medium text-base-content/60 leading-relaxed px-4">
                                        {formData.action === 'check-in' 
                                            ? (config?.successMessageCheckIn || 'Check-in înregistrat cu succes!')
                                            : (config?.successMessageCheckOut || 'Check-out înregistrat cu succes!')}
                                    </p>
                                </div>

                                <div className="bg-base-200/50 p-6 rounded-3xl mx-4 space-y-1 border border-base-300/30">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Status curent</p>
                                    <p className="font-bold text-lg">{formData.volunteerFullName}</p>
                                    <p className="text-sm badge badge-ghost uppercase font-black text-[10px] py-3">{formData.action === 'check-in' ? 'Activ (La treabă)' : 'Finalizat (Liber)'}</p>
                                </div>

                                <div className="pt-4 px-4">
                                    <button 
                                        onClick={() => window.location.reload()}
                                        className="btn btn-primary btn-block btn-lg rounded-2xl shadow-xl shadow-primary/20 gap-3"
                                    >
                                        Închide
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                {/* Privacy Section (Standardized with Feedback) */}
                <div className="bg-base-200 p-6 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-base-content/40">
                        <ShieldCheck size={16} /> Confidențialitatea datelor (GDPR)
                    </div>
                    <div className="text-[10px] text-base-content/60 max-h-32 overflow-y-auto pr-2 leading-relaxed prose-markdown">
                        <ReactMarkdown>{config?.privacyNotice}</ReactMarkdown>
                    </div>
                    <div className="text-[10px] font-bold text-base-content/30">
                        Operator: ASOCIAȚIA SĂNĂTATE ȘI EDUCAȚIE • Versiune: 2.1.0-staff
                    </div>
                </div>

                <div className="text-center pb-8 opacity-20 hover:opacity-100 transition-opacity">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content">Din Grija Pentru Tine</p>
                </div>
            </div>
        </div>
    );
}
