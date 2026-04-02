'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FileBadge2,
  FileText,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import {
  getDoctorPortalState,
  logoutDoctorPortal,
  requestDoctorPortalAccess,
  verifyDoctorPortalAccess,
  type DoctorPortalState,
} from '@/app/actions/doctor-portal';
import { FileDropzone } from '@/components/FileDropzone';

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(new Date(value), 'dd MMM yyyy', { locale: ro });
  } catch {
    return value;
  }
}

function formatProjectRange(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) {
    return 'Perioadă nespecificată';
  }

  if (startDate && endDate && startDate !== endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  return formatDate(startDate || endDate);
}

export default function DoctorPortalPage() {
  const [loading, setLoading] = useState(true);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [portalState, setPortalState] = useState<DoctorPortalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [deliveryHint, setDeliveryHint] = useState('');
  const [step, setStep] = useState<'identify' | 'verify'>('identify');
  const [uploadingKind, setUploadingKind] = useState<'cv' | 'practice-license' | null>(null);
  const [removingKind, setRemovingKind] = useState<'cv' | 'practice-license' | null>(null);

  const loadPortalState = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getDoctorPortalState();
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut încărca portalul medicului.');
      }

      setPortalState(result.data);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca portalul medicului.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPortalState();
  }, [loadPortalState]);

  const handleRequestAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSendingCode(true);

    try {
      const result = await requestDoctorPortalAccess({ identifier });
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut trimite codul.');
      }

      setDeliveryHint(result.data.maskedDestination);
      setStep('verify');
      setMessage({
        type: 'success',
        text:
          result.data.channel === 'email'
            ? `Ți-am trimis codul pe email la ${result.data.maskedDestination}.`
            : `Ți-am trimis codul prin SMS la ${result.data.maskedDestination}.`,
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
      const result = await verifyDoctorPortalAccess({
        identifier,
        code: otpCode,
      });

      if (!result.success) {
        throw new Error(result.error || 'Codul nu a putut fi verificat.');
      }

      setOtpCode('');
      setStep('identify');
      setDeliveryHint('');
      await loadPortalState();
      setMessage({
        type: 'success',
        text: 'Autentificarea a reușit. Sesiunea este valabilă 15 minute.',
      });
    } catch (verifyError: unknown) {
      setError(verifyError instanceof Error ? verifyError.message : 'Codul nu a putut fi verificat.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleLogout = async () => {
    await logoutDoctorPortal();
    setIdentifier('');
    setOtpCode('');
    setDeliveryHint('');
    setStep('identify');
    setMessage(null);
    await loadPortalState();
  };

  const handleDocumentUpload = async (kind: 'cv' | 'practice-license', file: File) => {
    setUploadingKind(kind);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.set('file', file);

      const response = await fetch(`/api/doctor-portal/documents/${kind}`, {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Documentul nu a putut fi încărcat.');
      }

      await loadPortalState();
      setMessage({
        type: 'success',
        text: kind === 'cv' ? 'CV-ul a fost încărcat.' : 'Documentul de liberă practică a fost încărcat.',
      });
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : 'Documentul nu a putut fi încărcat.');
    } finally {
      setUploadingKind(null);
    }
  };

  const handleDocumentRemove = async (kind: 'cv' | 'practice-license') => {
    setRemovingKind(kind);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/doctor-portal/documents/${kind}`, {
        method: 'DELETE',
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Documentul nu a putut fi eliminat.');
      }

      await loadPortalState();
      setMessage({
        type: 'success',
        text: kind === 'cv' ? 'CV-ul a fost eliminat.' : 'Documentul de liberă practică a fost eliminat.',
      });
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : 'Documentul nu a putut fi eliminat.');
    } finally {
      setRemovingKind(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const activeProjects = useMemo(
    () =>
      (portalState?.projects || []).filter((project) => {
        const cutoff = project.endDate || project.assignments[project.assignments.length - 1]?.assignmentDate || '';
        return !cutoff || cutoff >= today;
      }),
    [portalState?.projects, today],
  );
  const archivedProjects = useMemo(
    () =>
      (portalState?.projects || []).filter((project) => {
        const cutoff = project.endDate || project.assignments[project.assignments.length - 1]?.assignmentDate || '';
        return cutoff && cutoff < today;
      }),
    [portalState?.projects, today],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const isAuthenticated = Boolean(portalState?.authenticated && portalState?.doctor);
  const doctor = portalState?.doctor;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.08),transparent_24%)] bg-base-200 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-primary to-secondary p-8 text-primary-content shadow-2xl shadow-primary/10">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <ShieldCheck size={30} />
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Portal Medic
            </h1>
            <p className="text-base font-medium opacity-90">
              Acces securizat cu cod unic primit pe email sau SMS
            </p>
            <p className="text-sm opacity-80">
              Sesiunea este valabilă 15 minute și îți permite să vezi proiectele curente și să încarci documentele obligatorii.
            </p>
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
                    <FileBadge2 size={26} />
                  </div>
                  <h2 className="text-2xl font-black">Primește codul de acces</h2>
                  <p className="text-sm text-base-content/60">
                    Introdu emailul sau numărul de telefon configurat în registrul medicilor.
                  </p>
                </div>

                <label className="form-control">
                  <span className="label"><span className="label-text font-semibold">Email sau telefon</span></span>
                  <input
                    type="text"
                    className="input input-bordered h-14 text-base"
                    placeholder="ex. doctor@spital.ro sau 07xxxxxxxx"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="username"
                  />
                </label>

                <button type="submit" className="btn btn-primary btn-block h-12" disabled={isSendingCode}>
                  {isSendingCode ? 'Se trimite codul...' : 'Trimite codul de acces'}
                </button>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleVerifyCode}>
                <div className="space-y-2 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-success/10 text-success">
                    <CheckCircle2 size={26} />
                  </div>
                  <h2 className="text-2xl font-black">Verifică tokenul</h2>
                  <p className="text-sm text-base-content/60">
                    Introdu codul primit pe {deliveryHint || 'canalul selectat'}.
                  </p>
                </div>

                <label className="form-control">
                  <span className="label"><span className="label-text font-semibold">Cod de acces</span></span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input input-bordered h-14 text-center text-2xl tracking-[0.35em]"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    autoComplete="one-time-code"
                  />
                </label>

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn btn-ghost flex-1"
                    onClick={() => {
                      setStep('identify');
                      setOtpCode('');
                      setMessage(null);
                    }}
                  >
                    Înapoi
                  </button>
                  <button type="submit" className="btn btn-primary flex-1" disabled={isVerifyingCode}>
                    {isVerifyingCode ? 'Se verifică...' : 'Accesează portalul'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-black text-base-content">{doctor?.fullName}</h2>
                    <p className="mt-1 text-base text-base-content/70">{doctor?.professionalGrade}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-base-content/70">
                      {doctor?.email ? (
                        <span className="badge badge-outline gap-2 px-3 py-3">
                          <Mail size={12} /> {doctor.email}
                        </span>
                      ) : null}
                      {doctor?.phone ? (
                        <span className="badge badge-outline gap-2 px-3 py-3">
                          <Phone size={12} /> {doctor.phone}
                        </span>
                      ) : null}
                      {doctor?.specialty ? (
                        <span className="badge badge-primary badge-outline px-3 py-3">
                          {doctor.specialty}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button type="button" className="btn btn-outline btn-sm gap-2" onClick={handleLogout}>
                    <LogOut size={14} /> Deconectare
                  </button>
                </div>
              </div>

              <section className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <CalendarDays className="text-primary" size={20} />
                  <div>
                    <h3 className="text-xl font-black">Proiecte curente și viitoare</h3>
                    <p className="text-sm text-base-content/60">
                      Proiectele sunt preluate automat din programările tale pe cabinete.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {activeProjects.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-base-300 bg-base-200/60 p-5 text-sm text-base-content/60">
                      Nu există încă proiecte curente sau viitoare asociate acestui cont.
                    </div>
                  ) : (
                    activeProjects.map((project) => {
                      const projectLocation =
                        [project.city, project.venue].filter(Boolean).join(', ') ||
                        project.locationName ||
                        'Locație nespecificată';

                      return (
                        <div key={project.projectId} className="rounded-2xl border border-base-300 bg-base-50 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-lg font-black">{project.eventName || project.name}</h4>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-base-content/70">
                                <span className="badge badge-outline gap-2 px-3 py-3">
                                  <CalendarDays size={12} /> {formatProjectRange(project.startDate, project.endDate)}
                                </span>
                                <span className="badge badge-outline gap-2 px-3 py-3">
                                  <MapPin size={12} /> {projectLocation}
                                </span>
                              </div>
                            </div>
                            <span className="badge badge-primary badge-outline">
                              {project.assignments.length} intervale
                            </span>
                          </div>

                          <div className="mt-4 overflow-x-auto">
                            <table className="table table-sm">
                              <thead>
                                <tr>
                                  <th>Data</th>
                                  <th>Interval</th>
                                  <th>Cabinet</th>
                                  <th>Specialitate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.assignments.map((assignment) => (
                                  <tr key={assignment.assignmentId}>
                                    <td>{formatDate(assignment.assignmentDate)}</td>
                                    <td>{assignment.startTime} - {assignment.endTime}</td>
                                    <td>
                                      {assignment.cabinetName}
                                      {assignment.cabinetIdentifier ? ` (${assignment.cabinetIdentifier})` : ''}
                                    </td>
                                    <td>{assignment.cabinetSpecialty || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {archivedProjects.length > 0 ? (
                <section className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
                  <h3 className="text-lg font-black">Istoric proiecte</h3>
                  <div className="mt-4 space-y-3">
                    {archivedProjects.map((project) => (
                      <div key={project.projectId} className="rounded-2xl border border-base-300 bg-base-50 px-4 py-3 text-sm">
                        <div className="font-bold">{project.eventName || project.name}</div>
                        <div className="text-base-content/60">
                          {formatProjectRange(project.startDate, project.endDate)} • {project.assignments.length} intervale
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="space-y-6">
              <section className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <FileText className="text-primary" size={20} />
                  <div>
                    <h3 className="text-xl font-black">Documente profesionale</h3>
                    <p className="text-sm text-base-content/60">
                      Încarcă PDF-urile necesare pentru validarea participării la proiecte.
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  {(portalState?.documents || []).map((document) => (
                    <div key={document.kind} className="rounded-2xl border border-base-300 bg-base-50 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold">{document.title}</h4>
                          <p className="text-xs text-base-content/60">
                            {document.isUploaded
                              ? `Încărcat la ${formatDate(document.uploadedAt)}${document.fileName ? ` • ${document.fileName}` : ''}`
                              : 'Nu există încă un fișier încărcat.'}
                          </p>
                        </div>
                        <span className={`badge ${document.isUploaded ? 'badge-success' : 'badge-outline'}`}>
                          {document.isUploaded ? 'Încărcat' : 'Lipsește'}
                        </span>
                      </div>

                      <FileDropzone
                        accept=".pdf,application/pdf"
                        title={uploadingKind === document.kind ? 'Se încarcă...' : document.isUploaded ? 'Înlocuiește PDF-ul' : 'Încarcă PDF-ul'}
                        subtitle={document.isUploaded ? 'Selectează un PDF nou pentru a-l înlocui.' : 'Acceptă doar fișiere PDF.'}
                        hint="PDF, maxim 10 MB"
                        disabled={uploadingKind === document.kind}
                        onFileSelected={(file) => handleDocumentUpload(document.kind, file)}
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        {document.href ? (
                          <a href={document.href} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                            Vezi PDF
                          </a>
                        ) : null}
                        {document.isUploaded ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-error"
                            disabled={removingKind === document.kind}
                            onClick={() => void handleDocumentRemove(document.kind)}
                          >
                            {removingKind === document.kind ? 'Se elimină...' : 'Elimină'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
