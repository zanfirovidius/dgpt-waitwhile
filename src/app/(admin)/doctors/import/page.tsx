'use client';

import Link from 'next/link';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { commitDoctorImport, previewDoctorImport } from '@/app/actions/doctors';
import type { DoctorImportPreviewRow, DoctorImportSummary } from '@/lib/doctor-types';

export default function DoctorsImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<DoctorImportPreviewRow[]>([]);
  const [summary, setSummary] = useState<DoctorImportSummary | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  const handlePreview = async () => {
    if (!file) {
      setError('Selectează un fișier pentru import.');
      return;
    }

    setIsPreviewing(true);
    setError('');
    setSummary(null);

    const formData = new FormData();
    formData.set('file', file);

    const result = await previewDoctorImport(formData);
    if (!result.success) {
      setError(result.error || 'Nu am putut analiza fișierul.');
      setIsPreviewing(false);
      return;
    }

    setPreviewRows(result.data.rows);
    setIsPreviewing(false);
  };

  const handleCommit = async () => {
    setIsImporting(true);
    setError('');

    const result = await commitDoctorImport(previewRows);
    if (!result.success) {
      setError(result.error || 'Importul a eșuat.');
      setIsImporting(false);
      return;
    }

    setSummary(result.data);
    setIsImporting(false);
  };

  const updateRowAction = (rowNumber: number, action: DoctorImportPreviewRow['selectedAction']) => {
    setPreviewRows((current) =>
      current.map((row) =>
        row.rowNumber === rowNumber
          ? {
              ...row,
              selectedAction: action,
              selectedMatchDoctorId:
                action === 'update_existing' || action === 'overwrite_existing'
                  ? row.selectedMatchDoctorId || row.matches[0]?.doctorId
                  : undefined,
            }
          : row,
      ),
    );
  };

  const updateRowTarget = (rowNumber: number, doctorId: string) => {
    setPreviewRows((current) =>
      current.map((row) =>
        row.rowNumber === rowNumber ? { ...row, selectedMatchDoctorId: doctorId } : row,
      ),
    );
  };

  const downloadResultReport = () => {
    if (!summary) {
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(
      summary.results.map((row) => ({
        'Nr. rând': row.rowNumber,
        Acțiune: row.action,
        Rezultat: row.outcome,
        Medic: row.doctorName,
        Mesaj: row.message,
        'Doctor ID': row.doctorId || '',
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rezultat import');
    XLSX.writeFile(workbook, `doctor-import-result_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/doctors" className="btn btn-ghost btn-sm gap-2">
            <ArrowLeft size={14} /> Înapoi la registru
          </Link>
          <h1 className="mt-3 text-3xl font-black text-base-content">Import doctors</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Parsezi fișierul pe server, revizuiești duplicatele și confirmi acțiunea per rând.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/doctors/template" className="btn btn-outline btn-sm gap-2">
            <Download size={14} /> Download import template
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error rounded-2xl text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[2fr,auto] lg:items-end">
          <label className="form-control">
            <span className="label"><span className="label-text font-semibold">Fișier import</span></span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="file-input file-input-bordered w-full rounded-xl"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <span className="label-text-alt mt-2 text-xs text-base-content/50">
              Coloane așteptate: Nume, Grad profesional/universitar, Telefon, Email, CUIM, Specialitate, Observații.
            </span>
          </label>
          <button type="button" className="btn btn-primary gap-2" onClick={handlePreview} disabled={isPreviewing || !file}>
            {isPreviewing ? <span className="loading loading-spinner loading-xs" /> : <Upload size={16} />}
            Analizează fișierul
          </button>
        </div>
      </div>

      {previewRows.length > 0 && (
        <div className="space-y-4 rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-base-content">Preview import</h2>
              <p className="text-sm text-base-content/60">
                {previewRows.length} rânduri analizate. Ajustează acțiunea pentru rândurile cu match.
              </p>
            </div>
            <button type="button" className="btn btn-accent gap-2" onClick={handleCommit} disabled={isImporting}>
              {isImporting ? <span className="loading loading-spinner loading-xs" /> : <FileSpreadsheet size={16} />}
              Confirm import
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300">
            <table className="table">
              <thead>
                <tr>
                  <th>Rând</th>
                  <th>Date importate</th>
                  <th>Erori / avertizări</th>
                  <th>Conflict</th>
                  <th>Acțiune</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="font-bold">{row.rowNumber}</td>
                    <td>
                      <div className="space-y-1 text-sm">
                        <div className="font-bold">{row.data.fullName || '-'}</div>
                        <div>{row.data.professionalGrade || '-'}</div>
                        <div className="text-xs text-base-content/60">
                          {row.data.phone || '-'} • {row.data.email || '-'} • {row.data.cuim || '-'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        {row.errors.map((item) => (
                          <div key={item} className="badge badge-error badge-outline">{item}</div>
                        ))}
                        {row.warnings.map((item) => (
                          <div key={item} className="badge badge-warning badge-outline">{item}</div>
                        ))}
                        {row.errors.length === 0 && row.warnings.length === 0 && <span className="text-xs text-base-content/50">Fără probleme</span>}
                      </div>
                    </td>
                    <td>
                      {row.matches.length > 0 ? (
                        <div className="space-y-3">
                          {row.matches.map((match) => (
                            <div key={match.doctorId} className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
                              <div className="font-bold">{match.fullName}</div>
                              <div>{match.professionalGrade}</div>
                              <div className="text-base-content/60">
                                {match.email || '-'} • {match.phone || '-'} • {match.cuim || '-'}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {match.matchReasons.map((reason) => (
                                  <span key={reason} className="badge badge-warning badge-outline">match {reason}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                          {(row.selectedAction === 'update_existing' || row.selectedAction === 'overwrite_existing' || (!row.selectedAction && row.recommendedAction !== 'create_anyway')) && (
                            <select
                              className="select select-bordered select-sm w-full"
                              value={row.selectedMatchDoctorId || row.matches[0]?.doctorId || ''}
                              onChange={(event) => updateRowTarget(row.rowNumber, event.target.value)}
                            >
                              {row.matches.map((match) => (
                                <option key={match.doctorId} value={match.doctorId}>
                                  {match.fullName} • {match.professionalGrade}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-base-content/50">Niciun conflict găsit</div>
                      )}
                    </td>
                    <td>
                      <div className="space-y-2">
                        <select
                          className="select select-bordered select-sm w-full"
                          value={row.selectedAction || row.recommendedAction}
                          onChange={(event) => updateRowAction(row.rowNumber, event.target.value as DoctorImportPreviewRow['selectedAction'])}
                        >
                          <option value="skip">Skip</option>
                          <option value="update_existing">Update existing</option>
                          <option value="overwrite_existing">Overwrite existing</option>
                          <option value="create_anyway">Create new anyway</option>
                        </select>
                        <div className="flex items-start gap-2 rounded-xl bg-base-200/70 p-3 text-xs text-base-content/70">
                          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                          <span>Recomandat: {row.recommendedAction}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-4 rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Rezultat import</h2>
              <p className="text-sm text-base-content/60">Rezumatul final al importului și acțiunilor executate.</p>
            </div>
            <button type="button" className="btn btn-outline gap-2" onClick={downloadResultReport}>
              <Download size={14} /> Descarcă raport rezultat
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl bg-base-200 p-4"><div className="text-xs text-base-content/60">Total</div><div className="text-2xl font-black">{summary.totalRows}</div></div>
            <div className="rounded-2xl bg-success/10 p-4"><div className="text-xs text-base-content/60">Importate</div><div className="text-2xl font-black">{summary.imported}</div></div>
            <div className="rounded-2xl bg-info/10 p-4"><div className="text-xs text-base-content/60">Updated</div><div className="text-2xl font-black">{summary.updated}</div></div>
            <div className="rounded-2xl bg-warning/10 p-4"><div className="text-xs text-base-content/60">Overwritten</div><div className="text-2xl font-black">{summary.overwritten}</div></div>
            <div className="rounded-2xl bg-base-200 p-4"><div className="text-xs text-base-content/60">Skipped</div><div className="text-2xl font-black">{summary.skipped}</div></div>
            <div className="rounded-2xl bg-error/10 p-4"><div className="text-xs text-base-content/60">Failed</div><div className="text-2xl font-black">{summary.failed}</div></div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300">
            <table className="table">
              <thead>
                <tr>
                  <th>Rând</th>
                  <th>Acțiune</th>
                  <th>Rezultat</th>
                  <th>Medic</th>
                  <th>Mesaj</th>
                </tr>
              </thead>
              <tbody>
                {summary.results.map((row) => (
                  <tr key={`${row.rowNumber}-${row.outcome}-${row.message}`}>
                    <td>{row.rowNumber}</td>
                    <td>{row.action}</td>
                    <td>{row.outcome}</td>
                    <td>{row.doctorId ? <Link href={`/doctors/${row.doctorId}`} className="link link-primary">{row.doctorName}</Link> : row.doctorName}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
