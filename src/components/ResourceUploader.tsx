'use client';

import { AlertCircle, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────
interface HoursPeriod { from: string; to: string; }

interface DateHours {
  dateKey: string;
  displayDate: string;
  isOpen: boolean;
  periods: HoursPeriod[];
}

export interface ResourceDraft {
  id: string;
  name: string;
  description: string;
  color: string;
  dateHours: DateHours[];
  syncStatus?: 'idle' | 'success' | 'error';
  syncMessage?: string;
}

interface ResourceUploaderProps {
  onResourcesParsed: (resources: ResourceDraft[]) => void;
  selectedLocation: string;
  selectedCategoryId: string;
  resourceColors: string[];
  currentCount: number;
}

type WorksheetRow = Array<string | number | boolean | Date | null | undefined>;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

function parseExcelHeader(header: string): { dateKey: string; displayDate: string; from: string; to: string } | null {
  const match = header.match(/(\d{2})\.(\d{2})\.(\d{4}).*?\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\)/);
  if (!match) return null;
  const [, dd, mm, yyyy, from, to] = match;
  const dateKey = `${yyyy}${mm}${dd}`;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  const displayDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return { dateKey, displayDate, from, to };
}

export default function ResourceUploader({ onResourcesParsed, selectedLocation, selectedCategoryId, resourceColors, currentCount }: ResourceUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const formatUnknownError = (err: unknown) => (err instanceof Error ? err.message : 'A apărut o eroare la procesarea fișierului.');

  const handleFileUpload = (file: File) => {
    setError(null);
    if (!selectedLocation) {
      setError('Selectează mai întâi locația din zona de configurare.');
      return;
    }
    if (!selectedCategoryId) {
      setError('Selectează mai întâi categoria din zona de configurare.');
      return;
    }
    if (!ACCEPTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      setError('Fișierul trebuie să fie în format Excel (.xlsx sau .xls).');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('Fișierul este prea mare. Limita curentă este de 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setError('Nu am putut citi fișierul selectat. Încearcă din nou cu un export Excel valid.');
    };
    reader.onabort = () => {
      setError('Încărcarea fișierului a fost întreruptă.');
    };
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          throw new Error('Fișierul nu a putut fi decodat corect.');
        }

        const data = new Uint8Array(result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error('Fișierul Excel nu conține niciun sheet utilizabil.');
        }

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Fișierul Excel nu conține date care pot fi citite.');
        }
        
        const rows = XLSX.utils.sheet_to_json<WorksheetRow>(worksheet, { header: 1, defval: '' });
        
        if (rows.length < 2) {
          throw new Error('Fișierul Excel trebuie să conțină cel puțin două rânduri.');
        }

        const headers = rows[0];
        const columnSlots: ({ dateKey: string; displayDate: string; from: string; to: string } | null)[] = [];
        for (let c = 0; c < headers.length; c++) {
          if (c === 0) { columnSlots.push(null); continue; }
          columnSlots.push(parseExcelHeader(String(headers[c] || '')));
        }

        const allExcelDates: Record<string, string> = {};
        for (const slot of columnSlots) { if (slot) allExcelDates[slot.dateKey] = slot.displayDate; }
        const sortedDateKeys = Object.keys(allExcelDates).sort();

        const newDrafts: ResourceDraft[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const resourceName = String(row[0] || '').trim();
          if (!resourceName) continue;

          const intervalsMap: Record<string, { from: string; to: string }[]> = {};
          for (let c = 1; c < row.length; c++) {
            const cellValue = String(row[c] || '').trim();
            const slot = columnSlots[c];
            if (!slot || !cellValue) continue;
            if (!intervalsMap[slot.dateKey]) intervalsMap[slot.dateKey] = [];
            const exists = intervalsMap[slot.dateKey].some(p => p.from === slot.from && p.to === slot.to);
            if (!exists) intervalsMap[slot.dateKey].push({ from: slot.from, to: slot.to });
          }

          const dateHours: DateHours[] = sortedDateKeys.map(dateKey => {
            const periods = intervalsMap[dateKey] || [];
            return { dateKey, displayDate: allExcelDates[dateKey], isOpen: periods.length > 0, periods };
          });

          newDrafts.push({
            id: uid(), name: resourceName, description: '',
            color: resourceColors[(currentCount + newDrafts.length) % resourceColors.length],
            dateHours,
          });
        }

        if (newDrafts.length === 0) {
          throw new Error('Nu am găsit resurse valide în fișierul importat.');
        }

        onResourcesParsed(newDrafts);

      } catch (err: unknown) {
        setError(formatUnknownError(err));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = () => {
    setIsDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer group hover:border-primary hover:bg-base-200/50 ${isDragActive ? 'border-primary bg-primary/10' : 'border-base-300'}`}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Încarcă fișier Excel cu resurse"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <UploadCloud className={`mx-auto mb-4 transition-colors ${isDragActive ? 'text-primary' : 'text-base-content/40 group-hover:text-primary'}`} size={48} />
        <h3 className="font-bold text-lg mb-1">Apasă sau trage aici fișierul Excel</h3>
        <p className="text-sm text-base-content/60 flex items-center justify-center gap-1 mb-2">
          <FileSpreadsheet size={14} /> Acceptă fișiere `.xlsx` și `.xls`
        </p>
        <p className="text-xs text-base-content/40">
          Format: coloana A pentru nume, coloanele următoare pentru intervale (ex. 29.03.2026 (10:00 - 13:00))
        </p>
        <input 
          ref={inputRef}
          id="res-file-upload" 
          type="file" 
          accept=".xlsx, .xls" 
          className="hidden" 
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />
      </div>

      {error && (
        <div className="alert alert-error text-sm py-2 rounded-xl">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
