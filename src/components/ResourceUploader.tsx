'use client';

import { AlertCircle, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import * as XLSX from 'xlsx';

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

  const handleFileUpload = (file: File) => {
    setError(null);
    if (!selectedLocation) {
      setError("Please select a Location from the configuration first.");
      return;
    }
    if (!selectedCategoryId) {
      setError("Please select a Category from the configuration first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        
        if (rows.length < 2) {
          throw new Error('Excel file must have at least 2 rows.');
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
          throw new Error("No valid resources found in the file.");
        }

        onResourcesParsed(newDrafts);

      } catch (err: any) {
        setError(err.message || 'Error parsing Excel file.');
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
        onClick={() => document.getElementById('res-file-upload')?.click()}
      >
        <UploadCloud className={`mx-auto mb-4 transition-colors ${isDragActive ? 'text-primary' : 'text-base-content/40 group-hover:text-primary'}`} size={48} />
        <h3 className="font-bold text-lg mb-1">Click or drag Excel file here</h3>
        <p className="text-sm text-base-content/60 flex items-center justify-center gap-1 mb-2">
          <FileSpreadsheet size={14} /> Supports .xlsx, .xls
        </p>
        <p className="text-xs text-base-content/40">
          Format: Column A for names, subsequent columns for date/time (e.g. 29.03.2026 (10:00 - 13:00))
        </p>
        <input 
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
