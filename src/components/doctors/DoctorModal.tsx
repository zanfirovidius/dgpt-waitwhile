'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CopyPlus,
  ExternalLink,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';
import { createDoctor, updateDoctor } from '@/app/actions/doctors';
import type {
  DoctorDuplicateMatch,
  DoctorFormInput,
  DoctorRecord,
} from '@/lib/doctor-types';
import { getDoctorSpecialtyOptions } from '@/lib/doctor-defaults';
import { SearchableSelect } from '@/components/SearchableSelect';

type DoctorModalProps = {
  isOpen: boolean;
  doctor?: DoctorRecord | null;
  onClose: () => void;
  onSaved: (doctor?: DoctorRecord) => void;
};

const EMPTY_FORM: DoctorFormInput = {
  fullName: '',
  professionalGrade: '',
  phone: '',
  email: '',
  cuim: '',
  specialty: '',
  notes: '',
  status: 'active',
};

export function DoctorModal({ isOpen, doctor, onClose, onSaved }: DoctorModalProps) {
  const [formData, setFormData] = useState<DoctorFormInput>(() =>
    doctor
      ? {
          fullName: doctor.fullName || '',
          professionalGrade: doctor.professionalGrade || '',
          phone: doctor.phone || '',
          email: doctor.email || '',
          cuim: doctor.cuim || '',
          specialty: doctor.specialty || '',
          notes: doctor.notes || '',
          status: doctor.status || 'active',
        }
      : EMPTY_FORM,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState<DoctorDuplicateMatch[]>([]);
  const [selectedMatchDoctorId, setSelectedMatchDoctorId] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    setError('');

    const result = doctor
      ? await updateDoctor(doctor.$id || '', formData)
      : await createDoctor(formData);

    if (result.success) {
      onSaved(result.data);
      onClose();
      setIsSaving(false);
      return;
    }

    if (result.requiresResolution && result.duplicates?.length) {
      setDuplicateMatches(result.duplicates);
      setSelectedMatchDoctorId(result.duplicates[0].doctorId);
      setIsSaving(false);
      return;
    }

    setError(result.error || 'Nu am putut salva medicul.');
    setIsSaving(false);
  };

  const handleResolveDuplicate = async (action: 'update_existing' | 'overwrite_existing' | 'create_anyway') => {
    setIsSaving(true);
    setError('');

    const result = await createDoctor(
      formData,
      action === 'create_anyway'
        ? { action }
        : { action, targetDoctorId: selectedMatchDoctorId || duplicateMatches[0]?.doctorId },
    );

    if (result.success) {
      onSaved(result.data);
      onClose();
      setIsSaving(false);
      return;
    }

    setError(result.error || 'Nu am putut rezolva conflictul de duplicat.');
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-base-300 bg-base-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-black text-base-content">
              {doctor ? 'Editează medicul' : 'Adaugă medic'}
            </h2>
            <p className="text-xs text-base-content/50">
              Registru master la nivel de platformă
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Închide formularul de medic">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <div className="alert alert-error rounded-2xl text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="form-control">
              <span className="label"><span className="label-text font-semibold">Nume complet</span></span>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.fullName}
                onChange={(event) => setFormData((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>

            <label className="form-control">
              <span className="label"><span className="label-text font-semibold">Grad profesional/universitar</span></span>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.professionalGrade}
                onChange={(event) => setFormData((current) => ({ ...current, professionalGrade: event.target.value }))}
              />
            </label>

            <label className="form-control">
              <span className="label"><span className="label-text">Telefon</span></span>
              <input
                type="tel"
                className="input input-bordered w-full"
                value={formData.phone || ''}
                onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>

            <label className="form-control">
              <span className="label"><span className="label-text">Email</span></span>
              <input
                type="email"
                className="input input-bordered w-full"
                value={formData.email || ''}
                onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
              />
            </label>

            <label className="form-control">
              <span className="label"><span className="label-text">CUIM</span></span>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.cuim || ''}
                onChange={(event) => setFormData((current) => ({ ...current, cuim: event.target.value }))}
              />
            </label>

            <label className="form-control">
              <span className="label"><span className="label-text">Specialitate</span></span>
              <SearchableSelect
                value={formData.specialty || ''}
                options={getDoctorSpecialtyOptions(formData.specialty)}
                placeholder="Alege specialitatea"
                emptyOptionLabel="Fără specialitate selectată"
                searchPlaceholder="Caută specialitatea"
                onChange={(value) => setFormData((current) => ({ ...current, specialty: value }))}
              />
            </label>

            <label className="form-control md:col-span-2">
              <span className="label"><span className="label-text">Observații</span></span>
              <textarea
                className="textarea textarea-bordered min-h-28 w-full"
                value={formData.notes || ''}
                onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <label className="form-control md:col-span-2">
              <span className="label"><span className="label-text">Status</span></span>
              <select
                className="select select-bordered w-full"
                value={formData.status || 'active'}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    status: event.target.value as DoctorFormInput['status'],
                  }))
                }
              >
                <option value="active">Activ</option>
                <option value="inactive">Inactiv</option>
                <option value="archived">Arhivat</option>
              </select>
            </label>
          </div>

          {duplicateMatches.length > 0 && !doctor && (
            <div className="rounded-[1.5rem] border border-warning/30 bg-warning/5 p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 shrink-0 text-warning" size={18} />
                <div className="w-full space-y-4">
                  <div>
                    <h3 className="font-black text-base-content">Posibile duplicate găsite</h3>
                    <p className="text-sm text-base-content/70">
                      Revizuiește medicii existenți și alege dacă actualizezi unul dintre ei sau creezi totuși un record nou.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {duplicateMatches.map((match) => (
                      <label
                        key={match.doctorId}
                        className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selectedMatchDoctorId === match.doctorId ? 'border-warning bg-warning/10' : 'border-base-300 bg-base-100'}`}
                      >
                        <input
                          type="radio"
                          name="duplicate-target"
                          className="radio radio-warning mt-1"
                          checked={selectedMatchDoctorId === match.doctorId}
                          onChange={() => setSelectedMatchDoctorId(match.doctorId)}
                        />
                        <div className="w-full space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{match.fullName}</span>
                            <span className="badge badge-outline">{match.professionalGrade}</span>
                            <span className={`badge ${match.hasImage ? 'badge-success' : 'badge-ghost'}`}>
                              {match.hasImage ? 'Are imagine' : 'Fără imagine'}
                            </span>
                          </div>
                          <div className="grid gap-2 text-xs text-base-content/60 md:grid-cols-3">
                            <span>Telefon: {match.phone || '-'}</span>
                            <span>Email: {match.email || '-'}</span>
                            <span>CUIM: {match.cuim || '-'}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {match.matchReasons.map((reason) => (
                              <span key={reason} className="badge badge-warning badge-outline">
                                match {reason}
                              </span>
                            ))}
                            {match.differingFields.map((field) => (
                              <span key={field} className="badge badge-ghost">
                                diferă {field}
                              </span>
                            ))}
                          </div>
                          <Link href={`/doctors/${match.doctorId}`} className="btn btn-ghost btn-xs gap-2">
                            <ExternalLink size={12} /> Deschide medicul existent
                          </Link>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-warning btn-sm gap-2"
                      onClick={() => handleResolveDuplicate('update_existing')}
                      disabled={isSaving}
                    >
                      {isSaving ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                      Update existing
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm gap-2"
                      onClick={() => handleResolveDuplicate('overwrite_existing')}
                      disabled={isSaving}
                    >
                      <CopyPlus size={14} />
                      Overwrite existing
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent btn-sm gap-2"
                      onClick={() => handleResolveDuplicate('create_anyway')}
                      disabled={isSaving}
                    >
                      Creează oricum
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-200 px-6 py-4">
          <button type="button" className="btn btn-ghost rounded-xl" onClick={onClose} disabled={isSaving}>
            Anulează
          </button>
          <button type="button" className="btn btn-primary rounded-xl gap-2" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <span className="loading loading-spinner loading-xs" /> : <Save size={16} />}
            {doctor ? 'Salvează modificările' : 'Salvează medicul'}
          </button>
        </div>
      </div>
    </div>
  );
}
