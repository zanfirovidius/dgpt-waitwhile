import { normalizeName } from '@/lib/name-utils';
import type {
  DoctorFormInput,
  DoctorRecord,
  DoctorResolutionAction,
} from '@/lib/doctor-types';

export const DOCTOR_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const DOCTOR_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const DOCTOR_DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const DOCTOR_DOCUMENT_ALLOWED_MIME_TYPES = ['application/pdf'] as const;

export function sanitizeDoctorText(value?: string | null, maxLength = 255) {
  const sanitized = (value || '').replace(/\s+/g, ' ').trim();
  return sanitized ? sanitized.slice(0, maxLength) : '';
}

export function sanitizeDoctorLongText(value?: string | null, maxLength = 2000) {
  const sanitized = (value || '').replace(/\r\n/g, '\n').trim();
  return sanitized ? sanitized.slice(0, maxLength) : '';
}

export function normalizeDoctorEmail(value?: string | null) {
  return sanitizeDoctorText(value, 160).toLowerCase();
}

export function normalizeDoctorPhone(value?: string | null) {
  const digits = (value || '').replace(/\D+/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    return `40${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `40${digits}`;
  }

  return digits;
}

export function normalizeDoctorCuim(value?: string | null) {
  return sanitizeDoctorText(value, 64).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function normalizeDoctorFullName(value?: string | null) {
  return normalizeName(sanitizeDoctorText(value, 255));
}

export function sanitizeDoctorFormInput(input: DoctorFormInput): DoctorFormInput {
  return {
    fullName: sanitizeDoctorText(input.fullName, 255),
    professionalGrade: sanitizeDoctorText(input.professionalGrade, 160),
    phone: sanitizeDoctorText(input.phone, 64),
    email: sanitizeDoctorText(input.email, 160),
    cuim: sanitizeDoctorText(input.cuim, 64),
    specialty: sanitizeDoctorText(input.specialty, 160),
    notes: sanitizeDoctorLongText(input.notes, 2000),
    status: normalizeDoctorStatus(input.status),
  };
}

export function normalizeDoctorStatus(value?: string | null) {
  if (value === 'inactive' || value === 'archived') {
    return value;
  }

  return 'active';
}

export function buildDoctorImageUrl(doctorId: string, uploadedAt?: string | null) {
  const cacheBuster = uploadedAt ? `?v=${encodeURIComponent(uploadedAt)}` : '';
  return `/doctors/${doctorId}/image${cacheBuster}`;
}

export function buildDoctorPortalDocumentUrl(
  kind: 'cv' | 'practice-license',
  uploadedAt?: string | null,
) {
  const cacheBuster = uploadedAt ? `?v=${encodeURIComponent(uploadedAt)}` : '';
  return `/api/doctor-portal/documents/${kind}${cacheBuster}`;
}

export function buildDoctorAdminDocumentUrl(
  doctorId: string,
  kind: 'cv' | 'practice-license',
  uploadedAt?: string | null,
) {
  const params = new URLSearchParams();
  params.set('doctorId', doctorId);

  if (uploadedAt) {
    params.set('v', uploadedAt);
  }

  return `/api/doctor-portal/documents/${kind}?${params.toString()}`;
}

export function buildDoctorNormalizedFields(input: DoctorFormInput) {
  return {
    fullNameNormalized: normalizeDoctorFullName(input.fullName),
    emailNormalized: normalizeDoctorEmail(input.email),
    phoneNormalized: normalizeDoctorPhone(input.phone),
    cuimNormalized: normalizeDoctorCuim(input.cuim),
  };
}

export function validateDoctorFormInput(input: DoctorFormInput) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!sanitizeDoctorText(input.fullName, 255)) {
    errors.push('Numele complet este obligatoriu.');
  }

  if (!sanitizeDoctorText(input.professionalGrade, 160)) {
    errors.push('Gradul profesional/universitar este obligatoriu.');
  }

  const normalizedEmail = normalizeDoctorEmail(input.email);
  if (input.email && normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.push('Email invalid.');
  }

  const normalizedPhone = normalizeDoctorPhone(input.phone);
  if (input.phone && !normalizedPhone) {
    errors.push('Telefon invalid.');
  }

  if (!normalizeDoctorCuim(input.cuim)) {
    warnings.push('CUIM lipsește.');
  }

  if (!normalizedEmail) {
    warnings.push('Email lipsește.');
  }

  if (!normalizedPhone) {
    warnings.push('Telefon lipsește.');
  }

  return { errors, warnings };
}

export function validateDoctorDocumentFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error('Selectează un PDF valid.');
  }

  if (file.size > DOCTOR_DOCUMENT_MAX_SIZE_BYTES) {
    throw new Error('Fișierul este prea mare. Maxim 10 MB.');
  }

  if (!DOCTOR_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof DOCTOR_DOCUMENT_ALLOWED_MIME_TYPES)[number])) {
    throw new Error('Format invalid. Sunt acceptate doar fișiere PDF.');
  }
}

export function getDoctorInitials(doctor: Pick<DoctorRecord, 'fullName'>) {
  return doctor.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('') || 'DR';
}

export function serializeForAudit(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return undefined;
    }

    return serialized.length > 1500 ? `${serialized.slice(0, 1497)}...` : serialized;
  } catch {
    return undefined;
  }
}

export function mergeDoctorForUpdate(
  existing: DoctorRecord,
  incoming: DoctorFormInput,
  action: Exclude<DoctorResolutionAction, 'skip' | 'create_anyway'>,
) {
  const sanitizedIncoming = sanitizeDoctorFormInput(incoming);

  if (action === 'overwrite_existing') {
    return {
      ...existing,
      ...sanitizedIncoming,
    };
  }

  return {
    ...existing,
    fullName: existing.fullName || sanitizedIncoming.fullName,
    professionalGrade: existing.professionalGrade || sanitizedIncoming.professionalGrade,
    phone: existing.phone || sanitizedIncoming.phone,
    email: existing.email || sanitizedIncoming.email,
    cuim: existing.cuim || sanitizedIncoming.cuim,
    specialty: existing.specialty || sanitizedIncoming.specialty,
    notes: existing.notes || sanitizedIncoming.notes,
    status: existing.status || sanitizedIncoming.status || 'active',
  };
}
