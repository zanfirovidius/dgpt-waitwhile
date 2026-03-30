'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getVolunteerPortalState,
  logoutVolunteerPortal,
  requestVolunteerPortalAccess,
  updateVolunteerPortalProfile,
  verifyVolunteerPortalAccess,
  type VolunteerPortalState,
} from '@/app/actions/volunteer-portal';
import type { ProjectVolunteer } from '@/app/actions/volunteers';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  MapPin,
  Save,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

type PortalProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  cnp: string;
  identitySeries: string;
  identityNumber: string;
};

function formatDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(new Date(value), 'dd MMM yyyy, HH:mm', { locale: ro });
  } catch {
    return value;
  }
}

function buildProfileForm(volunteer?: ProjectVolunteer | null): PortalProfileForm {
  return {
    firstName: volunteer?.firstName || '',
    lastName: volunteer?.lastName || '',
    email: volunteer?.email || '',
    phone: volunteer?.phone || '',
    address: volunteer?.address || '',
    cnp: volunteer?.cnp || '',
    identitySeries: volunteer?.identitySeries || '',
    identityNumber: volunteer?.identityNumber || '',
  };
}

export default function VolunteerPortalPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [loading, setLoading] = useState(true);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [portalState, setPortalState] = useState<VolunteerPortalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'identify' | 'verify'>('identify');
  const [profileForm, setProfileForm] = useState<PortalProfileForm>(buildProfileForm());

  const loadPortalState = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getVolunteerPortalState(projectSlug);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut încărca portalul.');
      }

      setPortalState(result.data);
      if (result.data.authenticated) {
        setProfileForm(buildProfileForm(result.data.volunteer));
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca portalul.');
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void loadPortalState();
  }, [loadPortalState]);

  const handleRequestAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSendingCode(true);

    try {
      const result = await requestVolunteerPortalAccess({
        projectSlug,
        identifier,
      });

      if (!result.success) {
        throw new Error(result.error || 'Nu am putut trimite codul de acces.');
      }

      setMaskedPhone(result.data.maskedPhone);
      setStep('verify');
      setMessage({
        type: 'success',
        text: `Ți-am trimis un cod SMS pe ${result.data.maskedPhone}.`,
      });
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Nu am putut trimite codul.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsVerifyingCode(true);

    try {
      const result = await verifyVolunteerPortalAccess({
        projectSlug,
        identifier,
        code: otpCode,
      });

      if (!result.success) {
        throw new Error(result.error || 'Codul nu a putut fi verificat.');
      }

      setOtpCode('');
      setStep('identify');
      await loadPortalState();
      setMessage({
        type: 'success',
        text: 'Autentificarea a reușit.',
      });
    } catch (verifyError: unknown) {
      setError(verifyError instanceof Error ? verifyError.message : 'Codul nu a putut fi verificat.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleLogout = async () => {
    await logoutVolunteerPortal();
    setIdentifier('');
    setOtpCode('');
    setMaskedPhone('');
    setMessage(null);
    await loadPortalState();
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingProfile(true);

    try {
      const result = await updateVolunteerPortalProfile({
        projectSlug,
        ...profileForm,
      });

      if (!result.success) {
        throw new Error(result.error || 'Nu am putut salva profilul.');
      }

      setProfileForm(buildProfileForm(result.data));
      await loadPortalState();
      setMessage({
        type: 'success',
        text: 'Profilul a fost actualizat.',
      });
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Nu am putut actualiza profilul.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const projectName = portalState?.project?.eventName || portalState?.project?.name || 'Portal voluntar';
  const projectLocation =
    [portalState?.project?.city, portalState?.project?.venue].filter(Boolean).join(', ') ||
    portalState?.project?.locationName ||
    'Locație nespecificată';

  const isAuthenticated = Boolean(portalState?.authenticated && portalState?.volunteer);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.08),transparent_25%)] bg-base-200 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-primary to-secondary p-8 text-primary-content shadow-2xl shadow-primary/10">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <ShieldCheck size={30} />
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Portal Voluntar
            </h1>
            <p className="text-base font-medium opacity-90">{projectName}</p>
            <div className="flex flex-col items-center justify-center gap-2 text-sm font-semibold opacity-90 sm:flex-row">
              <span className="flex items-center gap-2">
                <MapPin size={14} /> {projectLocation}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="alert alert-error rounded-2xl text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className={`alert rounded-2xl text-sm ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{message.text}</span>
          </div>
        )}

        {!isAuthenticated ? (
          <div className="mx-auto max-w-xl rounded-[2rem] border border-base-300/60 bg-base-100 p-6 shadow-xl sm:p-8">
            {step === 'identify' ? (
              <form className="space-y-6" onSubmit={handleRequestAccess}>
                <div className="space-y-2 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                    <Smartphone size={26} />
                  </div>
                  <h2 className="text-xl font-black tracking-tight">Primește codul de acces</h2>
                  <p className="text-sm text-base-content/60">
                    Introdu emailul sau telefonul cu care ai fost înregistrat. Dacă există un număr de telefon în proiect, îți trimitem codul prin SMS.
                  </p>
                </div>

                <label className="form-control">
                  <span className="label-text pb-2 text-sm font-bold">Email sau telefon</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl"
                    placeholder="ex: +4072..., sau nume@email.ro"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    required
                  />
                </label>

                <button className="btn btn-primary btn-lg w-full rounded-2xl gap-2" disabled={isSendingCode}>
                  {isSendingCode ? <span className="loading loading-spinner loading-sm" /> : <Smartphone size={18} />}
                  Trimite codul
                </button>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleVerifyCode}>
                <div className="space-y-2 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                    <ShieldCheck size={26} />
                  </div>
                  <h2 className="text-xl font-black tracking-tight">Confirmă codul SMS</h2>
                  <p className="text-sm text-base-content/60">
                    Codul a fost trimis pe {maskedPhone || 'telefonul configurat'} și este valabil 3 minute.
                  </p>
                </div>

                <label className="form-control">
                  <span className="label-text pb-2 text-sm font-bold">Cod OTP</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl text-center tracking-[0.35em]"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    required
                  />
                </label>

                <div className="flex gap-3">
                  <button type="button" className="btn btn-ghost flex-1 rounded-2xl" onClick={() => setStep('identify')}>
                    Înapoi
                  </button>
                  <button className="btn btn-primary flex-1 rounded-2xl gap-2" disabled={isVerifyingCode}>
                    {isVerifyingCode ? <span className="loading loading-spinner loading-sm" /> : <ShieldCheck size={18} />}
                    Verifică
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[2rem] border border-base-300/60 bg-base-100 p-6 shadow-xl sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-primary/60">Profil voluntar</p>
                    <h2 className="text-2xl font-black tracking-tight">
                      {portalState?.volunteer?.firstName} {portalState?.volunteer?.lastName}
                    </h2>
                    <div className="flex flex-wrap gap-2 text-sm text-base-content/60">
                      <span className="badge badge-ghost">{portalState?.volunteer?.activityCategory || 'Voluntar'}</span>
                      <span className="badge badge-outline">{portalState?.volunteer?.status || 'active'}</span>
                    </div>
                  </div>

                  <button className="btn btn-outline btn-sm gap-2 rounded-2xl" onClick={handleLogout}>
                    <LogOut size={14} /> Deconectare
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-base-content/40">Acces pontaj</p>
                    <p className="mt-2 text-sm text-base-content/70">
                      Intră direct în formularul de prezență cu datele tale precompletate.
                    </p>
                    {portalState?.attendanceUrl ? (
                      <a href={portalState.attendanceUrl} className="btn btn-primary btn-sm mt-4 w-full rounded-xl">
                        Deschide pontajul
                      </a>
                    ) : (
                      <div className="badge badge-ghost mt-4">Indisponibil</div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-base-content/40">Documente</p>
                    <p className="mt-2 text-sm text-base-content/70">
                      Aici vor apărea documentele tale de semnat pe măsură ce modulul este activat.
                    </p>
                    <div className="badge badge-ghost mt-4">
                      {portalState?.documents.length || 0} documente
                    </div>
                  </div>

                  <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-base-content/40">Istoric pontaj</p>
                    <p className="mt-2 text-sm text-base-content/70">
                      Vezi rapid ultimele tale check-in-uri și validările de coordonator.
                    </p>
                    <div className="badge badge-ghost mt-4">
                      {portalState?.attendanceHistory?.length || 0} înregistrări
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-base-300/60 bg-base-100 p-6 shadow-xl sm:p-8">
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-primary/60">Documente de semnat</p>
                  <h3 className="text-xl font-black tracking-tight">Semnături & documente</h3>
                  <p className="text-sm text-base-content/60">
                    Modulul e pregătit pentru documente publice și semnare. În prezent nu există documente active pentru acest proiect.
                  </p>
                </div>

                <div className="mt-6 rounded-3xl border border-dashed border-base-300 bg-base-200/40 p-8 text-center">
                  <FileText size={40} className="mx-auto mb-4 opacity-30" />
                  <p className="font-semibold">Nicio acțiune pending</p>
                  <p className="mt-1 text-sm text-base-content/50">
                    Când vor exista documente sau formulare de semnat, le vei găsi aici.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <form className="rounded-[2rem] border border-base-300/60 bg-base-100 p-6 shadow-xl sm:p-8" onSubmit={handleSaveProfile}>
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-primary/60">Date personale</p>
                  <h3 className="text-xl font-black tracking-tight">Actualizează profilul</h3>
                  <p className="text-sm text-base-content/60">
                    Numele, contactul și datele de identitate completate aici vor fi folosite în modulele publice ale proiectului.
                  </p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text pb-2 text-sm font-bold">Prenume</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.firstName}
                      onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text pb-2 text-sm font-bold">Nume</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.lastName}
                      onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text pb-2 text-sm font-bold">Email</span>
                    <input
                      type="email"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.email}
                      onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text pb-2 text-sm font-bold">Telefon</span>
                    <input
                      type="tel"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.phone}
                      onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </label>
                  <label className="form-control md:col-span-2">
                    <span className="label-text pb-2 text-sm font-bold">Adresă</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.address}
                      onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text pb-2 text-sm font-bold">CNP</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.cnp}
                      onChange={(event) => setProfileForm((current) => ({ ...current, cnp: event.target.value }))}
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text pb-2 text-sm font-bold">Serie CI</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.identitySeries}
                      onChange={(event) => setProfileForm((current) => ({ ...current, identitySeries: event.target.value }))}
                    />
                  </label>
                  <label className="form-control md:col-span-2">
                    <span className="label-text pb-2 text-sm font-bold">Număr CI</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-2xl"
                      value={profileForm.identityNumber}
                      onChange={(event) => setProfileForm((current) => ({ ...current, identityNumber: event.target.value }))}
                    />
                  </label>
                </div>

                <button className="btn btn-primary mt-6 w-full gap-2 rounded-2xl" disabled={isSavingProfile}>
                  {isSavingProfile ? <span className="loading loading-spinner loading-sm" /> : <Save size={18} />}
                  Salvează profilul
                </button>
              </form>

              <div className="rounded-[2rem] border border-base-300/60 bg-base-100 p-6 shadow-xl sm:p-8">
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-primary/60">Istoric</p>
                  <h3 className="text-xl font-black tracking-tight">Prezențe recente</h3>
                </div>

                <div className="mt-6 space-y-3">
                  {(portalState?.attendanceHistory || []).length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-base-300 bg-base-200/40 p-8 text-center">
                      <Clock3 size={36} className="mx-auto mb-4 opacity-30" />
                      <p className="font-semibold">Nicio prezență încă</p>
                      <p className="mt-1 text-sm text-base-content/50">
                        Când faci check-in sau check-out în proiect, istoricul va apărea aici.
                      </p>
                    </div>
                  ) : (
                    (portalState?.attendanceHistory || []).map((entry) => (
                      <div key={entry.$id} className="rounded-2xl border border-base-200 bg-base-100 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="font-semibold">{entry.attendanceDate}</p>
                            <p className="text-sm text-base-content/60">
                              Check-in: {formatDateTime(entry.checkInAt)} • Check-out: {formatDateTime(entry.checkOutAt)}
                            </p>
                            <div className="flex flex-wrap gap-2 text-xs text-base-content/60">
                              <span className="badge badge-ghost">{entry.departmentRole || 'Rol nespecificat'}</span>
                              {entry.totalHoursDecimal !== undefined && (
                                <span className="badge badge-outline">{entry.totalHoursDecimal.toFixed(2)} h</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            <div className={`badge ${entry.coordinatorValidated ? 'badge-success' : 'badge-ghost'}`}>
                              {entry.coordinatorValidated ? 'Validat' : 'În așteptare'}
                            </div>
                            <p className="mt-2 text-base-content/50">
                              {entry.coordinatorValidatedAt ? formatDateTime(entry.coordinatorValidatedAt) : 'Fără validare'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
