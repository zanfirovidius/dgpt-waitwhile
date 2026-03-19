'use client';

import { ExtendedUser } from '@/app/page';
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
      setError("Please select a location first.");
      return;
    }

    if (!name.trim() || !phone.trim()) {
      setError("Name and Phone are required.");
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
          <span className="label-text font-semibold">Full Name</span>
        </label>
        <input 
          type="text" 
          placeholder="John Doe" 
          className="input input-bordered w-full bg-base-200 focus:bg-base-100" 
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text font-semibold">Phone Number</span>
        </label>
        <input 
          type="tel" 
          placeholder="07xxxxxxxx" 
          className="input input-bordered w-full bg-base-200 focus:bg-base-100" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text font-semibold">Role</span>
        </label>
        <select 
          className="select select-bordered w-full bg-base-200 focus:bg-base-100"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="SECRETARIAT">Secretariat</option>
          <option value="SEF-CABINET">Sef Cabinet</option>
        </select>
      </div>

      {error && <div className="text-error text-sm mt-1">{error}</div>}

      <button type="submit" className="btn btn-secondary mt-2 w-full gap-2">
        <UserPlus size={18} /> Add User
      </button>
    </form>
  );
}
