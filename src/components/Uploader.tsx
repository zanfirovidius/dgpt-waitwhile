'use client';

import { ExtendedUser } from '@/app/page';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { FileDropzone } from '@/components/FileDropzone';

interface UploaderProps {
  onUsersParsed: (users: ExtendedUser[]) => void;
  selectedLocation: string;
  emailDomain: string;
  defaultRole: string;
}

export default function Uploader({ onUsersParsed, selectedLocation, emailDomain, defaultRole }: UploaderProps) {
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

        const jsonData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, { header: 1 });
        
        if (jsonData.length < 5) {
          throw new Error('Excel file must have at least 5 rows (including headers).');
        }

        // According to the legacy script, row 5 (index 4) contains headers
        const headerRow = jsonData[4] || [];
        const nameIndex = headerRow.findIndex((header) => header && String(header).toLowerCase().includes('name'));
        const phoneIndex = headerRow.findIndex((header) => header && String(header).toLowerCase().includes('phone'));
        const roleIndex = headerRow.findIndex((header) =>
          header && (String(header).toLowerCase().includes('role') || String(header).toLowerCase().includes('type') || String(header).toLowerCase().includes('account'))
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

      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : 'Error parsing Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <FileDropzone
        accept=".xlsx,.xls"
        title="Click or drag Excel file here"
        subtitle="Supports .xlsx, .xls"
        error={error}
        onFileSelected={(file) => handleFileUpload(file)}
      />
    </div>
  );
}
