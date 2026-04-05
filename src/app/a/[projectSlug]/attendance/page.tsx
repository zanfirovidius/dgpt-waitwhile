'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getProjectBySlug, Project } from '@/app/actions/projects';
import { submitAttendanceAction } from '@/app/actions/attendance';
import { getProjectAttendanceConfig, AttendanceConfig } from '@/app/actions/attendance-config';
import SignatureCanvas from 'react-signature-canvas';
import { 
  CheckCircle2, LogIn, LogOut, 
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
    const prefilledFullName = searchParams.get('fullName') || '';
    const prefilledEmail = searchParams.get('email') || '';
    const prefilledPhone = searchParams.get('phone') || '';
    const prefilledRole = searchParams.get('role') || '';
    const prefilledCnp = searchParams.get('cnp') || '';
    const prefilledIdentitySeries = searchParams.get('identitySeries') || '';
    const prefilledIdentityNumber = searchParams.get('identityNumber') || '';

    const [loading, setLoading] = useState(true);
    const [project, setProject] = useState<Project | null>(null);
    const [config, setConfig] = useState<AttendanceConfig | null>(null);
    const [step, setStep] = useState<Step>('access');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        volunteerFullName: prefilledFullName,
        volunteerEmail: prefilledEmail,
        volunteerPhone: prefilledPhone,
        cnp: prefilledCnp,
        identitySeries: prefilledIdentitySeries,
        identityNumber: prefilledIdentityNumber,
        departmentRole: prefilledRole,
        attendanceDate: new Date().toISOString().split('T')[0],
        token: urlToken || '',
        pin: '',
        action: 'check-in' as 'check-in' | 'check-out',
        breakMinutes: 0,
        notes: '',
        signatureImageId: '',
    });

    const sigCanvas = useRef<SignatureCanvas>(null);
    const availableVolunteerRoles =
        Array.isArray(project?.volunteerRoles) && project.volunteerRoles.length > 0
            ? project.volunteerRoles
            : ['ORGANIZATOR', 'ASISTENT', 'MEDIC', 'SECRETARIAT', 'VOLUNTAR', 'PROTOCOL', 'ȘEF-CABINET'];

    useEffect(() => {
        async function load() {
            try {
                const res = await getProjectBySlug(projectSlug);
                if (!res.success) throw new Error(res.error || 'Proiectul nu a fost găsit.');
                const projectData = res.data?.project;
                if (!projectData) {
                    throw new Error('Proiectul nu a fost găsit.');
                }
                setProject(projectData);

                const confRes = await getProjectAttendanceConfig(projectData.$id);
                if (!confRes.success) throw new Error('Modulul de prezență nu este configurat.');
                setConfig(confRes.data!);
                setStep(resolveInitialStep(confRes.data!, urlToken));
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Eroare la încărcarea formularului.');
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
            if (!formData.cnp.trim() || !formData.identitySeries.trim() || !formData.identityNumber.trim()) {
                setError('CNP-ul, seria CI și numărul CI sunt obligatorii la check-in.');
                return;
            }
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
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Eroare de sistem.');
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
                <div className="rounded-[1.75rem] border border-base-200 bg-base-100 p-6 shadow-sm sm:p-8">
                     <div className="space-y-3 text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-base-content/45">Prezență voluntari</div>
                        <h1 className="text-2xl sm:text-[2rem] font-semibold tracking-tight leading-tight text-base-content">
                            {project?.eventName || project?.name}
                        </h1>
                        <div className="flex items-center justify-center gap-2 text-xs font-medium text-base-content/55">
                            <MapPin size={14} /> {project?.city ? `${project.city}${project.venue ? `, ${project.venue}` : ''}` : (project?.locationName || 'Locație nespecificată')}
                        </div>
                        <p className="pt-1 text-sm font-medium text-base-content/65">
                             Formular de check-in și check-out
                        </p>
                     </div>
                </div>

                <div className="flex flex-col overflow-hidden rounded-[1.75rem] border border-base-200 bg-base-100 shadow-sm">
                    
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
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-base-200 text-primary">
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
                                <button className="btn btn-primary btn-lg w-full rounded-xl gap-2 font-semibold shadow-sm">
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
                                    <div className="space-y-3 rounded-2xl border border-base-200 bg-base-200/30 p-4">
                                        <div>
                                            <p className="text-sm font-bold">Date identitate</p>
                                            <p className="text-xs opacity-50">Obligatorii la check-in. La check-out pot rămâne necompletate.</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div className="form-control sm:col-span-3">
                                                <label className="label pb-1"><span className="label-text font-bold text-xs opacity-70">CNP</span></label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Ex: 196..."
                                                    className="input input-bordered input-md w-full rounded-xl bg-base-100 focus:input-primary"
                                                    value={formData.cnp}
                                                    onChange={(e) => setFormData({ ...formData, cnp: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-control">
                                                <label className="label pb-1"><span className="label-text font-bold text-xs opacity-70">Serie CI</span></label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Ex: RX"
                                                    className="input input-bordered input-md w-full rounded-xl bg-base-100 focus:input-primary uppercase"
                                                    value={formData.identitySeries}
                                                    onChange={(e) => setFormData({ ...formData, identitySeries: e.target.value.toUpperCase() })}
                                                />
                                            </div>
                                            <div className="form-control sm:col-span-2">
                                                <label className="label pb-1"><span className="label-text font-bold text-xs opacity-70">Număr CI</span></label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Ex: 123456"
                                                    className="input input-bordered input-md w-full rounded-xl bg-base-100 focus:input-primary uppercase"
                                                    value={formData.identityNumber}
                                                    onChange={(e) => setFormData({ ...formData, identityNumber: e.target.value.toUpperCase() })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-control">
                                        <label className="label pb-1"><span className="label-text font-bold text-sm">Rol / Departament</span></label>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {availableVolunteerRoles.map((role) => (
                                                <button
                                                    key={role}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, departmentRole: role })}
                                                    className={`btn btn-sm rounded-xl px-4 h-11 flex-1 min-w-[120px] sm:flex-initial ${
                                                        formData.departmentRole === role 
                                                        ? 'btn-ghost border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 font-semibold' 
                                                        : 'btn-ghost border border-base-200 bg-base-200/50 text-base-content/70 hover:bg-base-200 font-medium'
                                                    }`}
                                                >
                                                    {role}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <button className="btn btn-primary btn-lg w-full rounded-xl gap-2 font-semibold shadow-sm">
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
                                        className="btn btn-lg h-28 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] text-base-content shadow-none transition-colors hover:bg-primary/[0.08]"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting && formData.action === 'check-in' ? <span className="loading loading-spinner"></span> : <LogIn size={28} className="text-primary/80" />}
                                        <div className="flex flex-col">
                                            <span className="text-base font-semibold">Check-in</span>
                                            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-base-content/45">Începe activitatea</span>
                                        </div>
                                    </button>
                                    <button 
                                        onClick={() => handleActionSelect('check-out')}
                                        className="btn btn-lg h-28 flex flex-col gap-3 rounded-2xl border border-base-200 bg-base-100 text-base-content shadow-none transition-colors hover:bg-base-200/50"
                                        disabled={isSubmitting}
                                    >
                                        <LogOut size={28} className="text-base-content/70" />
                                        <div className="flex flex-col">
                                            <span className="text-base font-semibold">Check-out</span>
                                            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-base-content/45">Finalizează activitatea</span>
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
                                            <button className="btn btn-circle btn-outline btn-sm border-base-300 text-base-content/70 hover:border-base-400" onClick={() => setFormData(f => ({ ...f, breakMinutes: Math.max(0, f.breakMinutes - 15) }))}>-15</button>
                                            <span className="w-20 text-center text-2xl font-semibold">{formData.breakMinutes}</span>
                                            <button className="btn btn-circle btn-outline btn-sm border-base-300 text-base-content/70 hover:border-base-400" onClick={() => setFormData(f => ({ ...f, breakMinutes: f.breakMinutes + 15 }))}>+15</button>
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
                                                className="absolute bottom-2 right-2 btn btn-sm btn-ghost gap-1 opacity-60 hover:opacity-100"
                                                type="button"
                                                aria-label="Șterge semnătura"
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
                                    className="btn btn-primary btn-lg w-full rounded-xl gap-2 font-semibold shadow-sm"
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
                            <div className="py-8 text-center space-y-8">
                                <div className="space-y-2">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-base-content/45">Prezență voluntari</div>
                                    <div className="text-xs font-semibold uppercase tracking-widest opacity-25">Din Grija Pentru Tine</div>
                                </div>

                                <div className="space-y-4">
                                    <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-success">
                                        <CheckCircle2 size={40} />
                                    </div>
                                    <h1 className="text-2xl font-semibold tracking-tight text-base-content">Confirmat</h1>
                                    <p className="text-base font-medium text-base-content/60 leading-relaxed px-4">
                                        {formData.action === 'check-in' 
                                            ? (config?.successMessageCheckIn || 'Check-in înregistrat cu succes!')
                                            : (config?.successMessageCheckOut || 'Check-out înregistrat cu succes!')}
                                    </p>
                                </div>

                                <div className="mx-4 space-y-2 rounded-2xl border border-base-200 bg-base-200/40 p-6">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest opacity-40">Status curent</p>
                                    <p className="font-bold text-lg">{formData.volunteerFullName}</p>
                                    <p className="badge badge-ghost py-3 text-[10px] font-semibold uppercase">{formData.action === 'check-in' ? 'Activ (La treabă)' : 'Finalizat (Liber)'}</p>
                                </div>

                                <div className="pt-4 px-4">
                                    <button 
                                        onClick={() => window.location.reload()}
                                        className="btn btn-primary btn-block btn-lg rounded-xl gap-3 shadow-sm"
                                    >
                                        Închide
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                {/* Privacy Section (Standardized with Feedback) */}
                <div className="rounded-2xl border border-base-200 bg-base-100 p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/40">
                        <ShieldCheck size={16} /> Confidențialitatea datelor (GDPR)
                    </div>
                    <div className="text-[10px] text-base-content/60 max-h-32 overflow-y-auto pr-2 leading-relaxed prose-markdown">
                        <ReactMarkdown>{config?.privacyNotice}</ReactMarkdown>
                    </div>
                    <div className="text-[10px] font-bold text-base-content/30">
                        Operator: ASOCIAȚIA SĂNĂTATE ȘI EDUCAȚIE • Versiune: 2.1.0-staff
                    </div>
                </div>

                <div className="pb-8 text-center opacity-25">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-base-content">Din Grija Pentru Tine</p>
                </div>
            </div>
        </div>
    );
}
