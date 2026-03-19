'use client';

import { ExtendedUser } from '@/app/page';
import { AlertCircle, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import * as XLSX from 'xlsx';

interface UploaderProps {
  onUsersParsed: (users: ExtendedUser[]) => void;
  selectedLocation: string;
  emailDomain: string;
  defaultRole: string;
}

export default function Uploader({ onUsersParsed, selectedLocation, emailDomain, defaultRole }: UploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (file: File) => {
    setError(null);
    if (!selectedLocation) {
      setError("Please select a Waitwhile Location from the top configuration first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        if (jsonData.length < 5) {
          throw new Error('Excel file must have at least 5 rows (including headers).');
        }

        // According to the legacy script, row 5 (index 4) contains headers
        const headerRow = jsonData[4] || [];
        const nameIndex = headerRow.findIndex((h: any) => h && h.toString().toLowerCase().includes('name'));
        const phoneIndex = headerRow.findIndex((h: any) => h && h.toString().toLowerCase().includes('phone'));
        const roleIndex = headerRow.findIndex((h: any) => 
          h && (h.toString().toLowerCase().includes('role') || h.toString().toLowerCase().includes('type') || h.toString().toLowerCase().includes('account'))
        );

        if (nameIndex === -1 || phoneIndex === -1) {
          throw new Error('Header row must contain "name" and "phone" columns.');
        }

        const parsedUsers: ExtendedUser[] = [];
        
        // Data starts from row 6 (index 5)
        for (let i = 5; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          if (row[nameIndex] && row[phoneIndex]) {
            let role = defaultRole;
            if (roleIndex !== -1 && row[roleIndex]) {
              const rawRole = row[roleIndex].toString().trim().toUpperCase();
              role = (rawRole === 'SECRETARIAT' || rawRole === 'SEF-CABINET') ? rawRole : defaultRole;
            }

            // Using phone + custom domain for email
            const phoneStr = row[phoneIndex].toString().replace(/\D/g,''); // clean phone, keep leading 0 if present
            const email = `${phoneStr}@${emailDomain}`;

            parsedUsers.push({
              id: crypto.randomUUID(),
              name: row[nameIndex].toString().trim(),
              email,
              locationIds: [], // We'll set these later or at execution
              defaultLocationId: selectedLocation,
              roles: [role],
            });
          }
        }

        if (parsedUsers.length === 0) {
          throw new Error("No valid users found in the file.");
        }

        onUsersParsed(parsedUsers);

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
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <UploadCloud className={`mx-auto mb-4 transition-colors ${isDragActive ? 'text-primary' : 'text-base-content/40 group-hover:text-primary'}`} size={48} />
        <h3 className="font-bold text-lg mb-1">Click or drag Excel file here</h3>
        <p className="text-sm text-base-content/60 flex items-center justify-center gap-1">
          <FileSpreadsheet size={14} /> Supports .xlsx, .xls
        </p>
        <input 
          id="file-upload" 
          type="file" 
          accept=".xlsx, .xls" 
          className="hidden" 
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(e.target.files[0]);
              // Reset so same file can be uploaded again if needed
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
