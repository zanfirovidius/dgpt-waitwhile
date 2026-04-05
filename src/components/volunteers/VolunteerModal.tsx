'use client';

import { useState, useEffect } from 'react';
import { ProjectVolunteer, createVolunteer, updateVolunteer } from '@/app/actions/volunteers';
import { X, Save, AlertCircle } from 'lucide-react';

interface VolunteerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  volunteer?: ProjectVolunteer | null;
  categories: string[];
}

export function VolunteerModal({ isOpen, onClose, onSuccess, projectId, volunteer, categories }: VolunteerModalProps) {
  const [formData, setFormData] = useState<Partial<ProjectVolunteer>>({
    projectId,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    cnp: '',
    identitySeries: '',
    identityNumber: '',
    activityCategory: categories[0] || 'VOLUNTAR',
    status: 'active',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (volunteer) {
        setFormData(volunteer);
    } else {
        setFormData({
            projectId,
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            address: '',
            cnp: '',
            identitySeries: '',
            identityNumber: '',
            activityCategory: categories[0] || 'VOLUNTAR',
            status: 'active',
            notes: '',
        });
    }
  }, [volunteer, projectId, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
        const res = volunteer && volunteer.$id
            ? await updateVolunteer(volunteer.$id, formData)
            : await createVolunteer(formData);

        if (res.success) {
            onSuccess();
            onClose();
        } else {
            setError(res.error || 'Eroare la salvarea voluntarului');
        }
    } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Eroare neașteptată');
    } finally {
        setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-lg p-0 overflow-hidden bg-base-100 rounded-2xl border border-base-200 shadow-2xl">
        <div className="bg-gradient-to-r from-accent/10 to-transparent p-6 border-b border-base-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-accent">
                {volunteer ? 'Editează Voluntar' : 'Adaugă Voluntar Nou'}
            </h3>
            <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle" type="button" aria-label="Închide formularul de voluntar">
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="alert alert-error text-xs p-3 rounded-xl gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">Prenume</span></label>
              <input 
                type="text" 
                className="input input-bordered w-full" 
                value={formData.firstName || ''} 
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} 
                required
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">Nume</span></label>
              <input 
                type="text" 
                className="input input-bordered w-full" 
                value={formData.lastName || ''} 
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} 
                required
              />
            </div>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text font-bold">Categorie / Rol</span></label>
            <select 
              className="select select-bordered w-full font-medium" 
              value={formData.activityCategory || ''} 
              onChange={(e) => setFormData({ ...formData, activityCategory: e.target.value })}
              required
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">Email (Opțional)</span></label>
              <input 
                type="email" 
                className="input input-bordered w-full" 
                value={formData.email || ''} 
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">Telefon (pentru acces SMS)</span></label>
              <input 
                type="tel" 
                className="input input-bordered w-full" 
                value={formData.phone || ''} 
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })} 
              />
            </div>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text font-bold">Adresă</span></label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">CNP</span></label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.cnp || ''}
                onChange={(e) => setFormData({ ...formData, cnp: e.target.value })}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">Serie CI</span></label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.identitySeries || ''}
                onChange={(e) => setFormData({ ...formData, identitySeries: e.target.value })}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-bold">Număr CI</span></label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.identityNumber || ''}
                onChange={(e) => setFormData({ ...formData, identityNumber: e.target.value })}
              />
            </div>
          </div>

          <div className="form-control">
              <label className="label"><span className="label-text font-bold">Status</span></label>
              <div className="flex gap-4">
                  {(['active', 'inactive', 'archived'] as const).map(s => (
                      <label key={s} className="label cursor-pointer gap-2">
                          <input 
                            type="radio" 
                            name="status" 
                            className="radio radio-accent radio-sm" 
                            checked={formData.status === s} 
                            onChange={() => setFormData({ ...formData, status: s })}
                          />
                          <span className="label-text capitalize">{s === 'active' ? 'Activ' : s === 'inactive' ? 'Inactiv' : 'Arhivat'}</span>
                      </label>
                  ))}
              </div>
          </div>

          <div className="form-control">
            <label className="label"><span className="label-text font-bold">Note</span></label>
            <textarea 
              className="textarea textarea-bordered w-full h-24" 
              value={formData.notes || ''} 
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Informații suplimentare despre voluntar..."
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1" disabled={isSaving}>Anulează</button>
            <button type="submit" className="btn btn-accent flex-1 gap-2" disabled={isSaving}>
              {isSaving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={18} />}
              Salvează Voluntar
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop bg-base-300/60 backdrop-blur-sm" onClick={onClose}></div>
    </div>
  );
}
