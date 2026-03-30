'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Mail,
  MapPin,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import {
  INCIDENT_AFFECTED_CATEGORY_OPTIONS,
  INCIDENT_DATA_TYPE_OPTIONS,
  INCIDENT_FORM_INTRO,
  INCIDENT_TYPE_OPTIONS,
} from '@/lib/incident-defaults';
import { createIncidentReport, getPublicIncidentReportingContext } from '@/app/actions/incidents';

type PublicIncidentFormState = {
  discoveredAt: string;
  location: string;
  reporterName: string;
  reporterRole: string;
  reporterContact: string;
  incidentType: string;
  description: string;
  affectedCategories: string[];
  affectedCount: string;
  dataTypes: string[];
  immediateActions: string;
  website: string;
};

function getDefaultDiscoveredAt() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - timezoneOffset * 60000);
  return localDate.toISOString().slice(0, 16);
}

export default function PublicIncidentReportingPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [dpoName, setDpoName] = useState('');
  const [dpoEmail, setDpoEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<PublicIncidentFormState>({
    discoveredAt: getDefaultDiscoveredAt(),
    location: '',
    reporterName: '',
    reporterRole: '',
    reporterContact: '',
    incidentType: INCIDENT_TYPE_OPTIONS[0],
    description: '',
    affectedCategories: [] as string[],
    affectedCount: '',
    dataTypes: [] as string[],
    immediateActions: '',
    website: '',
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await getPublicIncidentReportingContext(projectSlug);
        if (!result.success) {
          throw new Error(result.error || 'Formularul de incident nu este disponibil.');
        }

        if (cancelled) {
          return;
        }

        setProjectName(result.data.project.eventName || result.data.project.name || 'Raportare incident');
        const derivedLocation =
          [result.data.project.city, result.data.project.venue]
            .filter(Boolean)
            .join(', ') || result.data.project.locationName || '';
        setProjectLocation(derivedLocation);
        setDpoName(result.data.organizer.dpoName || '');
        setDpoEmail(result.data.organizer.dpoEmail || '');
        setFormData((current) => ({
          ...current,
          location: current.location || derivedLocation,
        }));
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca formularul.');
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
  }, [projectSlug]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        formData.discoveredAt.trim() &&
          formData.incidentType.trim() &&
          formData.description.trim() &&
          !isSubmitting,
      ),
    [formData.description, formData.discoveredAt, formData.incidentType, isSubmitting],
  );

  const toggleArrayValue = (
    field: 'affectedCategories' | 'dataTypes',
    value: string,
  ) => {
    setFormData((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!formData.discoveredAt.trim()) {
      setError('Data și ora descoperirii sunt obligatorii.');
      return;
    }

    if (!formData.incidentType.trim()) {
      setError('Tipul incidentului este obligatoriu.');
      return;
    }

    if (!formData.description.trim()) {
      setError('Descrierea incidentului este obligatorie.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createIncidentReport({
        projectSlug,
        discoveredAt: formData.discoveredAt,
        location: formData.location,
        reporterName: formData.reporterName,
        reporterRole: formData.reporterRole,
        reporterContact: formData.reporterContact,
        incidentType: formData.incidentType,
        description: formData.description,
        affectedCategories: formData.affectedCategories,
        affectedCount: formData.affectedCount,
        dataTypes: formData.dataTypes,
        immediateActions: formData.immediateActions,
        website: formData.website,
      });

      if (!result.success) {
        setError(result.error || 'Nu am putut trimite incidentul.');
        return;
      }

      setSuccessMessage(
        `Incidentul a fost înregistrat cu succes${result.data.$id ? ` (#${result.data.$id})` : ''}. Responsabilul GDPR a fost notificat conform configurației disponibile.`,
      );
      setFormData({
        discoveredAt: getDefaultDiscoveredAt(),
        location: projectLocation,
        reporterName: '',
        reporterRole: '',
        reporterContact: '',
        incidentType: INCIDENT_TYPE_OPTIONS[0],
        description: '',
        affectedCategories: [],
        affectedCount: '',
        dataTypes: [],
        immediateActions: '',
        website: '',
      });
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Eroare de sistem.');
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.18),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.08),transparent_25%)] bg-base-200 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-error/10 bg-gradient-to-br from-error to-warning p-8 text-error-content shadow-2xl shadow-error/10">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <ShieldAlert size={30} />
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Raportare Incident GDPR / Securitate
            </h1>
            <p className="text-base font-medium opacity-90">{projectName}</p>
            <div className="flex flex-col items-center justify-center gap-2 text-sm font-semibold opacity-90 sm:flex-row">
              <span className="flex items-center gap-2">
                <MapPin size={14} /> {projectLocation || 'Locație nespecificată'}
              </span>
              {(dpoName || dpoEmail) && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="flex items-center gap-2">
                    <Mail size={14} /> {dpoName || dpoEmail}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-base-300/60 bg-base-100 p-6 shadow-xl sm:p-8">
          <div className="mb-6 space-y-2">
            <h2 className="text-xl font-black tracking-tight">Formular rapid de incident</h2>
            <p className="text-sm text-base-content/70">{INCIDENT_FORM_INTRO}</p>
          </div>

          {error && (
            <div className="alert alert-error mb-6 rounded-2xl text-sm">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="alert alert-success mb-6 rounded-2xl text-sm">
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          <form className="space-y-8" onSubmit={handleSubmit}>
            <input
              type="text"
              value={formData.website}
              onChange={(event) => setFormData((current) => ({ ...current, website: event.target.value }))}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
            />

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-error/10 text-error">
                  <Clock3 size={18} />
                </div>
                <div>
                  <h3 className="font-bold">1. Informații generale</h3>
                  <p className="text-xs text-base-content/50">Completează cât mai rapid datele de bază.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="form-control">
                  <span className="label-text pb-2 text-sm font-bold">Descoperit la</span>
                  <input
                    type="datetime-local"
                    className="input input-bordered input-lg rounded-2xl"
                    value={formData.discoveredAt}
                    onChange={(event) => setFormData((current) => ({ ...current, discoveredAt: event.target.value }))}
                    required
                  />
                </label>
                <label className="form-control">
                  <span className="label-text pb-2 text-sm font-bold">Locație</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl"
                    placeholder="Ex: recepție, laptop coordonator, email"
                    value={formData.location}
                    onChange={(event) => setFormData((current) => ({ ...current, location: event.target.value }))}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text pb-2 text-sm font-bold">Nume raportor</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl"
                    placeholder="Nume și prenume"
                    value={formData.reporterName}
                    onChange={(event) => setFormData((current) => ({ ...current, reporterName: event.target.value }))}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text pb-2 text-sm font-bold">Rol raportor</span>
                  <input
                    type="text"
                    className="input input-bordered input-lg rounded-2xl"
                    placeholder="Ex: voluntar, coordonator, medic"
                    value={formData.reporterRole}
                    onChange={(event) => setFormData((current) => ({ ...current, reporterRole: event.target.value }))}
                  />
                </label>
              </div>

              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Contact raportor</span>
                <input
                  type="text"
                  className="input input-bordered input-lg rounded-2xl"
                  placeholder="Telefon sau email pentru follow-up"
                  value={formData.reporterContact}
                  onChange={(event) => setFormData((current) => ({ ...current, reporterContact: event.target.value }))}
                />
                <span className="label-text-alt pt-2 text-xs text-base-content/50">Opțional, dar recomandat pentru clarificări.</span>
              </label>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h3 className="font-bold">2. Tip incident</h3>
                  <p className="text-xs text-base-content/50">Alege categoria care descrie cel mai bine situația.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {INCIDENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFormData((current) => ({ ...current, incidentType: option }))}
                    className={`btn h-auto min-h-[72px] justify-start rounded-2xl border-none px-5 py-4 text-left ${
                      formData.incidentType === option
                        ? 'btn-error shadow-lg shadow-error/20'
                        : 'bg-base-200 text-base-content hover:bg-base-300'
                    }`}
                  >
                    <span className="whitespace-normal text-sm font-bold">{option}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UserRound size={18} />
                </div>
                <div>
                  <h3 className="font-bold">3. Descriere și impact</h3>
                  <p className="text-xs text-base-content/50">Descrie pe scurt ce s-a întâmplat și ce date pot fi afectate.</p>
                </div>
              </div>

              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Descriere detaliată</span>
                <textarea
                  className="textarea textarea-bordered min-h-36 rounded-2xl text-base"
                  placeholder="Ce s-a întâmplat, cum a fost observat, ce sisteme/documente sunt implicate?"
                  value={formData.description}
                  onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                  required
                />
              </label>

              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3 rounded-3xl border border-base-200 bg-base-200/30 p-5">
                  <p className="text-sm font-bold">Categorii afectate</p>
                  <div className="flex flex-wrap gap-3">
                    {INCIDENT_AFFECTED_CATEGORY_OPTIONS.map((option) => (
                      <label key={option} className="label cursor-pointer gap-3 rounded-2xl border border-base-300 bg-base-100 px-4 py-3">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary"
                          checked={formData.affectedCategories.includes(option)}
                          onChange={() => toggleArrayValue('affectedCategories', option)}
                        />
                        <span className="label-text text-sm font-medium capitalize">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="form-control rounded-3xl border border-base-200 bg-base-200/30 p-5">
                  <span className="label-text pb-2 text-sm font-bold">Număr aproximativ persoane afectate</span>
                  <input
                    type="number"
                    min="0"
                    className="input input-bordered input-lg rounded-2xl"
                    placeholder="Ex: 25"
                    value={formData.affectedCount}
                    onChange={(event) => setFormData((current) => ({ ...current, affectedCount: event.target.value }))}
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-3xl border border-base-200 bg-base-200/30 p-5">
                <p className="text-sm font-bold">Tipuri de date compromise</p>
                <div className="flex flex-wrap gap-3">
                  {INCIDENT_DATA_TYPE_OPTIONS.map((option) => (
                    <label key={option} className="label cursor-pointer gap-3 rounded-2xl border border-base-300 bg-base-100 px-4 py-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-secondary"
                        checked={formData.dataTypes.includes(option)}
                        onChange={() => toggleArrayValue('dataTypes', option)}
                      />
                      <span className="label-text text-sm font-medium capitalize">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Acțiuni imediate</span>
                <textarea
                  className="textarea textarea-bordered min-h-28 rounded-2xl text-base"
                  placeholder="Ce măsuri ai luat deja? Ex: blocare cont, recuperare documente, informare coordonator."
                  value={formData.immediateActions}
                  onChange={(event) => setFormData((current) => ({ ...current, immediateActions: event.target.value }))}
                />
              </label>
            </section>

            <div className="rounded-3xl border border-warning/20 bg-warning/10 p-5 text-sm text-base-content/80">
              Incidentul va fi înregistrat în registrul intern și transmis responsabilului DPO configurat pentru proiect. Nu include date mai multe decât este necesar pentru evaluare.
            </div>

            <button
              type="submit"
              className="btn btn-error btn-lg w-full gap-2 rounded-2xl shadow-xl shadow-error/20"
              disabled={!canSubmit}
            >
              {isSubmitting ? <span className="loading loading-spinner loading-sm" /> : <ChevronRight size={18} />}
              Trimite incidentul
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
