'use client';

import { ExtendedUser } from '@/app/page';
import { normalizeWaitwhileRole } from '@/lib/waitwhile-user-roles';
import { useState } from 'react';
import { FileDropzone } from '@/components/FileDropzone';

interface UploaderProps {
  onUsersParsed: (users: ExtendedUser[]) => void;
  selectedLocation: string;
  emailDomain: string;
  defaultRole: string;
}

export default function Uploader({ onUsersParsed, selectedLocation, emailDomain, defaultRole }: UploaderProps) {
  const [error, setError] = useState<string | null>(null);

  const normalizeHeader = (value: string | number | boolean | null | undefined) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const handleFileUpload = (file: File) => {
    setError(null);
    if (!selectedLocation) {
      setError('Selectează mai întâi locația din zona de configurare.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, { header: 1 });
        
        if (jsonData.length < 5) {
          throw new Error('Fișierul Excel trebuie să aibă cel puțin 5 rânduri, inclusiv antetul.');
        }

        // According to the legacy script, row 5 (index 4) contains headers
        const headerRow = jsonData[4] || [];
        const nameIndex = headerRow.findIndex((header) => {
          const normalized = normalizeHeader(header);
          return normalized.includes('name') || normalized.includes('nume');
        });
        const phoneIndex = headerRow.findIndex((header) => {
          const normalized = normalizeHeader(header);
          return normalized.includes('phone') || normalized.includes('telefon');
        });
        const roleIndex = headerRow.findIndex((header) =>
          header && ['role', 'type', 'account', 'rol', 'functie'].some((token) => normalizeHeader(header).includes(token))
        );

        if (nameIndex === -1 || phoneIndex === -1) {
          throw new Error('Rândul de antet trebuie să conțină coloanele Name/Nume și Phone/Telefon.');
        }

        const parsedUsers: ExtendedUser[] = [];
        
        // Data starts from row 6 (index 5)
        for (let i = 5; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          if (row[nameIndex] && row[phoneIndex]) {
            let role = defaultRole;
            if (roleIndex !== -1 && row[roleIndex]) {
              role = normalizeWaitwhileRole(row[roleIndex].toString(), defaultRole);
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
          throw new Error('Nu am găsit utilizatori valizi în fișier. Verifică numele, telefonul și rândul de antet.');
        }

        onUsersParsed(parsedUsers);

      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : 'Nu am putut procesa fișierul Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <FileDropzone
        accept=".xlsx,.xls"
        title="Încarcă fișierul Excel"
        subtitle="Dă click sau trage aici fișierul .xlsx sau .xls"
        hint="Rândul 5 trebuie să conțină coloanele Name/Nume și Phone/Telefon. Coloana de rol este opțională."
        error={error}
        onFileSelected={(file) => handleFileUpload(file)}
      />
    </div>
  );
}
