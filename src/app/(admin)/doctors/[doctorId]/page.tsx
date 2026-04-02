'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Camera,
  Copy,
  ExternalLink,
  FileBadge2,
  Link2,
  Save,
  Trash2,
} from 'lucide-react';
import { archiveDoctor, deleteDoctor, getDoctorAuditTrail, getDoctorById, updateDoctor } from '@/app/actions/doctors';
import type { DoctorAuditLog, DoctorFormInput, DoctorRecord } from '@/lib/doctor-types';
import { DoctorAvatar } from '@/components/doctors/DoctorAvatar';
import { getDoctorSpecialtyOptions } from '@/lib/doctor-defaults';
import { FileDropzone } from '@/components/FileDropzone';
import { SearchableSelect } from '@/components/SearchableSelect';
import { buildDoctorAdminDocumentUrl } from '@/lib/doctor-utils';

export default function DoctorDetailPage() {
  const params = useParams();
  const doctorId = params.doctorId as string;

  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<DoctorAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRemovingImage, setIsRemovingImage] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState<DoctorFormInput>({
    fullName: '',
    professionalGrade: '',
    phone: '',
    email: '',
    cuim: '',
    specialty: '',
    notes: '',
    status: 'active',
  });

  const loadDoctor = async () => {
    setLoading(true);
    setError('');

    const [doctorResult, auditResult] = await Promise.all([
      getDoctorById(doctorId),
      getDoctorAuditTrail(doctorId),
    ]);

    if (!doctorResult.success) {
      setError(doctorResult.error || 'Nu am putut încărca medicul.');
      setLoading(false);
      return;
    }

    setDoctor(doctorResult.data);
    setFormData({
      fullName: doctorResult.data.fullName,
      professionalGrade: doctorResult.data.professionalGrade,
      phone: doctorResult.data.phone || '',
      email: doctorResult.data.email || '',
      cuim: doctorResult.data.cuim || '',
      specialty: doctorResult.data.specialty || '',
      notes: doctorResult.data.notes || '',
      status: doctorResult.data.status,
    });

    if (auditResult.success) {
      setAuditLogs(auditResult.data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [doctorResult, auditResult] = await Promise.all([
        getDoctorById(doctorId),
        getDoctorAuditTrail(doctorId),
      ]);

      if (cancelled) {
        return;
      }

      if (!doctorResult.success) {
        setError(doctorResult.error || 'Nu am putut încărca medicul.');
        setLoading(false);
        return;
      }

      setDoctor(doctorResult.data);
      setFormData({
        fullName: doctorResult.data.fullName,
        professionalGrade: doctorResult.data.professionalGrade,
        phone: doctorResult.data.phone || '',
        email: doctorResult.data.email || '',
        cuim: doctorResult.data.cuim || '',
        specialty: doctorResult.data.specialty || '',
        notes: doctorResult.data.notes || '',
        status: doctorResult.data.status,
      });

      if (auditResult.success) {
        setAuditLogs(auditResult.data || []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');

    const result = await updateDoctor(doctorId, formData);
    if (!result.success) {
      setError(result.error || 'Nu am putut salva modificările.');
      setIsSaving(false);
      return;
    }

    setDoctor(result.data);
    setIsEditing(false);
    setMessage('Datele medicului au fost actualizate.');
    await loadDoctor();
    setIsSaving(false);
  };

  const handleArchiveToggle = async () => {
    if (!doctor) {
      return;
    }

    const result = await archiveDoctor(doctorId, doctor.status !== 'archived');
    if (!result.success) {
      setError(result.error || 'Nu am putut actualiza statusul.');
      return;
    }

    setDoctor(result.data);
    setMessage(result.data.status === 'archived' ? 'Medicul a fost arhivat.' : 'Medicul a fost reactivat.');
    await loadDoctor();
  };

  const handleDelete = async () => {
    if (!window.confirm('Sigur vrei să ștergi definitiv acest medic?')) {
      return;
    }

    const result = await deleteDoctor(doctorId);
    if (!result.success) {
      setError(result.error || 'Nu am putut șterge medicul.');
      return;
    }

    window.location.href = '/doctors';
  };

  const handleImageUpload = async (file?: File | null) => {
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setError('');
    setMessage('');

    const formData = new FormData();
    formData.set('file', file);

    const response = await fetch(`/doctors/${doctorId}/image`, {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || 'Imaginea nu a putut fi încărcată.');
      setIsUploadingImage(false);
      return;
    }

    setMessage('Imaginea medicului a fost actualizată.');
    await loadDoctor();
    setIsUploadingImage(false);
  };

  const handleImageRemove = async () => {
    setIsRemovingImage(true);
    setError('');
    setMessage('');

    const response = await fetch(`/doctors/${doctorId}/image`, {
      method: 'DELETE',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || 'Imaginea nu a putut fi eliminată.');
      setIsRemovingImage(false);
      return;
    }

    setMessage('Imaginea medicului a fost eliminată.');
    await loadDoctor();
    setIsRemovingImage(false);
  };

  const handleCopyPortalUrl = async () => {
    const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/m` : '/m';
    await navigator.clipboard.writeText(portalUrl);
    setMessage('Linkul portalului medicului a fost copiat.');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="py-20 text-center">
        <AlertCircle className="mx-auto mb-4 text-error/40" size={42} />
        <h2 className="text-xl font-black">Medicul nu a fost găsit.</h2>
      </div>
    );
  }

  const doctorCvUrl = doctor.$id
    ? buildDoctorAdminDocumentUrl(doctor.$id, 'cv', doctor.cvUploadedAt)
    : '';
  const doctorPracticeLicenseUrl = doctor.$id
    ? buildDoctorAdminDocumentUrl(doctor.$id, 'practice-license', doctor.practiceLicenseUploadedAt)
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/doctors" className="btn btn-ghost btn-sm gap-2">
          <ArrowLeft size={14} /> Înapoi la registru
        </Link>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm gap-2" onClick={handleArchiveToggle}>
            <Archive size={14} /> {doctor.status === 'archived' ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" className="btn btn-error btn-sm gap-2" onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error rounded-2xl text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="alert alert-success rounded-2xl text-sm">
          <AlertCircle size={16} />
          <span>{message}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-base-content">{doctor.fullName}</h1>
              <p className="mt-1 text-base text-base-content/70">{doctor.professionalGrade}</p>
              <span className={`badge mt-3 ${doctor.status === 'active' ? 'badge-success' : doctor.status === 'inactive' ? 'badge-warning' : 'badge-neutral'}`}>
                {doctor.status}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm gap-2"
              onClick={() => setIsEditing((current) => !current)}
            >
              <Save size={14} /> {isEditing ? 'Close edit' : 'Edit'}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="form-control">
              <span className="label"><span className="label-text font-semibold">Nume complet</span></span>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.fullName}
                disabled={!isEditing}
                onChange={(event) => setFormData((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>
            <label className="form-control">
              <span className="label"><span className="label-text font-semibold">Grad profesional/universitar</span></span>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.professionalGrade}
                disabled={!isEditing}
                onChange={(event) => setFormData((current) => ({ ...current, professionalGrade: event.target.value }))}
              />
            </label>
            <label className="form-control">
              <span className="label"><span className="label-text">Telefon</span></span>
              <input
                type="tel"
                className="input input-bordered w-full"
                value={formData.phone || ''}
                disabled={!isEditing}
                onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label className="form-control">
              <span className="label"><span className="label-text">Email</span></span>
              <input
                type="email"
                className="input input-bordered w-full"
                value={formData.email || ''}
                disabled={!isEditing}
                onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className="form-control">
              <span className="label"><span className="label-text">CUIM</span></span>
              <input
                type="text"
                className="input input-bordered w-full"
                value={formData.cuim || ''}
                disabled={!isEditing}
                onChange={(event) => setFormData((current) => ({ ...current, cuim: event.target.value }))}
              />
            </label>
            <label className="form-control">
              <span className="label"><span className="label-text">Specialitate</span></span>
              <SearchableSelect
                value={formData.specialty || ''}
                disabled={!isEditing}
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
                className="textarea textarea-bordered min-h-32 w-full"
                value={formData.notes || ''}
                disabled={!isEditing}
                onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>

          {isEditing && (
            <div className="mt-6 flex justify-end">
              <button type="button" className="btn btn-primary gap-2" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <span className="loading loading-spinner loading-xs" /> : <Save size={16} />}
                Salvează modificările
              </button>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-primary/10 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-base-content/70">Portal Medic</h3>
                <p className="mt-1 text-sm text-base-content/60">
                  Trimite acest link medicului. Accesul se face cu emailul sau telefonul deja configurat în registru.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline btn-sm gap-2" onClick={() => void handleCopyPortalUrl()}>
                  <Copy size={14} /> Copiază link
                </button>
                <Link href="/m" className="btn btn-primary btn-sm gap-2" target="_blank" rel="noreferrer">
                  <Link2 size={14} /> Deschide portalul
                </Link>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3 font-mono text-sm text-base-content/70">
              {typeof window !== 'undefined' ? `${window.location.origin}/m` : '/m'}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <h2 className="text-xl font-black text-base-content">Imagine profil</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Poți încărca, schimba sau elimina imaginea fără reimport.
            </p>

            <div className="mt-5 flex flex-col items-center gap-4 text-center">
              <DoctorAvatar doctor={doctor} size="lg" />
              <div className="w-full">
                <FileDropzone
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  title={doctor.profileImageFileId ? 'Click or drag a new doctor image here' : 'Click or drag a doctor image here'}
                  subtitle="Supports .jpg, .jpeg, .png, .webp"
                  hint="Imaginea este opțională și poate fi schimbată oricând."
                  disabled={isUploadingImage}
                  onFileSelected={(file) => handleImageUpload(file)}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm gap-2"
                  onClick={handleImageRemove}
                  disabled={!doctor.profileImageFileId || isRemovingImage}
                >
                  {isRemovingImage ? <span className="loading loading-spinner loading-xs" /> : <Camera size={14} />}
                  Remove image
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <h2 className="text-xl font-black text-base-content">Documente încărcate de medic</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Documentele sunt încărcate din portalul public al medicului și pot fi consultate aici în platformă.
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-base-300 bg-base-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold">
                      <FileBadge2 size={16} className="text-primary" />
                      Curriculum Vitae
                    </div>
                    <p className="mt-1 text-xs text-base-content/60">
                      {doctor.cvFileId
                        ? `Încărcat${doctor.cvUploadedAt ? ` la ${doctor.cvUploadedAt}` : ''}${doctor.cvFileName ? ` • ${doctor.cvFileName}` : ''}`
                        : 'Nu a fost încărcat.'}
                    </p>
                  </div>
                  <span className={`badge ${doctor.cvFileId ? 'badge-success' : 'badge-outline'}`}>
                    {doctor.cvFileId ? 'Disponibil' : 'Lipsește'}
                  </span>
                </div>

                {doctor.cvFileId ? (
                  <div className="mt-3">
                    <a
                      href={doctorCvUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline btn-sm gap-2"
                    >
                      <ExternalLink size={14} /> Vezi CV
                    </a>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-base-300 bg-base-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold">
                      <FileBadge2 size={16} className="text-primary" />
                      Drept de liberă practică
                    </div>
                    <p className="mt-1 text-xs text-base-content/60">
                      {doctor.practiceLicenseFileId
                        ? `Încărcat${doctor.practiceLicenseUploadedAt ? ` la ${doctor.practiceLicenseUploadedAt}` : ''}${doctor.practiceLicenseFileName ? ` • ${doctor.practiceLicenseFileName}` : ''}`
                        : 'Nu a fost încărcat.'}
                    </p>
                  </div>
                  <span className={`badge ${doctor.practiceLicenseFileId ? 'badge-success' : 'badge-outline'}`}>
                    {doctor.practiceLicenseFileId ? 'Disponibil' : 'Lipsește'}
                  </span>
                </div>

                {doctor.practiceLicenseFileId ? (
                  <div className="mt-3">
                    <a
                      href={doctorPracticeLicenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline btn-sm gap-2"
                    >
                      <ExternalLink size={14} /> Vezi DLP
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <h2 className="text-xl font-black text-base-content">Audit trail</h2>
            <div className="mt-4 space-y-3">
              {auditLogs.length === 0 && (
                <p className="text-sm text-base-content/60">Nu există intrări de audit pentru acest medic.</p>
              )}
              {auditLogs.map((log) => (
                <div key={log.$id} className="rounded-2xl border border-base-300 bg-base-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-outline">{log.action}</span>
                    <span className="text-xs text-base-content/50">{log.$createdAt || '-'}</span>
                  </div>
                  <p className="mt-2 text-xs text-base-content/60">actor: {log.actorUserId}</p>
                  {log.beforeJson && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-base-content/70">before</summary>
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-base-200 p-3 text-[11px]">{log.beforeJson}</pre>
                    </details>
                  )}
                  {log.afterJson && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-base-content/70">after</summary>
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-base-200 p-3 text-[11px]">{log.afterJson}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
