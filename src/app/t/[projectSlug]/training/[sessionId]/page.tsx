'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import { AlertCircle, CheckCircle2, ChevronRight, KeyRound, MapPin, RefreshCw, ShieldCheck, Signature, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { getPublicTrainingSession, submitTrainingAttendanceAction } from '@/app/actions/training';
import type { TrainingSession } from '@/lib/training-types';

type Step = 'access' | 'form' | 'success';

function resolveStep(session: TrainingSession | null, token: string | null) {
  if (!session) {
    return 'access' as const;
  }

  if (!session.accessToken) {
    return 'form' as const;
  }

  if (token && session.accessToken === token) {
    return 'form' as const;
  }

  return 'access' as const;
}

export default function PublicTrainingAttendancePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectSlug = params.projectSlug as string;
  const sessionId = params.sessionId as string;
  const initialToken = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [step, setStep] = useState<Step>('access');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    volunteerName: '',
    cnp: '',
    identitySeries: '',
    identityNumber: '',
    accessToken: initialToken || '',
    confirmedParticipation: false,
    website: '',
  });

  const signatureRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await getPublicTrainingSession(projectSlug, sessionId);
        if (!result.success) {
          throw new Error(result.error || 'Sesiunea nu este disponibilă.');
        }

        if (cancelled) {
          return;
        }

        setSession(result.data.session);
        setProjectName(result.data.project.eventName || result.data.project.name || 'Instructaj colectiv');
        setProjectLocation(
          [result.data.project.city, result.data.project.venue]
            .filter(Boolean)
            .join(', ') || result.data.project.locationName || result.data.session.location,
        );
        setConfirmationText(result.data.confirmationText);
        setStep(resolveStep(result.data.session, initialToken));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Nu am putut încărca sesiunea.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialToken, projectSlug, sessionId]);

  const formattedDate = useMemo(() => {
    if (!session?.trainingDate) {
      return '-';
    }

    try {
      return format(new Date(session.trainingDate), 'EEEE, d MMMM yyyy', { locale: ro });
    } catch {
      return session.trainingDate;
    }
  }, [session?.trainingDate]);

  const handleAccessSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!session?.accessToken) {
      setStep('form');
      return;
    }

    if (formData.accessToken.trim() !== session.accessToken) {
      setError('Token-ul introdus nu este valid.');
      return;
    }

    setStep('form');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (formData.website.trim()) {
      setError('Formular invalid.');
      return;
    }

    if (!session) {
      setError('Sesiunea nu este disponibilă.');
      return;
    }

    if (session.status !== 'collecting') {
      setError('Sesiunea nu mai acceptă semnături în acest moment.');
      return;
    }

    if (!formData.volunteerName.trim()) {
      setError('Numele și prenumele sunt obligatorii.');
      return;
    }

    if (!formData.cnp.trim()) {
      setError('CNP-ul este obligatoriu.');
      return;
    }

    if (!formData.identitySeries.trim() || !formData.identityNumber.trim()) {
      setError('Seria și numărul cărții de identitate sunt obligatorii.');
      return;
    }

    if (!formData.confirmedParticipation) {
      setError('Confirmarea participării este obligatorie.');
      return;
    }

    if (signatureRef.current?.isEmpty()) {
      setError('Semnătura este obligatorie.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitTrainingAttendanceAction({
        projectSlug,
        sessionId,
        volunteerName: formData.volunteerName,
        cnp: formData.cnp,
        identitySeries: formData.identitySeries,
        identityNumber: formData.identityNumber,
        accessToken: formData.accessToken,
        confirmedParticipation: formData.confirmedParticipation,
        signatureDataUrl: signatureRef.current?.getTrimmedCanvas().toDataURL('image/png') || '',
      });

      if (!result.success) {
        setError(result.error || 'Nu am putut salva semnătura.');
        return;
      }

      setStep('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare de sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.08),transparent_25%)] bg-base-200 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-primary to-secondary p-8 text-primary-content shadow-2xl shadow-primary/10">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <ShieldCheck size={30} />
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Instructaj Colectiv SSM/SU
            </h1>
            <p className="text-base font-medium opacity-90">{session?.eventName || projectName}</p>
            <div className="flex flex-col items-center justify-center gap-2 text-sm font-semibold opacity-90 sm:flex-row">
              <span>{formattedDate}</span>
              <span className="hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-2">
                <MapPin size={14} />
                {session?.location || projectLocation || 'Locație nespecificată'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="alert alert-error rounded-2xl text-sm shadow-lg">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {session?.status !== 'collecting' && step !== 'success' ? (
          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-base-200 text-base-content/60">
              <RefreshCw size={26} />
            </div>
            <h2 className="text-xl font-black">
              {session?.status === 'finalized' ? 'Sesiunea a fost finalizată' : 'Sesiunea nu este încă deschisă'}
            </h2>
            <p className="mt-3 text-sm text-base-content/60">
              Colectarea digitală de semnături este disponibilă doar când sesiunea este în starea <strong>collecting</strong>.
            </p>
          </div>
        ) : null}

        {session?.status === 'collecting' && step === 'access' && (
          <form onSubmit={handleAccessSubmit} className="rounded-[2rem] border border-base-300 bg-base-100 p-8 shadow-xl">
            <div className="mx-auto max-w-xl space-y-6">
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                  <KeyRound size={28} />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Verificare acces sesiune</h2>
                <p className="text-sm text-base-content/60">
                  Introduceți token-ul primit de la coordonator pentru a semna procesul verbal digital.
                </p>
              </div>

              <label className="form-control gap-2">
                <span className="label-text font-bold">Token sesiune</span>
                <input
                  type="text"
                  className="input input-bordered input-lg rounded-2xl text-center font-mono tracking-[0.25em]"
                  value={formData.accessToken}
                  onChange={(event) => setFormData((current) => ({ ...current, accessToken: event.target.value.toUpperCase() }))}
                  required
                />
              </label>

              <button className="btn btn-primary btn-lg w-full rounded-2xl gap-2 shadow-xl shadow-primary/20">
                Continuă
                <ChevronRight size={18} />
              </button>
            </div>
          </form>
        )}

        {session?.status === 'collecting' && step === 'form' && (
          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-xl sm:p-8">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary/10 text-secondary">
                  <Signature size={28} />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Semnează participarea la instructaj</h2>
                <p className="text-sm text-base-content/60">
                  Completează doar datele esențiale, apoi semnează în zona de mai jos.
                </p>
              </div>

              <input
                type="text"
                autoComplete="off"
                tabIndex={-1}
                className="hidden"
                value={formData.website}
                onChange={(event) => setFormData((current) => ({ ...current, website: event.target.value }))}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="form-control gap-2 sm:col-span-2">
                  <span className="label-text font-bold">Nume și prenume</span>
                  <div className="relative">
                    <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base-content/35" />
                    <input
                      type="text"
                      className="input input-bordered input-lg w-full rounded-2xl pl-12"
                      placeholder="Ex: Popescu Maria"
                      value={formData.volunteerName}
                      onChange={(event) => setFormData((current) => ({ ...current, volunteerName: event.target.value }))}
                      required
                    />
                  </div>
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-bold">CNP</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input input-bordered input-lg rounded-2xl"
                    placeholder="Obligatoriu"
                    value={formData.cnp}
                    onChange={(event) => setFormData((current) => ({ ...current, cnp: event.target.value }))}
                    required
                  />
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-bold">Serie carte identitate</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl uppercase"
                    placeholder="Ex: RX"
                    value={formData.identitySeries}
                    onChange={(event) => setFormData((current) => ({ ...current, identitySeries: event.target.value.toUpperCase() }))}
                    required
                  />
                </label>

                <label className="form-control gap-2 sm:col-span-2">
                  <span className="label-text font-bold">Număr carte identitate</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl uppercase"
                    placeholder="Ex: 123456"
                    value={formData.identityNumber}
                    onChange={(event) => setFormData((current) => ({ ...current, identityNumber: event.target.value.toUpperCase() }))}
                    required
                  />
                </label>

                <div className="rounded-2xl border border-base-300 bg-base-200/50 p-4 sm:col-span-2">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary mt-1 rounded-lg"
                      checked={formData.confirmedParticipation}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, confirmedParticipation: event.target.checked }))
                      }
                    />
                    <span className="text-sm font-medium leading-6">
                      {confirmationText || 'Confirm participarea la instructajul SSM/SU'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-base-content/60">Semnătură</h3>
                    <p className="text-xs text-base-content/50">Semnează cu degetul sau cu stylus-ul.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm rounded-xl"
                    onClick={() => signatureRef.current?.clear()}
                  >
                    Șterge
                  </button>
                </div>

                <div className="overflow-hidden rounded-[1.75rem] border border-base-300 bg-white shadow-inner">
                  <SignatureCanvas
                    ref={signatureRef}
                    penColor="#0f172a"
                    canvasProps={{
                      className: 'h-64 w-full',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg w-full rounded-2xl gap-2 shadow-xl shadow-primary/20"
                disabled={isSubmitting}
              >
                {isSubmitting ? <span className="loading loading-spinner loading-sm" /> : 'Semnează și salvează'}
              </button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="rounded-[2rem] border border-success/20 bg-base-100 p-8 text-center shadow-xl">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 size={42} />
            </div>
            <h2 className="text-2xl font-black tracking-tight">Semnătura a fost înregistrată</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-base-content/60">
              Participarea ta a fost adăugată în sesiunea de instructaj. Poți preda tableta următorului participant.
            </p>
            <button
              type="button"
              className="btn btn-outline btn-lg mt-6 rounded-2xl"
              onClick={() => {
                signatureRef.current?.clear();
                setFormData({
                  volunteerName: '',
                  cnp: '',
                  identitySeries: '',
                  identityNumber: '',
                  accessToken: formData.accessToken,
                  confirmedParticipation: false,
                  website: '',
                });
                setStep('form');
              }}
            >
              Înregistrează următorul participant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
