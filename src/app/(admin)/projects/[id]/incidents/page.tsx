'use client';

import { getProject, type Project } from '@/app/actions/projects';
import { getProjectIncidents } from '@/app/actions/incidents';
import type { IncidentRecord } from '@/lib/incident-types';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Search,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type SortMode = 'reported_desc' | 'reported_asc' | 'discovered_desc' | 'discovered_asc';

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

export default function ProjectIncidentsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('reported_desc');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [projectResult, incidentsResult] = await Promise.all([
          getProject(projectId),
          getProjectIncidents(projectId),
        ]);

        if (!projectResult.success) {
          throw new Error(projectResult.error || 'Proiectul nu a fost găsit.');
        }

        if (!projectResult.data) {
          throw new Error('Proiectul nu a fost găsit.');
        }

        if (!incidentsResult.success) {
          throw new Error(incidentsResult.error || 'Nu am putut încărca incidentele.');
        }

        if (cancelled) {
          return;
        }

        setProject(projectResult.data);
        setIncidents(incidentsResult.data || []);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca registrul de incidente.');
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
  }, [projectId]);

  const filteredIncidents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = incidents.filter((incident) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          incident.$id,
          incident.incidentType,
          incident.description,
          incident.reporterName,
          incident.reporterRole,
          incident.location,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      const matchesStatus = statusFilter === 'all' || incident.status === statusFilter;
      const matchesRisk = riskFilter === 'all' || incident.riskLevel === riskFilter;

      return matchesSearch && matchesStatus && matchesRisk;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      const leftValue =
        sortMode.startsWith('reported')
          ? new Date(left.reportedAt || 0).getTime()
          : new Date(left.discoveredAt || 0).getTime();
      const rightValue =
        sortMode.startsWith('reported')
          ? new Date(right.reportedAt || 0).getTime()
          : new Date(right.discoveredAt || 0).getTime();

      return sortMode.endsWith('desc') ? rightValue - leftValue : leftValue - rightValue;
    });

    return sorted;
  }, [incidents, riskFilter, searchQuery, sortMode, statusFilter]);

  const exportRegistry = (type: 'csv' | 'xlsx') => {
    if (filteredIncidents.length === 0 || !project) {
      return;
    }

    const rows = filteredIncidents.map((incident) => ({
      'Incident ID': incident.$id || '-',
      Proiect: project.name,
      Eveniment: incident.eventName,
      Locație: incident.location,
      'Raportat la': incident.reportedAt,
      'Descoperit la': incident.discoveredAt,
      'Tip incident': incident.incidentType,
      'Nivel risc': incident.riskLevel || '-',
      Status: incident.status,
      'Necesită notificare': incident.requiresNotification ? 'DA' : 'NU',
      'Deadline notificare': incident.notificationDeadline || '-',
      'Raportor': incident.reporterName || '-',
      'Contact raportor': incident.reporterContact || '-',
      'Status notificare DPO': incident.notificationStatus || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Incidente');
    const fileName = `incident-registry_${(project.projectSlug || projectId).toLowerCase()}_${format(new Date(), 'yyyy-MM-dd')}`;
    XLSX.writeFile(workbook, `${fileName}.${type === 'csv' ? 'csv' : 'xlsx'}`);
  };

  const publicIncidentUrl = project?.projectSlug ? `/i/${project.projectSlug}/incident` : '';

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="py-16 text-center">
        <div className="mb-4 flex justify-center text-error/40">
          <AlertCircle size={48} />
        </div>
        <h2 className="text-xl font-bold">{error || 'Registrul de incidente nu este disponibil.'}</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm breadcrumbs text-base-content/50">
        <ul>
          <li><Link href="/projects">Proiecte</Link></li>
          <li><Link href={`/projects/${projectId}`}>{project.name}</Link></li>
          <li className="text-base-content font-medium">Incidente GDPR</li>
        </ul>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-error/10 text-error">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Management Incidente GDPR</h1>
              <p className="text-sm text-base-content/60">Raportare, triere, evaluare DPO și arhivare pentru {project.name}</p>
            </div>
          </div>
          {publicIncidentUrl && (
            <a
              href={publicIncidentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              Formular public incident <ExternalLink size={14} />
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${projectId}/incident-registry`} className="btn btn-outline btn-sm gap-2">
            <FileSpreadsheet size={14} /> Registru Oficial
          </Link>
          <button className="btn btn-outline btn-sm gap-2" onClick={() => exportRegistry('csv')} disabled={filteredIncidents.length === 0}>
            <Download size={14} /> CSV
          </button>
          <button className="btn btn-primary btn-sm gap-2" onClick={() => exportRegistry('xlsx')} disabled={filteredIncidents.length === 0}>
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="stats border border-base-200 bg-base-100 shadow-sm rounded-3xl">
          <div className="stat">
            <div className="stat-title">Total</div>
            <div className="stat-value text-primary">{incidents.length}</div>
            <div className="stat-desc">Înregistrate în proiect</div>
          </div>
        </div>
        <div className="stats border border-base-200 bg-base-100 shadow-sm rounded-3xl">
          <div className="stat">
            <div className="stat-title">Noi</div>
            <div className="stat-value text-error">{incidents.filter((item) => item.status === 'new').length}</div>
            <div className="stat-desc">Necesită triere</div>
          </div>
        </div>
        <div className="stats border border-base-200 bg-base-100 shadow-sm rounded-3xl">
          <div className="stat">
            <div className="stat-title">În review</div>
            <div className="stat-value text-warning">{incidents.filter((item) => item.status === 'in_review').length}</div>
            <div className="stat-desc">Evaluare DPO în curs</div>
          </div>
        </div>
        <div className="stats border border-base-200 bg-base-100 shadow-sm rounded-3xl">
          <div className="stat">
            <div className="stat-title">Risc ridicat</div>
            <div className="stat-value text-error">{incidents.filter((item) => item.riskLevel === 'high').length}</div>
            <div className="stat-desc">Prioritate imediată</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-base-200 bg-base-100 p-5 shadow-sm space-y-5">
        <div className="grid gap-3 xl:grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr]">
          <label className="input input-bordered flex items-center gap-2 rounded-2xl">
            <Search size={16} className="opacity-50" />
            <input
              type="text"
              className="grow"
              placeholder="Caută după ID, tip, descriere, raportor..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <label className="select select-bordered rounded-2xl flex items-center gap-2 px-3">
            <Filter size={16} className="opacity-50 shrink-0" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Toate statusurile</option>
              <option value="new">Noi</option>
              <option value="in_review">În review</option>
              <option value="resolved">Rezolvate</option>
              <option value="archived">Arhivate</option>
            </select>
          </label>

          <label className="select select-bordered rounded-2xl flex items-center gap-2 px-3">
            <ShieldAlert size={16} className="opacity-50 shrink-0" />
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="all">Toate riscurile</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <select
            className="select select-bordered rounded-2xl"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
          >
            <option value="reported_desc">Raportat: nou → vechi</option>
            <option value="reported_asc">Raportat: vechi → nou</option>
            <option value="discovered_desc">Descoperit: nou → vechi</option>
            <option value="discovered_asc">Descoperit: vechi → nou</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-lg">
            <thead>
              <tr className="bg-base-200/70">
                <th>ID</th>
                <th>Tip</th>
                <th>Raportat</th>
                <th>Descoperit</th>
                <th>Risc</th>
                <th>Status</th>
                <th>DPO</th>
                <th className="text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center opacity-50">
                    Nu există incidente care să corespundă filtrelor curente.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr key={incident.$id} className="hover:bg-base-200/40">
                    <td className="font-mono text-xs">{incident.$id}</td>
                    <td>
                      <div className="max-w-xs space-y-1">
                        <p className="font-bold">{incident.incidentType}</p>
                        <p className="line-clamp-2 text-xs text-base-content/60">{incident.description}</p>
                      </div>
                    </td>
                    <td className="text-sm">{formatDateTime(incident.reportedAt)}</td>
                    <td className="text-sm">{formatDateTime(incident.discoveredAt)}</td>
                    <td>
                      <span className={`badge ${getRiskClasses(incident.riskLevel)}`}>
                        {incident.riskLevel || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusClasses(incident.status)}`}>
                        {incident.status}
                      </span>
                    </td>
                    <td>
                      <div className="text-sm">
                        <p className="font-semibold">{incident.dpoNameSnapshot || '-'}</p>
                        <p className="text-xs text-base-content/50">{incident.notificationStatus || 'pending'}</p>
                      </div>
                    </td>
                    <td className="text-right">
                      <Link href={`/projects/${projectId}/incidents/${incident.$id}`} className="btn btn-sm btn-primary rounded-xl">
                        Deschide
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
