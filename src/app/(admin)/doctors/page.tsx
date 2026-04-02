'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Copy,
  Download,
  Eye,
  FileBadge2,
  Filter,
  ImagePlus,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { archiveDoctor, deleteDoctor, getDoctorsRegistry } from '@/app/actions/doctors';
import type { DoctorRecord } from '@/lib/doctor-types';
import { DoctorAvatar } from '@/components/doctors/DoctorAvatar';
import { DoctorModal } from '@/components/doctors/DoctorModal';

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [imageFilter, setImageFilter] = useState('all');
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<DoctorRecord | null>(null);
  const [shareMessage, setShareMessage] = useState('');

  const loadDoctors = async () => {
    setLoading(true);
    setError('');

    const result = await getDoctorsRegistry();
    if (!result.success) {
      setError(result.error || 'Nu am putut încărca registrul medicilor.');
      setLoading(false);
      return;
    }

    setDoctors(result.data);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getDoctorsRegistry();
      if (cancelled) {
        return;
      }

      if (!result.success) {
        setError(result.error || 'Nu am putut încărca registrul medicilor.');
        setLoading(false);
        return;
      }

      setDoctors(result.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDoctors = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return doctors.filter((doctor) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          doctor.fullName,
          doctor.professionalGrade,
          doctor.phone,
          doctor.email,
          doctor.cuim,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      const matchesStatus = statusFilter === 'all' || doctor.status === statusFilter;
      const matchesGrade = gradeFilter === 'all' || doctor.professionalGrade === gradeFilter;
      const matchesImage =
        imageFilter === 'all' ||
        (imageFilter === 'has_image' ? Boolean(doctor.profileImageFileId) : !doctor.profileImageFileId);

      return matchesSearch && matchesStatus && matchesGrade && matchesImage;
    });
  }, [doctors, gradeFilter, imageFilter, searchQuery, statusFilter]);

  const grades = useMemo(
    () => Array.from(new Set(doctors.map((doctor) => doctor.professionalGrade).filter(Boolean))).sort(),
    [doctors],
  );

  const handleDelete = async (doctorId: string) => {
    if (!window.confirm('Sigur vrei să ștergi definitiv acest medic din registru?')) {
      return;
    }

    const result = await deleteDoctor(doctorId);
    if (!result.success) {
      alert(result.error);
      return;
    }

    await loadDoctors();
  };

  const handleArchiveToggle = async (doctor: DoctorRecord) => {
    const result = await archiveDoctor(doctor.$id || '', doctor.status !== 'archived');
    if (!result.success) {
      alert(result.error);
      return;
    }

    await loadDoctors();
  };

  const handleCopyPortalUrl = async () => {
    const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/m` : '/m';
    await navigator.clipboard.writeText(portalUrl);
    setShareMessage('Linkul portalului medicului a fost copiat.');
    window.setTimeout(() => setShareMessage(''), 2500);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black text-base-content">
            <UserRound className="text-primary" size={28} />
            Registru Medici
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Registru master la nivel de platformă pentru medici, import și viitoare legături cu proiecte.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/doctors/template" className="btn btn-outline btn-sm gap-2">
            <Download size={14} /> Download import template
          </Link>
          <Link href="/doctors/import" className="btn btn-outline btn-sm gap-2">
            <Upload size={14} /> Import doctors
          </Link>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2"
            onClick={() => {
              setEditingDoctor(null);
              setIsDoctorModalOpen(true);
            }}
          >
            <Plus size={14} /> Add doctor
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error rounded-2xl text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {shareMessage && (
        <div className="alert alert-success rounded-2xl text-sm">
          <Link2 size={16} />
          <span>{shareMessage}</span>
        </div>
      )}

      <div className="rounded-[2rem] border border-base-300 bg-base-100 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
          <div>
            <div className="text-sm font-bold text-base-content">URL portal medic</div>
            <div className="text-xs text-base-content/60">
              Același link poate fi trimis oricărui medic înregistrat. Autentificarea se face cu email sau telefon.
            </div>
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

        <div className="grid gap-3 lg:grid-cols-[2fr,1fr,1fr,1fr]">
          <label className="input input-bordered flex items-center gap-2 rounded-xl">
            <Search size={16} className="text-base-content/50" />
            <input
              type="text"
              className="grow"
              placeholder="Caută după nume, CUIM, email sau telefon"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <label className="select select-bordered rounded-xl flex items-center gap-2 px-3">
            <Filter size={16} className="text-base-content/50" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="grow bg-transparent outline-none">
              <option value="all">Toate statusurile</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Arhivate</option>
            </select>
          </label>

          <label className="select select-bordered rounded-xl">
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="w-full bg-transparent outline-none">
              <option value="all">Toate gradele</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
          </label>

          <label className="select select-bordered rounded-xl">
            <select value={imageFilter} onChange={(event) => setImageFilter(event.target.value)} className="w-full bg-transparent outline-none">
              <option value="all">Toate imaginile</option>
              <option value="has_image">Are imagine</option>
              <option value="no_image">Fără imagine</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-base-300 bg-base-100 shadow-sm">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Nume</th>
                <th>Grad</th>
                <th>Telefon</th>
                <th>Email</th>
                <th>CUIM</th>
                <th>Documente</th>
                <th>Status</th>
                <th className="text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoctors.map((doctor) => (
                <tr key={doctor.$id}>
                  <td><DoctorAvatar doctor={doctor} size="sm" /></td>
                  <td>
                    <div className="font-bold">{doctor.fullName}</div>
                    <div className="text-xs text-base-content/50">{doctor.specialty || 'Fără specialitate'}</div>
                  </td>
                  <td>{doctor.professionalGrade}</td>
                  <td>{doctor.phone || '-'}</td>
                  <td>{doctor.email || '-'}</td>
                  <td>{doctor.cuim || '-'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`badge badge-sm gap-1 ${doctor.cvFileId ? 'badge-success' : 'badge-outline'}`}>
                        <FileBadge2 size={10} /> CV
                      </span>
                      <span className={`badge badge-sm gap-1 ${doctor.practiceLicenseFileId ? 'badge-success' : 'badge-outline'}`}>
                        <FileBadge2 size={10} /> DLP
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${doctor.status === 'active' ? 'badge-success' : doctor.status === 'inactive' ? 'badge-warning' : 'badge-neutral'}`}>
                      {doctor.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Link href={`/doctors/${doctor.$id}`} className="btn btn-ghost btn-xs gap-1">
                        <Eye size={12} /> View
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs gap-1"
                        onClick={() => {
                          setEditingDoctor(doctor);
                          setIsDoctorModalOpen(true);
                        }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <Link href={`/doctors/${doctor.$id}`} className="btn btn-ghost btn-xs gap-1">
                        <ImagePlus size={12} /> Image
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs gap-1"
                        onClick={() => handleArchiveToggle(doctor)}
                      >
                        <Archive size={12} /> {doctor.status === 'archived' ? 'Unarchive' : 'Archive'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs gap-1 text-error"
                        onClick={() => handleDelete(doctor.$id || '')}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDoctors.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="py-10 text-center text-sm text-base-content/60">
                      Nu există medici care să corespundă filtrelor curente.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DoctorModal
        key={editingDoctor?.$id || 'new-doctor'}
        isOpen={isDoctorModalOpen}
        doctor={editingDoctor}
        onClose={() => setIsDoctorModalOpen(false)}
        onSaved={() => void loadDoctors()}
      />
    </div>
  );
}
