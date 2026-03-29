'use client';

import { useEffect, useState } from 'react';
import { createVolunteer } from '@/app/actions/volunteers';
import { getProject } from '@/app/actions/projects';
import * as XLSX from 'xlsx';
import { X, Upload, UploadCloud, Check, AlertCircle, Trash2, Download, FileSpreadsheet } from 'lucide-react';

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

type ImportLayout = 'full-name' | 'split-name';

const IMPORT_HEADERS = ['Nume complet', 'Telefon', 'Email', 'Categorie'] as const;
const LEGACY_IMPORT_HEADERS = ['Nume', 'Prenume', 'Telefon', 'Email', 'Categorie'] as const;
const PROFESSIONAL_PREFIX_TOKENS = new Set([
  'dr',
  'doctor',
  'prof',
  'profesor',
  'profesoara',
  'univ',
  'universitar',
  'universitara',
  'asis',
  'asist',
  'asistent',
  'conf',
  'conferentiar',
  'conferentiar',
  'lector',
  'sef',
  'lucr',
  'med',
  'medic',
]);

function normalizeImportToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

function normalizeImportLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectHeaderLayout(parts: string[]): ImportLayout | null {
  const normalized = parts.map((part) => normalizeImportLabel(part));

  const isFullNameHeader =
    normalized.length >= IMPORT_HEADERS.length &&
    normalized[0].includes('nume') &&
    (normalized[0].includes('prenume') || normalized[0].includes('complet')) &&
    normalized[1].startsWith('telefon') &&
    normalized[2].includes('mail') &&
    normalized[3].startsWith('categorie');

  if (isFullNameHeader) {
    return 'full-name';
  }

  const isSplitNameHeader =
    normalized.length >= LEGACY_IMPORT_HEADERS.length &&
    normalized[0] === 'nume' &&
    normalized[1] === 'prenume' &&
    normalized[2].startsWith('telefon') &&
    normalized[3].includes('mail') &&
    normalized[4].startsWith('categorie');

  return isSplitNameHeader ? 'split-name' : null;
}

function inferImportLayout(parts: string[]) {
  const secondColumn = parts[1]?.trim() || '';
  const thirdColumn = parts[2]?.trim() || '';
  const normalizedSecondColumn = secondColumn.replace(/[^0-9+]/g, '');

  if (
    parts.length >= LEGACY_IMPORT_HEADERS.length &&
    normalizedSecondColumn.length < 6 &&
    !thirdColumn.includes('@')
  ) {
    return 'split-name';
  }

  return 'full-name';
}

function stripProfessionalPrefix(rawFullName: string) {
  const tokens = rawFullName
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => token.replace(/^[,;:.()/-]+|[,;:.()/-]+$/g, ''))
    .filter(Boolean);

  let firstNameTokenIndex = 0;
  while (
    firstNameTokenIndex < tokens.length &&
    PROFESSIONAL_PREFIX_TOKENS.has(normalizeImportToken(tokens[firstNameTokenIndex]))
  ) {
    firstNameTokenIndex += 1;
  }

  return tokens.slice(firstNameTokenIndex).join(' ').trim();
}

function splitImportedFullName(rawFullName: string) {
  const cleanedFullName = stripProfessionalPrefix(rawFullName);
  const nameTokens = cleanedFullName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (nameTokens.length === 0) {
    return { lastName: '', firstName: '' };
  }

  if (nameTokens.length === 1) {
    return { lastName: nameTokens[0], firstName: '' };
  }

  return {
    lastName: nameTokens[0],
    firstName: nameTokens.slice(1).join(' '),
  };
}

function parseImportLine(parts: string[], layout: ImportLayout) {
  if (layout === 'split-name') {
    return {
      lastName: parts[0]?.trim() || '',
      firstName: parts[1]?.trim() || '',
      phone: parts[2]?.trim() || '',
      email: parts[3]?.trim() || '',
      activityCategory: parts[4]?.trim() || '',
    };
  }

  const parsedName = splitImportedFullName(parts[0]?.trim() || '');
  return {
    ...parsedName,
    phone: parts[1]?.trim() || '',
    email: parts[2]?.trim() || '',
    activityCategory: parts[3]?.trim() || '',
  };
}

function normalizeCategoryKey(value: string) {
  return normalizeImportLabel(value);
}

function buildImportRows(rawRows: string[][], categories: string[]) {
  const rows = rawRows
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  const headerLayout = rows.length > 0 ? detectHeaderLayout(rows[0]) : null;
  const dataRows = headerLayout ? rows.slice(1) : rows;

  if (dataRows.length === 0) {
    throw new Error('Nu am găsit rânduri de import. Completați template-ul și copiați doar rândurile cu voluntari.');
  }

  const categoryLookup = new Map(
    categories.map((category) => [normalizeCategoryKey(category), category]),
  );

  return dataRows.map((parts) => {
    const layout = headerLayout || inferImportLayout(parts);
    const importedLine = parseImportLine(parts, layout);
    const activityCategoryRaw = importedLine.activityCategory.trim();
    const normalizedCategory = normalizeCategoryKey(activityCategoryRaw);
    const row: ImportRow = {
      lastName: importedLine.lastName,
      firstName: importedLine.firstName,
      phone: importedLine.phone,
      email: importedLine.email,
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
}

export function ImportVolunteersModal({ isOpen, onClose, onSuccess, projectId, categories }: ImportVolunteersModalProps) {
  const [pasteContent, setPasteContent] = useState('');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [parseError, setParseError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>(
    categories.length > 0 ? categories : ['VOLUNTAR'],
  );

  useEffect(() => {
    setAvailableCategories(categories.length > 0 ? categories : ['VOLUNTAR']);
  }, [categories]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const projectRes = await getProject(projectId);
      if (!cancelled && projectRes.success && projectRes.data?.volunteerRoles?.length) {
        setAvailableCategories(projectRes.data.volunteerRoles);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId]);

  const handleDownloadTemplate = () => {
    const categoriesForImport = availableCategories.length > 0 ? availableCategories : ['VOLUNTAR'];
    const sampleRows: string[][] = [
      [...IMPORT_HEADERS],
      ['Popescu Maria', '0722123456', 'maria.popescu@example.com', categoriesForImport[0]],
      ['Prof. Univ. Dr. Ionescu Andrei', '0733123456', 'andrei.ionescu@example.com', categoriesForImport[1] || categoriesForImport[0]],
      ['', '', '', ''],
    ];

    const workbook = XLSX.utils.book_new();
    const volunteersSheet = XLSX.utils.aoa_to_sheet(sampleRows);
    volunteersSheet['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 32 },
      { wch: 22 },
    ];

    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ['Template import voluntari'],
      ['1. Completați sau înlocuiți rândurile din foaia "Voluntari".'],
      ['2. Păstrați ordinea coloanelor: Nume complet, Telefon, Email, Categorie.'],
      ['3. Copiați rândurile completate din Excel și lipiți-le în fereastra de import.'],
      ['4. Prefixele profesionale sau academice (ex: Dr., Prof. Univ. Dr., Asis. Univ. Dr.) sunt eliminate automat la import.'],
      ['5. Categoriile acceptate sunt listate mai jos.'],
      [''],
      ['Categorii acceptate'],
      ...categoriesForImport.map((category) => [category]),
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
      const rows = pasteContent
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => line.split('\t'));

      setImportRows(buildImportRows(rows, availableCategories));
      setShowPreview(true);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Datele nu au putut fi procesate.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setParseError('');

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error('Fișierul Excel nu conține nicio foaie.');
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        defval: '',
      }) as unknown as string[][];

      setImportRows(buildImportRows(rows, availableCategories));
      setShowPreview(true);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Fișierul Excel nu a putut fi procesat.');
    } finally {
      setIsProcessing(false);
      setIsDragActive(false);
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleFileUpload(file);
    event.target.value = '';
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
                    <p className="text-xs text-base-content/50">Lipiți date din Excel (Nume complet, Telefon, Email, Categorie)</p>
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
                      <code className="text-[10px] bg-base-300 p-2 rounded-lg block">Nume complet [TAB] Telefon [TAB] Email [TAB] Categorie</code>
                      <p className="text-[10px] text-base-content/40 mt-2">Exemplu: Popescu Maria [TAB] 0722123456 [TAB] maria@dgpt.ro [TAB] VOLUNTAR</p>
                      <p className="text-[10px] text-base-content/40 mt-1">Exemplu medici: Prof. Univ. Dr. Ionescu Andrei sau Dr. Popescu Maria. Prefixele sunt eliminate automat la import.</p>
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
                  <p className="text-[10px] text-base-content/50 mt-3">Modelul `.xlsx` poate fi completat, apoi rândurile pot fi copiate direct din Excel în acest câmp. Formatul vechi cu `Nume` și `Prenume` separate rămâne acceptat.</p>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    void handleFileUpload(file);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors cursor-pointer group hover:border-primary hover:bg-base-200/50 ${
                  isDragActive ? 'border-primary bg-primary/10' : 'border-base-300'
                }`}
                onClick={() => document.getElementById('volunteers-file-upload')?.click()}
              >
                <UploadCloud
                  className={`mx-auto mb-4 transition-colors ${
                    isDragActive ? 'text-primary' : 'text-base-content/40 group-hover:text-primary'
                  }`}
                  size={42}
                />
                <h4 className="font-bold text-base mb-1">Încarcă fișierul Excel</h4>
                <p className="text-sm text-base-content/60 flex items-center justify-center gap-1">
                  <FileSpreadsheet size={14} /> Suportă `.xlsx` și `.xls`
                </p>
                <p className="text-[10px] text-base-content/40 mt-2">
                  Format recomandat: Nume complet, Telefon, Email, Categorie
                </p>
                <input
                  id="volunteers-file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    void handleFileInputChange(event);
                  }}
                />
              </div>

              <div className="divider text-[10px] uppercase font-bold opacity-40 tracking-[0.2em]">sau</div>

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
