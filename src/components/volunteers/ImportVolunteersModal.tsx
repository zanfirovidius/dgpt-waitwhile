'use client';

import { useState } from 'react';
import { createVolunteer } from '@/app/actions/volunteers';
import * as XLSX from 'xlsx';
import { X, Upload, Check, AlertCircle, Trash2, Download, FileSpreadsheet } from 'lucide-react';

interface ImportVolunteersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  categories: string[];
}

interface ImportRow {
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  activityCategory: string;
  isValid: boolean;
  errors: string[];
}

const IMPORT_HEADERS = ['Nume', 'Prenume', 'Telefon', 'Email', 'Categorie'] as const;

function isHeaderRow(parts: string[]) {
  const normalized = parts.slice(0, IMPORT_HEADERS.length).map((part) => part.trim().toLowerCase());

  return (
    normalized.length === IMPORT_HEADERS.length &&
    normalized[0] === 'nume' &&
    normalized[1] === 'prenume' &&
    normalized[2].startsWith('telefon') &&
    normalized[3].includes('mail') &&
    normalized[4].startsWith('categorie')
  );
}

export function ImportVolunteersModal({ isOpen, onClose, onSuccess, projectId, categories }: ImportVolunteersModalProps) {
  const [pasteContent, setPasteContent] = useState('');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [parseError, setParseError] = useState('');

  const handleDownloadTemplate = () => {
    const availableCategories = categories.length > 0 ? categories : ['VOLUNTAR'];
    const sampleRows = [
      IMPORT_HEADERS,
      ['Popescu', 'Maria', '0722123456', 'maria.popescu@example.com', availableCategories[0]],
      ['Ionescu', 'Andrei', '0733123456', 'andrei.ionescu@example.com', availableCategories[1] || availableCategories[0]],
      ['', '', '', '', ''],
    ];

    const workbook = XLSX.utils.book_new();
    const volunteersSheet = XLSX.utils.aoa_to_sheet(sampleRows);
    volunteersSheet['!cols'] = [
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 32 },
      { wch: 22 },
    ];

    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ['Template import voluntari'],
      ['1. Completați sau înlocuiți rândurile din foaia "Voluntari".'],
      ['2. Păstrați ordinea coloanelor: Nume, Prenume, Telefon, Email, Categorie.'],
      ['3. Copiați rândurile completate din Excel și lipiți-le în fereastra de import.'],
      ['4. Categoriile acceptate sunt listate mai jos.'],
      [''],
      ['Categorii acceptate'],
      ...availableCategories.map((category) => [category]),
    ]);
    instructionsSheet['!cols'] = [{ wch: 72 }];

    XLSX.utils.book_append_sheet(workbook, volunteersSheet, 'Voluntari');
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructiuni');
    XLSX.writeFile(workbook, 'exemplu-import-voluntari.xlsx');
  };

  const handleParse = () => {
    setIsProcessing(true);
    setParseError('');

    try {
      const lines = pasteContent
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

      const dataLines =
        lines.length > 0 && isHeaderRow(lines[0].split('\t')) ? lines.slice(1) : lines;

      if (dataLines.length === 0) {
        throw new Error('Nu am găsit rânduri de import. Completați template-ul și copiați doar rândurile cu voluntari.');
      }

      const categoryLookup = new Map(
        categories.map((category) => [category.trim().toUpperCase(), category]),
      );

      const parsed: ImportRow[] = dataLines.map((line) => {
        const parts = line.split('\t');
        const activityCategoryRaw = parts[4]?.trim() || '';
        const normalizedCategory = activityCategoryRaw.toUpperCase();
        const row: ImportRow = {
          lastName: parts[0]?.trim() || '',
          firstName: parts[1]?.trim() || '',
          phone: parts[2]?.trim() || '',
          email: parts[3]?.trim() || '',
          activityCategory: categoryLookup.get(normalizedCategory) || normalizedCategory,
          isValid: true,
          errors: [],
        };

        if (!row.firstName) row.errors.push('Prenume lipsă');
        if (!row.lastName) row.errors.push('Nume lipsă');
        if (!row.activityCategory) {
          row.errors.push('Categorie lipsă');
        } else if (!categoryLookup.has(normalizedCategory)) {
          row.errors.push(`Categorie invalidă: ${row.activityCategory}`);
        }

        row.isValid = row.errors.length === 0;
        return row;
      });

      setImportRows(parsed);
      setShowPreview(true);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Datele nu au putut fi procesate.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    const validRows = importRows.filter(r => r.isValid);
    
    let successCount = 0;
    for (const row of validRows) {
        const res = await createVolunteer({
            projectId,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            email: row.email,
            activityCategory: row.activityCategory,
            status: 'active'
        });
        if (res.success) successCount++;
    }

    if (successCount > 0) {
        onSuccess();
        if (successCount === validRows.length) {
            onClose();
        } else {
            alert(`Importat cu succes ${successCount} din ${validRows.length} voluntari.`);
        }
    } else {
        alert('Nu s-a putut importa niciun voluntar.');
    }
    setIsImporting(false);
  };

  const removeRow = (index: number) => {
    setImportRows(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-4xl p-0 overflow-hidden bg-base-100 rounded-3xl border border-base-200 shadow-2xl">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-base-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                    <Upload size={20} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-base-content">Importă Voluntari</h3>
                    <p className="text-xs text-base-content/50">Lipiți date din Excel (Nume, Prenume, Telefon, Email, Categorie)</p>
                </div>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-8">
          {!showPreview ? (
            <div className="space-y-4">
                <div className="bg-base-200/50 rounded-2xl p-4 border border-dashed border-base-300">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-medium text-base-content/60 mb-3 uppercase tracking-wider">Format Așteptat (Coloane separate prin TAB):</p>
                      <code className="text-[10px] bg-base-300 p-2 rounded-lg block">Nume [TAB] Prenume [TAB] Telefon [TAB] Email [TAB] Categorie</code>
                      <p className="text-[10px] text-base-content/40 mt-2">Exemplu: Popescu [TAB] Maria [TAB] 0722123456 [TAB] maria@dgpt.ro [TAB] VOLUNTAR</p>
                    </div>
                    <button
                      onClick={handleDownloadTemplate}
                      className="btn btn-outline btn-sm gap-2 rounded-xl self-start"
                      type="button"
                    >
                      <FileSpreadsheet size={14} />
                      <Download size={14} />
                      Descarcă exemplu Excel
                    </button>
                  </div>
                  <p className="text-[10px] text-base-content/50 mt-3">Modelul `.xlsx` poate fi completat, apoi rândurile pot fi copiate direct din Excel în acest câmp.</p>
              </div>

              <textarea 
                className="textarea textarea-bordered w-full h-64 font-mono text-xs rounded-2xl bg-base-200/30 focus:bg-base-100 transition-all border-base-300" 
                placeholder="Lipiți aici rândurile copiate din Excel..."
                value={pasteContent}
                onChange={(e) => {
                  setPasteContent(e.target.value);
                  if (parseError) setParseError('');
                }}
              />

              {parseError && (
                <div className="alert alert-error rounded-2xl text-sm">
                  <AlertCircle size={16} />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="btn btn-ghost px-8 rounded-xl font-bold">Anulează</button>
                <button 
                    onClick={handleParse} 
                    className="btn btn-primary px-10 rounded-xl font-bold shadow-lg shadow-primary/20"
                    disabled={!pasteContent.trim() || isProcessing}
                >
                  {isProcessing ? <span className="loading loading-spinner loading-sm"></span> : 'Procesează Datele'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      <div className="stats bg-base-200/50 border border-base-300 rounded-2xl overflow-hidden scale-90 origin-left">
                          <div className="stat py-2 px-4">
                              <div className="stat-title text-[10px] uppercase font-bold">Total</div>
                              <div className="stat-value text-lg">{importRows.length}</div>
                          </div>
                          <div className="stat py-2 px-4">
                              <div className="stat-title text-[10px] uppercase font-bold text-success">Valide</div>
                              <div className="stat-value text-lg text-success">{importRows.filter(r => r.isValid).length}</div>
                          </div>
                          <div className="stat py-2 px-4">
                              <div className="stat-title text-[10px] uppercase font-bold text-error">Erori</div>
                              <div className="stat-value text-lg text-error">{importRows.filter(r => !r.isValid).length}</div>
                          </div>
                      </div>
                  </div>
                  <button onClick={() => setShowPreview(false)} className="btn btn-ghost btn-sm gap-2 rounded-xl">
                      <Trash2 size={14} /> Reîncepe
                  </button>
              </div>

              <div className="border border-base-200 rounded-2xl overflow-hidden shadow-sm max-h-96 overflow-y-auto">
                <table className="table table-xs table-pin-rows w-full">
                  <thead>
                    <tr className="bg-base-200/80 text-base-content/60 border-b border-base-200">
                      <th className="py-3">Status</th>
                      <th className="py-3">Nume</th>
                      <th className="py-3">Prenume</th>
                      <th className="py-3">Categorie</th>
                      <th className="py-3">Contact</th>
                      <th className="py-3 text-right">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, idx) => (
                      <tr key={idx} className={`hover:bg-base-200/30 transition-colors border-b border-base-200/50 ${!row.isValid ? 'bg-error/5' : ''}`}>
                        <td className="py-3">
                          {row.isValid ? (
                            <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="tooltip tooltip-right" data-tip={row.errors.join(', ')}>
                                <div className="w-5 h-5 rounded-full bg-error/20 text-error flex items-center justify-center">
                                    <AlertCircle size={12} strokeWidth={3} />
                                </div>
                            </div>
                          )}
                        </td>
                        <td className="font-semibold text-base-content py-3">{row.lastName}</td>
                        <td className="font-semibold text-base-content py-3">{row.firstName}</td>
                        <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${!row.isValid && row.errors.some(e => e.includes('Categorie')) ? 'border-error text-error bg-error/10' : 'border-base-300 bg-base-200 text-base-content/60'}`}>
                                {row.activityCategory || 'LIPSĂ'}
                            </span>
                        </td>
                        <td className="py-3">
                            <div className="flex flex-col text-[10px]">
                                <span className="opacity-60">{row.phone || '-'}</span>
                                <span className="opacity-40">{row.email || '-'}</span>
                            </div>
                        </td>
                        <td className="text-right py-3 pr-4">
                            <button onClick={() => removeRow(idx)} className="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error">
                                <Trash2 size={12} />
                            </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center bg-base-200/30 p-4 rounded-2xl border border-base-200 mt-4">
                  <div className="text-xs text-base-content/60 flex items-center gap-2">
                    <AlertCircle size={14} className="text-info" />
                    Doar rândurile valide vor fi importate.
                  </div>
                  <div className="flex gap-3">
                    <button onClick={onClose} className="btn btn-ghost px-8 rounded-xl font-bold" disabled={isImporting}>Anulează</button>
                    <button 
                        onClick={handleImport} 
                        className="btn btn-primary px-10 rounded-xl font-bold shadow-lg shadow-primary/20"
                        disabled={importRows.filter(r => r.isValid).length === 0 || isImporting}
                    >
                      {isImporting ? <span className="loading loading-spinner loading-sm"></span> : `Importă ${importRows.filter(r => r.isValid).length} Voluntari`}
                    </button>
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="modal-backdrop bg-base-300/60 backdrop-blur-sm" onClick={onClose}></div>
    </div>
  );
}
