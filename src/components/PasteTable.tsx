'use client';

import { ExtendedUser } from '@/app/page';
import { ClipboardPaste } from 'lucide-react';
import { useState } from 'react';

interface PasteTableProps {
  onUsersParsed: (users: ExtendedUser[]) => void;
  selectedLocation: string;
  emailDomain: string;
}

export default function PasteTable({ onUsersParsed, selectedLocation, emailDomain }: PasteTableProps) {
  const [rawData, setRawData] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleProcess = () => {
    setError(null);
    if (!selectedLocation) {
      setError("Please select a location first.");
      return;
    }

    if (!rawData.trim()) {
      setError("Please paste some data first.");
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
          let role = 'SEF-CABINET'; // Default fallback
          
          if (cols.length >= 3 && cols[2]) {
            const rawRole = cols[2].toUpperCase();
            if (rawRole === 'SECRETARIAT' || rawRole === 'SEF-CABINET') {
              role = rawRole;
            }
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
        throw new Error("Could not parse any valid users. Please ensure you are pasting at least Name and Phone columns side-by-side (separated by tabs).");
      }

      onUsersParsed(parsedUsers);
      setRawData(''); // Clear after successful add
    } catch (err: any) {
      setError(err.message || "Failed to process pasted data.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="alert alert-info text-sm py-2 rounded-xl text-info-content">
        <ClipboardPaste size={16} />
        <span>Paste columns directly from Excel in this order: <strong>Name, Phone, [Role (Optional)]</strong></span>
      </div>
      
      <textarea
        className="textarea textarea-bordered w-full h-40 bg-base-200 focus:bg-base-100 font-mono text-sm leading-relaxed whitespace-pre overflow-auto"
        placeholder="John Doe&#9;0745123456&#9;SECRETARIAT&#10;Jane Smith&#9;0755123456&#9;SEF-CABINET"
        value={rawData}
        onChange={(e) => setRawData(e.target.value)}
      ></textarea>

      {error && <div className="text-error text-sm mt-1 font-medium px-1">{error}</div>}

      <button onClick={handleProcess} className="btn btn-secondary mt-2 w-full gap-2">
        <ClipboardPaste size={18} /> Parse & Add Users
      </button>
    </div>
  );
}
