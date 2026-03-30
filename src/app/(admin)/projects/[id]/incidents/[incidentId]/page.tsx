'use client';

import { getIncidentAuditTrail, getIncidentById, updateIncidentRecord } from '@/app/actions/incidents';
import { getProject, type Project } from '@/app/actions/projects';
import {
  INCIDENT_AFFECTED_CATEGORY_OPTIONS,
  INCIDENT_DATA_TYPE_OPTIONS,
  INCIDENT_RISK_LEVEL_OPTIONS,
  INCIDENT_STATUS_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
} from '@/lib/incident-defaults';
import type { IncidentAuditLog, IncidentRecord } from '@/lib/incident-types';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowLeft,
  Clock3,
  FileText,
  Save,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function formatDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(new Date(value), 'dd MMMM yyyy, HH:mm', { locale: ro });
  } catch {
    return value;
  }
}

function toDateTimeLocal(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const timezoneOffset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - timezoneOffset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getStatusClasses(status?: string) {
  switch (status) {
    case 'new':
      return 'badge-error border-none';
    case 'in_review':
      return 'badge-warning border-none';
    case 'resolved':
      return 'badge-success border-none';
    case 'archived':
      return 'badge-neutral border-none';
    default:
      return 'badge-ghost';
  }
}

function getRiskClasses(risk?: string) {
  switch (risk) {
    case 'high':
      return 'badge-error border-none';
    case 'medium':
      return 'badge-warning border-none';
    case 'low':
      return 'badge-success border-none';
    default:
      return 'badge-ghost';
  }
}

type IncidentFormState = {
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
  status: string;
  riskLevel: string;
  requiresNotification: boolean;
  notificationDeadline: string;
  dpoNotes: string;
  authorityNotifiedAt: string;
  authorityNotificationReference: string;
};

function buildFormState(incident: IncidentRecord): IncidentFormState {
  return {
    discoveredAt: toDateTimeLocal(incident.discoveredAt),
    location: incident.location || '',
    reporterName: incident.reporterName || '',
    reporterRole: incident.reporterRole || '',
    reporterContact: incident.reporterContact || '',
    incidentType: incident.incidentType || INCIDENT_TYPE_OPTIONS[0],
    description: incident.description || '',
    affectedCategories: incident.affectedCategories || [],
    affectedCount: incident.affectedCount ? String(incident.affectedCount) : '',
    dataTypes: incident.dataTypes || [],
    immediateActions: incident.immediateActions || '',
    status: incident.status || 'new',
    riskLevel: incident.riskLevel || '',
    requiresNotification: Boolean(incident.requiresNotification),
    notificationDeadline: toDateTimeLocal(incident.notificationDeadline),
    dpoNotes: incident.dpoNotes || '',
    authorityNotifiedAt: toDateTimeLocal(incident.authorityNotifiedAt),
    authorityNotificationReference: incident.authorityNotificationReference || '',
  };
}

export default function IncidentDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const incidentId = params.incidentId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [auditTrail, setAuditTrail] = useState<IncidentAuditLog[]>([]);
  const [formState, setFormState] = useState<IncidentFormState | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [projectResult, incidentResult, auditResult] = await Promise.all([
          getProject(projectId),
          getIncidentById(incidentId),
          getIncidentAuditTrail(incidentId),
        ]);

        if (!projectResult.success) {
          throw new Error(projectResult.error || 'Proiectul nu a fost găsit.');
        }

        if (!projectResult.data) {
          throw new Error('Proiectul nu a fost găsit.');
        }

        if (!incidentResult.success) {
          throw new Error(incidentResult.error || 'Incidentul nu a fost găsit.');
        }

        if (!incidentResult.data) {
          throw new Error('Incidentul nu a fost găsit.');
        }

        if (cancelled) {
          return;
        }

        setProject(projectResult.data);
        setIncident(incidentResult.data);
        setFormState(buildFormState(incidentResult.data));
        setAuditTrail(auditResult.success && auditResult.data ? auditResult.data : []);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca incidentul.');
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
  }, [incidentId, projectId]);

  const isArchived = incident?.status === 'archived';

  const toggleArrayValue = (
    field: 'affectedCategories' | 'dataTypes',
    value: string,
  ) => {
    if (!formState || isArchived) {
      return;
    }

    setFormState((current) =>
      current
        ? {
            ...current,
            [field]: current[field].includes(value)
              ? current[field].filter((item) => item !== value)
              : [...current[field], value],
          }
        : current,
    );
  };

  const statusTimeline = useMemo(
    () => [
      { key: 'new', label: 'Nou' },
      { key: 'in_review', label: 'În review' },
      { key: 'resolved', label: 'Rezolvat' },
      { key: 'archived', label: 'Arhivat' },
    ],
    [],
  );

  const handleSave = async () => {
    if (!formState || !incident) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const result = await updateIncidentRecord(incidentId, {
        discoveredAt: formState.discoveredAt,
        location: formState.location,
        reporterName: formState.reporterName,
        reporterRole: formState.reporterRole,
        reporterContact: formState.reporterContact,
        incidentType: formState.incidentType,
        description: formState.description,
        affectedCategories: formState.affectedCategories,
        affectedCount: formState.affectedCount ? Number(formState.affectedCount) : 0,
        dataTypes: formState.dataTypes,
        immediateActions: formState.immediateActions,
        status: formState.status as IncidentRecord['status'],
        riskLevel: formState.riskLevel
          ? (formState.riskLevel as IncidentRecord['riskLevel'])
          : undefined,
        requiresNotification: formState.requiresNotification,
        notificationDeadline: formState.notificationDeadline,
        dpoNotes: formState.dpoNotes,
        authorityNotifiedAt: formState.authorityNotifiedAt,
        authorityNotificationReference: formState.authorityNotificationReference,
      });

      if (!result.success) {
        throw new Error(result.error || 'Nu am putut salva modificările.');
      }

      if (!result.data) {
        throw new Error('Nu am primit răspunsul actualizat al incidentului.');
      }

      const auditResult = await getIncidentAuditTrail(incidentId);
      setIncident(result.data);
      setFormState(buildFormState(result.data));
      setAuditTrail(auditResult.success && auditResult.data ? auditResult.data : []);
      setMessage({ type: 'success', text: 'Incidentul a fost actualizat.' });
    } catch (saveError: unknown) {
      setMessage({
        type: 'error',
        text: saveError instanceof Error ? saveError.message : 'Nu am putut salva modificările.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error || !project || !incident || !formState) {
    return (
      <div className="py-16 text-center">
        <div className="mb-4 flex justify-center text-error/40">
          <AlertCircle size={48} />
        </div>
        <h2 className="text-xl font-bold">{error || 'Incidentul nu este disponibil.'}</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm breadcrumbs text-base-content/50">
        <ul>
          <li><Link href="/projects">Proiecte</Link></li>
          <li><Link href={`/projects/${projectId}`}>{project.name}</Link></li>
          <li><Link href={`/projects/${projectId}/incidents`}>Incidente GDPR</Link></li>
          <li className="text-base-content font-medium">{incident.$id}</li>
        </ul>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link href={`/projects/${projectId}/incidents`} className="btn btn-ghost btn-sm gap-2 w-fit">
            <ArrowLeft size={14} /> Înapoi la registru
          </Link>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">Incident #{incident.$id}</h1>
              <span className={`badge ${getStatusClasses(incident.status)}`}>{incident.status}</span>
              <span className={`badge ${getRiskClasses(incident.riskLevel)}`}>{incident.riskLevel || 'risk n/a'}</span>
            </div>
            <p className="text-sm text-base-content/60">{incident.incidentType} • raportat la {formatDateTime(incident.reportedAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/incidents/${incidentId}/report`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm gap-2"
          >
            <FileText size={14} /> Preview PDF
          </a>
          <a
            href={`/api/incidents/${incidentId}/report?download=1`}
            className="btn btn-outline btn-sm gap-2"
          >
            <FileText size={14} /> Download PDF
          </a>
          {incident.archivedPdfFileId && (
            <a
              href={`/api/incident-archives/${incident.archivedPdfFileId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm gap-2"
            >
              <FileText size={14} /> Arhivă PDF
            </a>
          )}
          <button className="btn btn-primary btn-sm gap-2" onClick={handleSave} disabled={saving || isArchived}>
            {saving ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
            Salvează
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} rounded-2xl text-sm`}>
          <AlertCircle size={16} />
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-3xl bg-error/10 text-error">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">Raport inițial</h2>
                <p className="text-sm text-base-content/50">Datele colectate la raportare și contextul incidentului.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Descoperit la</span>
                <input
                  type="datetime-local"
                  className="input input-bordered rounded-2xl"
                  value={formState.discoveredAt}
                  onChange={(event) => setFormState((current) => current ? { ...current, discoveredAt: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>
              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Locație</span>
                <input
                  type="text"
                  className="input input-bordered rounded-2xl"
                  value={formState.location}
                  onChange={(event) => setFormState((current) => current ? { ...current, location: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>
              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Nume raportor</span>
                <input
                  type="text"
                  className="input input-bordered rounded-2xl"
                  value={formState.reporterName}
                  onChange={(event) => setFormState((current) => current ? { ...current, reporterName: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>
              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Rol raportor</span>
                <input
                  type="text"
                  className="input input-bordered rounded-2xl"
                  value={formState.reporterRole}
                  onChange={(event) => setFormState((current) => current ? { ...current, reporterRole: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>
            </div>

            <label className="form-control">
              <span className="label-text pb-2 text-sm font-bold">Contact raportor</span>
              <input
                type="text"
                className="input input-bordered rounded-2xl"
                value={formState.reporterContact}
                onChange={(event) => setFormState((current) => current ? { ...current, reporterContact: event.target.value } : current)}
                disabled={isArchived}
              />
            </label>

            <div className="space-y-3">
              <span className="text-sm font-bold">Tip incident</span>
              <div className="grid gap-3 md:grid-cols-2">
                {INCIDENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => !isArchived && setFormState((current) => current ? { ...current, incidentType: option } : current)}
                    className={`btn h-auto min-h-[68px] justify-start rounded-2xl border-none px-4 py-3 text-left ${
                      formState.incidentType === option
                        ? 'btn-error shadow-lg shadow-error/20'
                        : 'bg-base-200 text-base-content hover:bg-base-300'
                    }`}
                    disabled={isArchived}
                  >
                    <span className="whitespace-normal text-sm font-bold">{option}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="form-control">
              <span className="label-text pb-2 text-sm font-bold">Descriere</span>
              <textarea
                className="textarea textarea-bordered min-h-40 rounded-2xl"
                value={formState.description}
                onChange={(event) => setFormState((current) => current ? { ...current, description: event.target.value } : current)}
                disabled={isArchived}
              />
            </label>

            <div className="grid gap-4 xl:grid-cols-[1fr_0.45fr]">
              <div className="space-y-3 rounded-3xl border border-base-200 bg-base-200/30 p-5">
                <p className="text-sm font-bold">Categorii afectate</p>
                <div className="flex flex-wrap gap-3">
                  {INCIDENT_AFFECTED_CATEGORY_OPTIONS.map((option) => (
                    <label key={option} className="label cursor-pointer gap-3 rounded-2xl border border-base-300 bg-base-100 px-4 py-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={formState.affectedCategories.includes(option)}
                        onChange={() => toggleArrayValue('affectedCategories', option)}
                        disabled={isArchived}
                      />
                      <span className="label-text capitalize">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="form-control rounded-3xl border border-base-200 bg-base-200/30 p-5">
                <span className="label-text pb-2 text-sm font-bold">Persoane afectate</span>
                <input
                  type="number"
                  min="0"
                  className="input input-bordered rounded-2xl"
                  value={formState.affectedCount}
                  onChange={(event) => setFormState((current) => current ? { ...current, affectedCount: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>
            </div>

            <div className="space-y-3 rounded-3xl border border-base-200 bg-base-200/30 p-5">
              <p className="text-sm font-bold">Tipuri de date</p>
              <div className="flex flex-wrap gap-3">
                {INCIDENT_DATA_TYPE_OPTIONS.map((option) => (
                  <label key={option} className="label cursor-pointer gap-3 rounded-2xl border border-base-300 bg-base-100 px-4 py-3">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-secondary"
                      checked={formState.dataTypes.includes(option)}
                      onChange={() => toggleArrayValue('dataTypes', option)}
                      disabled={isArchived}
                    />
                    <span className="label-text capitalize">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="form-control">
              <span className="label-text pb-2 text-sm font-bold">Acțiuni imediate</span>
              <textarea
                className="textarea textarea-bordered min-h-28 rounded-2xl"
                value={formState.immediateActions}
                onChange={(event) => setFormState((current) => current ? { ...current, immediateActions: event.target.value } : current)}
                disabled={isArchived}
              />
            </label>
          </div>

          <div className="rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <Clock3 size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">Evaluare DPO</h2>
                <p className="text-sm text-base-content/50">Decizie, risc, notificare și trasabilitate.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Status</span>
                <select
                  className="select select-bordered rounded-2xl"
                  value={formState.status}
                  onChange={(event) => setFormState((current) => current ? { ...current, status: event.target.value } : current)}
                  disabled={isArchived}
                >
                  {INCIDENT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Nivel risc</span>
                <select
                  className="select select-bordered rounded-2xl"
                  value={formState.riskLevel}
                  onChange={(event) => setFormState((current) => current ? { ...current, riskLevel: event.target.value } : current)}
                  disabled={isArchived}
                >
                  <option value="">Neselectat</option>
                  {INCIDENT_RISK_LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="form-control md:col-span-2 rounded-3xl border border-base-200 bg-base-200/30 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold">Necesită notificare autoritate</p>
                    <p className="text-xs text-base-content/50">Marchează după analiza riscului și a impactului.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={formState.requiresNotification}
                    onChange={(event) => setFormState((current) => current ? { ...current, requiresNotification: event.target.checked } : current)}
                    disabled={isArchived}
                  />
                </div>
              </label>

              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Deadline notificare</span>
                <input
                  type="datetime-local"
                  className="input input-bordered rounded-2xl"
                  value={formState.notificationDeadline}
                  onChange={(event) => setFormState((current) => current ? { ...current, notificationDeadline: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>

              <label className="form-control">
                <span className="label-text pb-2 text-sm font-bold">Notificat autoritatea la</span>
                <input
                  type="datetime-local"
                  className="input input-bordered rounded-2xl"
                  value={formState.authorityNotifiedAt}
                  onChange={(event) => setFormState((current) => current ? { ...current, authorityNotifiedAt: event.target.value } : current)}
                  disabled={isArchived}
                />
              </label>
            </div>

            <label className="form-control">
              <span className="label-text pb-2 text-sm font-bold">Referință notificare autoritate</span>
              <input
                type="text"
                className="input input-bordered rounded-2xl"
                value={formState.authorityNotificationReference}
                onChange={(event) => setFormState((current) => current ? { ...current, authorityNotificationReference: event.target.value } : current)}
                disabled={isArchived}
              />
            </label>

            <label className="form-control">
              <span className="label-text pb-2 text-sm font-bold">Note DPO</span>
              <textarea
                className="textarea textarea-bordered min-h-36 rounded-2xl"
                value={formState.dpoNotes}
                onChange={(event) => setFormState((current) => current ? { ...current, dpoNotes: event.target.value } : current)}
                disabled={isArchived}
              />
            </label>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-black tracking-tight">Status și notificare</h3>

            <div className="flex flex-wrap gap-2">
              <span className={`badge ${getStatusClasses(incident.status)}`}>{incident.status}</span>
              <span className={`badge ${getRiskClasses(incident.riskLevel)}`}>{incident.riskLevel || 'risk n/a'}</span>
              <span className="badge badge-outline">{incident.notificationStatus || 'notification pending'}</span>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[10px] font-black uppercase opacity-40">DPO</p>
                <p className="font-semibold">{incident.dpoNameSnapshot || '-'}</p>
                <p className="text-base-content/60">{incident.dpoEmailSnapshot || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase opacity-40">Notificare DPO</p>
                <p>{formatDateTime(incident.notificationSentAt)}</p>
                {incident.notificationError && <p className="text-error text-xs mt-1">{incident.notificationError}</p>}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase opacity-40">Evaluat la</p>
                <p>{formatDateTime(incident.evaluatedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase opacity-40">Arhivat la</p>
                <p>{formatDateTime(incident.archivedAt)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase opacity-40">Flux recomandat</p>
              <div className="flex flex-wrap gap-2">
                {statusTimeline.map((step) => (
                  <span
                    key={step.key}
                    className={`badge badge-outline px-4 py-3 ${
                      incident.status === step.key ? 'border-primary text-primary' : 'opacity-50'
                    }`}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-black tracking-tight">Audit trail</h3>

            {auditTrail.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base-300 p-5 text-sm text-base-content/50">
                Nu există intrări de audit pentru acest incident.
              </div>
            ) : (
              <div className="space-y-3">
                {auditTrail.map((log) => (
                  <div key={log.$id} className="rounded-2xl border border-base-200 bg-base-200/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{log.action}</p>
                      <span className="text-xs text-base-content/50">{formatDateTime(log.$createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-base-content/60">actor: {log.actorUserId}</p>
                    {log.beforeJson && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-base-content/70">Before</summary>
                        <pre className="mt-2 overflow-x-auto rounded-xl bg-base-100 p-3 text-[11px]">{log.beforeJson}</pre>
                      </details>
                    )}
                    {log.afterJson && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-base-content/70">After</summary>
                        <pre className="mt-2 overflow-x-auto rounded-xl bg-base-100 p-3 text-[11px]">{log.afterJson}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
