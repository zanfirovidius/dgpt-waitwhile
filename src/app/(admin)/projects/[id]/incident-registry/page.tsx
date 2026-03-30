'use client';

import { getIncidentRegistryEntries } from '@/app/actions/incidents';
import { getProject, type Project } from '@/app/actions/projects';
import { normalizeName } from '@/lib/name-utils';
import type { IncidentRegistryEntry } from '@/lib/incident-types';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type SortMode = 'date_desc' | 'date_asc';

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

function getDeadlineTone(entry: IncidentRegistryEntry) {
  if (!entry.requiresNotification || !entry.notificationDeadline) {
    return '';
  }

  const deadline = new Date(entry.notificationDeadline).getTime();
  if (Number.isNaN(deadline)) {
    return 'text-warning';
  }

  if (deadline < Date.now()) {
    return 'text-error';
  }

  return 'text-warning';
}

function sanitizeFileNameSegment(value: string) {
  return normalizeName(value).replace(/\s+/g, '-') || 'registru';
}

function formatDpoValidation(entry: IncidentRegistryEntry) {
  if (!entry.dpoValidatorName && !entry.evaluatedAt) {
    return '-';
  }

  if (!entry.dpoValidatorName) {
    return formatDateTime(entry.evaluatedAt);
  }

  if (!entry.evaluatedAt) {
    return entry.dpoValidatorName;
  }

  return `${entry.dpoValidatorName} · ${formatDateTime(entry.evaluatedAt)}`;
}

function buildRegistryFileName(project: Project, extension: 'xlsx' | 'pdf') {
  const locationLabel =
    [project.city, project.venue].filter(Boolean).join(' ') ||
    project.locationName ||
    project.name;

  return `DGPAT_REG-INC_${sanitizeFileNameSegment(locationLabel)}_${format(new Date(), 'yyyy-MM-dd')}_FINAL.${extension}`;
}

function toExportRows(entries: IncidentRegistryEntry[]) {
  return entries.map((entry, index) => ({
    'Nr. Crt.': index + 1,
    'Data și ora incidentului': formatDateTime(entry.incidentDateTime),
    Descriere: entry.description || '-',
    'Categorii afectate': entry.affectedCategories.length > 0 ? entry.affectedCategories.join(', ') : '-',
    'Măsuri luate': entry.immediateActions || '-',
    'Persoană raportare': entry.reporterName || '-',
    'Semnătura DPO / validare': formatDpoValidation(entry),
    Risc: entry.riskLevel || '-',
    Status: entry.status,
    'Necesită notificare': entry.requiresNotification ? 'DA' : 'NU',
  }));
}

export default function IncidentRegistryPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [entries, setEntries] = useState<IncidentRegistryEntry[]>([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [projectResult, registryResult] = await Promise.all([
          getProject(projectId),
          getIncidentRegistryEntries(projectId),
        ]);

        if (!projectResult.success) {
          throw new Error(projectResult.error || 'Proiectul nu a fost găsit.');
        }

        if (!projectResult.data) {
          throw new Error('Proiectul nu a fost găsit.');
        }

        if (!registryResult.success) {
          throw new Error(registryResult.error || 'Nu am putut încărca registrul oficial.');
        }

        if (cancelled) {
          return;
        }

        setProject(projectResult.data);
        setEntries(registryResult.data || []);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca registrul oficial.');
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

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, deferredSearchQuery, pageSize, riskFilter, sortMode, statusFilter]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    const nextEntries = entries.filter((entry) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          entry.incidentId,
          entry.description,
          entry.reporterName,
          entry.dpoValidatorName,
          entry.location,
          ...entry.affectedCategories,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      const matchesRisk = riskFilter === 'all' || entry.riskLevel === riskFilter;

      const incidentDate = new Date(entry.incidentDateTime);
      const incidentTime = incidentDate.getTime();
      const inDateFrom =
        !dateFrom ||
        (!Number.isNaN(incidentTime) && incidentDate >= new Date(`${dateFrom}T00:00:00`));
      const inDateTo =
        !dateTo ||
        (!Number.isNaN(incidentTime) && incidentDate <= new Date(`${dateTo}T23:59:59`));

      return matchesSearch && matchesStatus && matchesRisk && inDateFrom && inDateTo;
    });

    nextEntries.sort((left, right) => {
      const leftTime = new Date(left.incidentDateTime || 0).getTime();
      const rightTime = new Date(right.incidentDateTime || 0).getTime();
      return sortMode === 'date_desc' ? rightTime - leftTime : leftTime - rightTime;
    });

    return nextEntries;
  }, [dateFrom, dateTo, deferredSearchQuery, entries, riskFilter, sortMode, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEntries = filteredEntries.slice(pageStart, pageStart + pageSize);

  const highRiskCount = entries.filter((entry) => entry.riskLevel === 'high').length;
  const notificationCount = entries.filter((entry) => entry.requiresNotification).length;
  const archivedCount = entries.filter((entry) => entry.status === 'archived').length;

  const exportExcel = () => {
    if (!project || filteredEntries.length === 0) {
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(toExportRows(filteredEntries));
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 22 },
      { wch: 48 },
      { wch: 24 },
      { wch: 32 },
      { wch: 22 },
      { wch: 28 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registru Incidente');
    XLSX.writeFile(workbook, buildRegistryFileName(project, 'xlsx'));
  };

  const exportPdf = () => {
    if (!project || filteredEntries.length === 0) {
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Registru Incidente GDPR / Securitate', 14, 16);
    doc.setFontSize(10);
    doc.text(project.name, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [[
        'Nr. Crt.',
        'Data și ora incidentului',
        'Descriere',
        'Categorii afectate',
        'Măsuri luate',
        'Persoană raportare',
        'Semnătura DPO / validare',
        'Risc',
        'Status',
      ]],
      body: filteredEntries.map((entry, index) => ([
        index + 1,
        formatDateTime(entry.incidentDateTime),
        entry.description || '-',
        entry.affectedCategories.length > 0 ? entry.affectedCategories.join(', ') : '-',
        entry.immediateActions || '-',
        entry.reporterName || '-',
        formatDpoValidation(entry),
        entry.riskLevel || '-',
        entry.status,
      ])),
      styles: {
        fontSize: 8,
        cellPadding: 2,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [30, 41, 59],
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 28 },
        2: { cellWidth: 58 },
        3: { cellWidth: 30 },
        4: { cellWidth: 42 },
        5: { cellWidth: 28 },
        6: { cellWidth: 38 },
        7: { cellWidth: 16 },
        8: { cellWidth: 18 },
      },
    });

    doc.save(buildRegistryFileName(project, 'pdf'));
  };

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
        <h2 className="text-xl font-bold">{error || 'Registrul oficial nu este disponibil.'}</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm breadcrumbs text-base-content/50">
        <ul>
          <li><Link href="/projects">Proiecte</Link></li>
          <li><Link href={`/projects/${projectId}`}>{project.name}</Link></li>
          <li className="text-base-content font-medium">Registru incidente</li>
        </ul>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <Link href={`/projects/${projectId}/incidents`} className="btn btn-ghost btn-sm w-fit gap-2">
            <ArrowLeft size={14} /> Înapoi la management incidente
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-error/10 text-error">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Security Incident Registry</h1>
              <p className="text-sm text-base-content/60">
                View derivat automat din incidente și evaluările DPO. Fără editare manuală.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${projectId}/incidents`} className="btn btn-outline btn-sm gap-2">
            <Eye size={14} /> Workflow Incidente
          </Link>
          <button className="btn btn-outline btn-sm gap-2" onClick={exportPdf} disabled={filteredEntries.length === 0}>
            <FileText size={14} /> PDF
          </button>
          <button className="btn btn-primary btn-sm gap-2" onClick={exportExcel} disabled={filteredEntries.length === 0}>
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="alert rounded-3xl border border-base-300 bg-base-100 text-sm">
        <ShieldAlert size={18} />
        <span>
          Registrul este read-only prin design. Fiecare rând este derivat direct din incidentul sursă și din evaluarea DPO.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="stats rounded-3xl border border-base-200 bg-base-100 shadow-sm">
          <div className="stat">
            <div className="stat-title">Total incidente</div>
            <div className="stat-value text-primary">{entries.length}</div>
            <div className="stat-desc">Toate incidentele, indiferent de status</div>
          </div>
        </div>
        <div className="stats rounded-3xl border border-base-200 bg-base-100 shadow-sm">
          <div className="stat">
            <div className="stat-title">Risc ridicat</div>
            <div className="stat-value text-error">{highRiskCount}</div>
            <div className="stat-desc">Necesită atenție prioritară</div>
          </div>
        </div>
        <div className="stats rounded-3xl border border-base-200 bg-base-100 shadow-sm">
          <div className="stat">
            <div className="stat-title">Cu notificare</div>
            <div className="stat-value text-warning">{notificationCount}</div>
            <div className="stat-desc">Flag GDPR 72h</div>
          </div>
        </div>
        <div className="stats rounded-3xl border border-base-200 bg-base-100 shadow-sm">
          <div className="stat">
            <div className="stat-title">Arhivate</div>
            <div className="stat-value text-success">{archivedCount}</div>
            <div className="stat-desc">Imutabile în registru</div>
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-3xl border border-base-200 bg-base-100 p-5 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr_0.7fr_0.8fr_0.8fr_0.6fr]">
          <label className="input input-bordered flex items-center gap-2 rounded-2xl">
            <Search size={16} className="opacity-50" />
            <input
              type="text"
              className="grow"
              placeholder="Caută după descriere, raportor, DPO, locație..."
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

          <label className="input input-bordered flex items-center gap-2 rounded-2xl">
            <CalendarRange size={16} className="opacity-50" />
            <input type="date" className="grow" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>

          <label className="input input-bordered flex items-center gap-2 rounded-2xl">
            <CalendarRange size={16} className="opacity-50" />
            <input type="date" className="grow" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>

          <select className="select select-bordered rounded-2xl" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="date_desc">Data: nou → vechi</option>
            <option value="date_asc">Data: vechi → nou</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-base-content/60">
          <p>
            {filteredEntries.length} rezultate filtrate din {entries.length} incidente.
          </p>
          <label className="flex items-center gap-2">
            <span>Pe pagină</span>
            <select className="select select-bordered select-sm" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-lg">
            <thead>
              <tr className="bg-base-200/70">
                <th>Nr. Crt.</th>
                <th>Data și ora incidentului</th>
                <th>Descriere</th>
                <th>Categorii afectate</th>
                <th>Măsuri luate</th>
                <th>Persoană raportare</th>
                <th>Validare DPO</th>
                <th>Risc</th>
                <th>Status</th>
                <th className="text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center opacity-50">
                    Nu există incidente care să corespundă filtrelor curente.
                  </td>
                </tr>
              ) : (
                pageEntries.map((entry, index) => (
                  <tr key={entry.incidentId} className={entry.riskLevel === 'high' ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-base-200/40'}>
                    <td className="font-semibold">{pageStart + index + 1}</td>
                    <td className="text-sm whitespace-nowrap">{formatDateTime(entry.incidentDateTime)}</td>
                    <td>
                      <div className="max-w-sm space-y-1">
                        <p className="line-clamp-3 font-medium">{entry.description || '-'}</p>
                        {entry.location && (
                          <p className="text-xs text-base-content/50">Locație: {entry.location}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      {entry.affectedCategories.length === 0 ? (
                        <span className="text-sm text-base-content/40">-</span>
                      ) : (
                        <div className="flex max-w-48 flex-wrap gap-1">
                          {entry.affectedCategories.map((category) => (
                            <span key={category} className="badge badge-ghost badge-sm">{category}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="max-w-xs text-sm text-base-content/70">
                        {entry.immediateActions || '-'}
                      </div>
                    </td>
                    <td className="text-sm">{entry.reporterName || '-'}</td>
                    <td>
                      <div className="max-w-56 text-sm">
                        <p className="font-semibold">{entry.dpoValidatorName || '-'}</p>
                        <p className="text-xs text-base-content/50">
                          {entry.evaluatedAt ? formatDateTime(entry.evaluatedAt) : 'Neevaluat încă'}
                        </p>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <span className={`badge ${getRiskClasses(entry.riskLevel)}`}>
                          {entry.riskLevel || 'N/A'}
                        </span>
                        {entry.requiresNotification && (
                          <p className={`text-xs font-semibold ${getDeadlineTone(entry)}`}>
                            72h: {formatDateTime(entry.notificationDeadline)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusClasses(entry.status)}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link href={`/projects/${projectId}/incidents/${entry.incidentId}`} className="btn btn-sm btn-primary rounded-xl">
                        Vezi incident
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-base-200 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base-content/60">
            Afișare {filteredEntries.length === 0 ? 0 : pageStart + 1} - {Math.min(pageStart + pageEntries.length, filteredEntries.length)} din {filteredEntries.length}
          </p>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm btn-outline gap-2" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1}>
              <ChevronLeft size={14} /> Anterior
            </button>
            <span className="min-w-24 text-center font-medium">
              Pagina {currentPage} / {totalPages}
            </span>
            <button className="btn btn-sm btn-outline gap-2" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={currentPage >= totalPages}>
              Următor <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
