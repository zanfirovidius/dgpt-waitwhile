'use client';

import { ExtendedUser } from '@/app/page';
import { WAITWHILE_ROLE_OPTIONS } from '@/lib/waitwhile-user-roles';
import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ManualUserFormProps {
  onAddUser: (user: ExtendedUser) => void;
  selectedLocation: string;
  emailDomain: string;
  defaultRole: string;
}

export default function ManualUserForm({ onAddUser, selectedLocation, emailDomain, defaultRole }: ManualUserFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(defaultRole);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRole(defaultRole);
  }, [defaultRole]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedLocation) {
      setError('Selectează mai întâi locația în care vrei să adaugi utilizatorul.');
      return;
    }

    if (!name.trim() || !phone.trim()) {
      setError('Completează numele și numărul de telefon.');
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const email = `${cleanPhone}@${emailDomain}`;

    onAddUser({
      id: crypto.randomUUID(),
      name: name.trim(),
      email,
      locationIds: [],
      defaultLocationId: selectedLocation,
      roles: [role],
    });

    // Reset form
    setName('');
    setPhone('');
    setRole(defaultRole);
  };

  return (
	    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
	      <div className="form-control">
	        <label className="label">
	          <span className="ui-field-label">Nume complet</span>
	        </label>
        <input 
          type="text" 
          placeholder="Ex: Andrei Popescu" 
          className="input input-bordered w-full bg-base-200 focus:bg-base-100" 
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

	      <div className="form-control">
	        <label className="label">
	          <span className="ui-field-label">Telefon</span>
	        </label>
        <input 
          type="tel" 
          placeholder="Ex: 0745 123 456" 
          className="input input-bordered w-full bg-base-200 focus:bg-base-100" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

	      <div className="form-control">
	        <label className="label">
	          <span className="ui-field-label">Rol</span>
	        </label>
        <select 
          className="select select-bordered w-full bg-base-200 focus:bg-base-100"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {WAITWHILE_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

	      {error && <div className="mt-1 text-sm leading-6 text-error">{error}</div>}

	      <button type="submit" className="btn ui-btn-tonal mt-2 w-full gap-2">
	        <UserPlus size={18} /> Adaugă în listă
	      </button>
    </form>
  );
}
