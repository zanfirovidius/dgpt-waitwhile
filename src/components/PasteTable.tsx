'use client';

import { ExtendedUser } from '@/app/page';
import { normalizeWaitwhileRole } from '@/lib/waitwhile-user-roles';
import { ClipboardPaste } from 'lucide-react';
import { useState } from 'react';

interface PasteTableProps {
  onUsersParsed: (users: ExtendedUser[]) => void;
  selectedLocation: string;
  emailDomain: string;
  defaultRole: string;
}

export default function PasteTable({ onUsersParsed, selectedLocation, emailDomain, defaultRole }: PasteTableProps) {
  const [rawData, setRawData] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleProcess = () => {
    setError(null);
    if (!selectedLocation) {
      setError('Selectează mai întâi locația în care vrei să adaugi utilizatorii.');
      return;
    }

    if (!rawData.trim()) {
      setError('Lipește mai întâi datele copiate din Excel.');
      return;
    }

    try {
      const rows = rawData.split('\n').filter(row => row.trim().length > 0);
      const parsedUsers: ExtendedUser[] = [];

      for (let i = 0; i < rows.length; i++) {
        // Excel copies cells as tab-separated values
        const cols = rows[i].split('\t').map(c => c.trim());
        
        // We expect at least Name and Phone
        if (cols.length >= 2) {
          const name = cols[0];
          const phone = cols[1];
          let role = defaultRole; // Default fallback
          
          if (cols.length >= 3 && cols[2]) {
            role = normalizeWaitwhileRole(cols[2], defaultRole);
          }

          if (name && phone) {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const email = `${cleanPhone}@${emailDomain}`;

            parsedUsers.push({
              id: crypto.randomUUID(),
              name,
              email,
              locationIds: [],
              defaultLocationId: selectedLocation,
              roles: [role],
            });
          }
        }
      }

      if (parsedUsers.length === 0) {
        throw new Error('Nu am putut identifica utilizatori valizi. Lipește cel puțin coloanele Nume și Telefon, una lângă alta.');
      }

      onUsersParsed(parsedUsers);
      setRawData(''); // Clear after successful add
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nu am putut procesa datele lipite.');
    }
  };

	return (
	    <div className="flex flex-col gap-4">
		      <div className="ui-panel-sky flex items-start gap-3 rounded-xl border px-4 py-3 text-base-content">
	        <ClipboardPaste size={16} />
	        <span className="text-[0.94rem] leading-6">
	          Lipește coloanele din Excel în această ordine: <strong>Nume, Telefon, Rol (opțional)</strong>.
	        </span>
	      </div>
	      
	      <textarea
	        className="textarea textarea-bordered ui-tabular h-40 w-full overflow-auto whitespace-pre bg-base-200 font-mono text-sm leading-relaxed focus:bg-base-100"
	        placeholder="Andrei Popescu&#9;0745123456&#9;Secretariat&#10;Maria Ionescu&#9;0755123456&#9;Sef cabinet"
	        value={rawData}
	        onChange={(e) => setRawData(e.target.value)}
	      ></textarea>

	      {error && <div className="mt-1 px-1 text-sm leading-6 font-medium text-error">{error}</div>}

	      <button onClick={handleProcess} className="btn ui-btn-tonal mt-2 w-full gap-2">
	        <ClipboardPaste size={18} /> Adaugă utilizatorii în listă
	      </button>
    </div>
  );
}
