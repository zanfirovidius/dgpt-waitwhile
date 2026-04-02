import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { createAdminClient } from '@/lib/appwrite-server';
import type {
  DoctorAuditLog,
  DoctorDuplicateMatch,
  DoctorDuplicateReason,
  DoctorFormInput,
  DoctorRecord,
  DoctorResolutionAction,
} from '@/lib/doctor-types';
import {
  DOCTOR_DOCUMENT_ALLOWED_MIME_TYPES,
  DOCTOR_IMAGE_ALLOWED_MIME_TYPES,
  buildDoctorImageUrl,
  buildDoctorNormalizedFields,
  mergeDoctorForUpdate,
  normalizeDoctorCuim,
  normalizeDoctorEmail,
  normalizeDoctorFullName,
  normalizeDoctorPhone,
  sanitizeDoctorFormInput,
  serializeForAudit,
} from '@/lib/doctor-utils';

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type DatabasesClient = AdminClient['databases'];
type StorageClient = AdminClient['storage'];

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const AUDIT_LOGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_AUDIT_LOGS_COLLECTION_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

export const DOCTORS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTORS_COLLECTION_ID || 'platform_doctors';
export const DOCTOR_IMAGES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTOR_IMAGES_BUCKET_ID || 'doctor_images';
export const DOCTOR_DOCUMENTS_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTOR_DOCUMENTS_BUCKET_ID || 'doctor_documents';
export const DOCTOR_PORTAL_TOKENS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTOR_PORTAL_TOKENS_COLLECTION_ID || 'doctor_portal_tokens';

const DOCTOR_ATTRIBUTES = [
  { key: 'fullName', type: 'string', size: 255 },
  { key: 'professionalGrade', type: 'string', size: 160 },
  { key: 'phone', type: 'string', size: 64 },
  { key: 'email', type: 'string', size: 160 },
  { key: 'cuim', type: 'string', size: 64 },
  { key: 'specialty', type: 'string', size: 160 },
  { key: 'notes', type: 'string', size: 2000 },
  { key: 'status', type: 'string', size: 16, default: 'active' },
  { key: 'profileImageFileId', type: 'string', size: 128 },
  { key: 'profileImageUrl', type: 'string', size: 255 },
  { key: 'profileImageUploadedAt', type: 'string', size: 64 },
  { key: 'cvFileId', type: 'string', size: 128 },
  { key: 'cvFileName', type: 'string', size: 255 },
  { key: 'cvUploadedAt', type: 'string', size: 64 },
  { key: 'practiceLicenseFileId', type: 'string', size: 128 },
  { key: 'practiceLicenseFileName', type: 'string', size: 255 },
  { key: 'practiceLicenseUploadedAt', type: 'string', size: 64 },
  { key: 'createdAt', type: 'string', size: 64 },
  { key: 'updatedAt', type: 'string', size: 64 },
  { key: 'createdByUserId', type: 'string', size: 128 },
  { key: 'updatedByUserId', type: 'string', size: 128 },
  { key: 'fullNameNormalized', type: 'string', size: 255 },
  { key: 'emailNormalized', type: 'string', size: 160 },
  { key: 'phoneNormalized', type: 'string', size: 64 },
  { key: 'cuimNormalized', type: 'string', size: 64 },
] as const;

const AUDIT_LOG_ATTRIBUTES = [
  { key: 'entityType', type: 'string', size: 64 },
  { key: 'entityId', type: 'string', size: 50 },
  { key: 'action', type: 'string', size: 64 },
  { key: 'actorUserId', type: 'string', size: 50 },
  { key: 'beforeJson', type: 'string', size: 1500 },
  { key: 'afterJson', type: 'string', size: 1500 },
] as const;

const DOCTOR_PORTAL_TOKEN_ATTRIBUTES = [
  { key: 'doctorId', type: 'string', size: 128 },
  { key: 'channel', type: 'string', size: 16 },
  { key: 'identifier', type: 'string', size: 191 },
  { key: 'tokenHash', type: 'string', size: 128 },
  { key: 'expiresAt', type: 'string', size: 64 },
  { key: 'usedAt', type: 'string', size: 64 },
  { key: 'createdAt', type: 'string', size: 64 },
] as const;

const DOCTOR_INDEXES = [
  { key: 'idx_doc_cuim', attributes: ['cuimNormalized'], orders: ['asc'] },
  { key: 'idx_doc_email', attributes: ['emailNormalized'], orders: ['asc'] },
  { key: 'idx_doc_phone', attributes: ['phoneNormalized'], orders: ['asc'] },
  { key: 'idx_doc_name', attributes: ['fullNameNormalized'], orders: ['asc'] },
  { key: 'idx_doc_status', attributes: ['status'], orders: ['asc'] },
  { key: 'idx_doc_grade', attributes: ['professionalGrade'], orders: ['asc'] },
  { key: 'idx_doc_image', attributes: ['profileImageFileId'], orders: ['asc'] },
] as const;

const DOCTOR_PORTAL_INDEXES = [
  { key: 'idx_dpt_doc', attributes: ['doctorId', 'channel'], orders: ['asc', 'asc'] },
  { key: 'idx_dpt_id', attributes: ['identifier'], orders: ['asc'] },
  { key: 'idx_dpt_exp', attributes: ['expiresAt'], orders: ['asc'] },
] as const;

export async function ensureDoctorsSchema(databases: DatabasesClient) {
  await ensureCollection(databases, DOCTORS_COLLECTION_ID, 'Doctors Registry', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureCollection(databases, AUDIT_LOGS_COLLECTION_ID, 'Audit Logs', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureCollection(databases, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, 'Doctor Portal Tokens', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureAttributes(databases, DOCTORS_COLLECTION_ID, DOCTOR_ATTRIBUTES);
  await ensureAttributes(databases, AUDIT_LOGS_COLLECTION_ID, AUDIT_LOG_ATTRIBUTES);
  await ensureAttributes(databases, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, DOCTOR_PORTAL_TOKEN_ATTRIBUTES);

  for (const index of DOCTOR_INDEXES) {
    try {
      await (databases as unknown as {
        createIndex: (
          databaseId: string,
          collectionId: string,
          key: string,
          type: string,
          attributes: string[],
          orders: string[],
        ) => Promise<unknown>;
      }).createIndex(
        DATABASE_ID,
        DOCTORS_COLLECTION_ID,
        index.key,
        'key',
        [...index.attributes],
        [...index.orders],
      );
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }
  }

  for (const index of DOCTOR_PORTAL_INDEXES) {
    try {
      await (databases as unknown as {
        createIndex: (
          databaseId: string,
          collectionId: string,
          key: string,
          type: string,
          attributes: string[],
          orders: string[],
        ) => Promise<unknown>;
      }).createIndex(
        DATABASE_ID,
        DOCTOR_PORTAL_TOKENS_COLLECTION_ID,
        index.key,
        'key',
        [...index.attributes],
        [...index.orders],
      );
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }
  }
}

export async function ensureDoctorBuckets(storage: StorageClient) {
  await ensureBucket(storage, DOCTOR_IMAGES_BUCKET_ID, 'Doctor Images', ['jpg', 'jpeg', 'png', 'webp']);
  await ensureBucket(storage, DOCTOR_DOCUMENTS_BUCKET_ID, 'Doctor Documents', [...DOCTOR_DOCUMENT_ALLOWED_MIME_TYPES]);
}

export async function listDoctors(databases: DatabasesClient) {
  const res = await databases.listDocuments(DATABASE_ID, DOCTORS_COLLECTION_ID, [
    Query.orderAsc('fullNameNormalized'),
    Query.limit(1000),
  ]);

  return (JSON.parse(JSON.stringify(res.documents)) as DoctorRecord[]).map(hydrateDoctorRecord);
}

export async function getDoctor(databases: DatabasesClient, doctorId: string) {
  const doc = await databases.getDocument(DATABASE_ID, DOCTORS_COLLECTION_ID, doctorId);
  return hydrateDoctorRecord(JSON.parse(JSON.stringify(doc)) as DoctorRecord);
}

export async function listDoctorAuditLogs(databases: DatabasesClient, doctorId: string) {
  try {
    const res = await databases.listDocuments(DATABASE_ID, AUDIT_LOGS_COLLECTION_ID, [
      Query.equal('entityType', 'platform_doctor'),
      Query.equal('entityId', doctorId),
      Query.orderDesc('$createdAt'),
      Query.limit(200),
    ]);

    return JSON.parse(JSON.stringify(res.documents)) as DoctorAuditLog[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) {
      return [];
    }

    throw error;
  }
}

export async function createDoctorDocument(
  databases: DatabasesClient,
  input: DoctorFormInput,
  actorUserId: string,
) {
  const payload = buildDoctorDocumentPayload(input, actorUserId);
  const created = await databases.createDocument(DATABASE_ID, DOCTORS_COLLECTION_ID, ID.unique(), payload);
  return hydrateDoctorRecord(JSON.parse(JSON.stringify(created)) as DoctorRecord);
}

export async function updateDoctorDocument(
  databases: DatabasesClient,
  doctorId: string,
  input: DoctorFormInput,
  actorUserId: string,
) {
  const existing = await getDoctor(databases, doctorId);
  const payload = buildDoctorDocumentPayload(input, actorUserId, existing);
  const updated = await databases.updateDocument(DATABASE_ID, DOCTORS_COLLECTION_ID, doctorId, payload);
  return hydrateDoctorRecord(JSON.parse(JSON.stringify(updated)) as DoctorRecord);
}

export async function resolveDoctorDuplicate(
  databases: DatabasesClient,
  targetDoctorId: string,
  input: DoctorFormInput,
  actorUserId: string,
  action: Extract<DoctorResolutionAction, 'update_existing' | 'overwrite_existing'>,
) {
  const existing = await getDoctor(databases, targetDoctorId);
  const merged = mergeDoctorForUpdate(existing, input, action);
  const payload = buildDoctorDocumentPayload(merged, actorUserId, existing);
  const updated = await databases.updateDocument(DATABASE_ID, DOCTORS_COLLECTION_ID, targetDoctorId, payload);
  return {
    before: existing,
    after: hydrateDoctorRecord(JSON.parse(JSON.stringify(updated)) as DoctorRecord),
  };
}

export async function archiveDoctorDocument(
  databases: DatabasesClient,
  doctorId: string,
  actorUserId: string,
  archived: boolean,
) {
  const existing = await getDoctor(databases, doctorId);
  const updated = await databases.updateDocument(DATABASE_ID, DOCTORS_COLLECTION_ID, doctorId, {
    status: archived ? 'archived' : 'active',
    updatedAt: new Date().toISOString(),
    updatedByUserId: actorUserId,
  });

  return {
    before: existing,
    after: hydrateDoctorRecord(JSON.parse(JSON.stringify(updated)) as DoctorRecord),
  };
}

export async function deleteDoctorDocument(
  databases: DatabasesClient,
  doctorId: string,
) {
  const existing = await getDoctor(databases, doctorId);
  await databases.deleteDocument(DATABASE_ID, DOCTORS_COLLECTION_ID, doctorId);
  return existing;
}

export async function saveDoctorImage(
  storage: StorageClient,
  doctorId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
) {
  const extension = mimeType.split('/')[1] || 'jpg';
  const uploaded = await storage.createFile(
    DOCTOR_IMAGES_BUCKET_ID,
    ID.unique(),
    InputFile.fromBuffer(buffer, `${doctorId}.${extension}`),
  );

  return uploaded.$id;
}

export async function saveDoctorDocumentFile(
  storage: StorageClient,
  doctorId: string,
  kind: 'cv' | 'practice-license',
  fileName: string,
  buffer: Buffer,
) {
  const sanitizedName = fileName.trim() || `${doctorId}-${kind}.pdf`;
  const uploaded = await storage.createFile(
    DOCTOR_DOCUMENTS_BUCKET_ID,
    ID.unique(),
    InputFile.fromBuffer(buffer, sanitizedName.endsWith('.pdf') ? sanitizedName : `${sanitizedName}.pdf`),
  );

  return uploaded.$id;
}

export async function deleteDoctorImageFile(
  storage: StorageClient,
  fileId?: string | null,
) {
  if (!fileId) {
    return;
  }

  try {
    await storage.deleteFile(DOCTOR_IMAGES_BUCKET_ID, fileId);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }
  }
}

export async function deleteDoctorDocumentFile(
  storage: StorageClient,
  fileId?: string | null,
) {
  if (!fileId) {
    return;
  }

  try {
    await storage.deleteFile(DOCTOR_DOCUMENTS_BUCKET_ID, fileId);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }
  }
}

export async function writeDoctorAuditLog(data: {
  databases: DatabasesClient;
  entityId: string;
  action: string;
  actorUserId: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await data.databases.createDocument(DATABASE_ID, AUDIT_LOGS_COLLECTION_ID, ID.unique(), {
      entityType: 'platform_doctor',
      entityId: data.entityId,
      action: data.action,
      actorUserId: data.actorUserId,
      beforeJson: serializeForAudit(data.before),
      afterJson: serializeForAudit(data.after),
    });
  } catch (error) {
    console.warn('[Doctors] audit log warning:', error);
  }
}

export async function writeDoctorImportAuditLog(data: {
  databases: DatabasesClient;
  action: string;
  actorUserId: string;
  after?: unknown;
}) {
  try {
    await data.databases.createDocument(DATABASE_ID, AUDIT_LOGS_COLLECTION_ID, ID.unique(), {
      entityType: 'doctor_import',
      entityId: ID.unique(),
      action: data.action,
      actorUserId: data.actorUserId,
      afterJson: serializeForAudit(data.after),
    });
  } catch (error) {
    console.warn('[Doctors] import audit log warning:', error);
  }
}

export async function findDoctorDuplicateMatches(
  databases: DatabasesClient,
  input: DoctorFormInput,
  options: { excludeDoctorId?: string } = {},
) {
  const allDoctors = await listDoctors(databases);
  const sanitized = sanitizeDoctorFormInput(input);
  const candidateFullName = normalizeDoctorFullName(sanitized.fullName);
  const candidateEmail = normalizeDoctorEmail(sanitized.email);
  const candidatePhone = normalizeDoctorPhone(sanitized.phone);
  const candidateCuim = normalizeDoctorCuim(sanitized.cuim);

  const matches = allDoctors
    .filter((doctor) => doctor.$id !== options.excludeDoctorId)
    .map((doctor) => {
      const reasons: DoctorDuplicateReason[] = [];

      if (candidateCuim && doctor.cuimNormalized === candidateCuim) {
        reasons.push('cuim');
      }
      if (candidateEmail && doctor.emailNormalized === candidateEmail) {
        reasons.push('email');
      }
      if (candidatePhone && doctor.phoneNormalized === candidatePhone) {
        reasons.push('phone');
      }
      if (candidateFullName && doctor.fullNameNormalized === candidateFullName) {
        reasons.push('fullName');
      }

      if (reasons.length === 0) {
        return null;
      }

      return toDuplicateMatch(doctor, sanitized, reasons);
    })
    .filter(Boolean) as DoctorDuplicateMatch[];

  return matches.sort((left, right) => getMatchScore(right.matchReasons) - getMatchScore(left.matchReasons));
}

export function validateDoctorImageFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error('Selectează o imagine validă.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Imaginea este prea mare. Maxim 5 MB.');
  }

  if (!DOCTOR_IMAGE_ALLOWED_MIME_TYPES.includes(file.type as (typeof DOCTOR_IMAGE_ALLOWED_MIME_TYPES)[number])) {
    throw new Error('Format imagine invalid. Sunt acceptate doar JPG, PNG și WEBP.');
  }
}

function hydrateDoctorRecord(doctor: DoctorRecord) {
  if (doctor.$id && doctor.profileImageFileId && !doctor.profileImageUrl) {
    doctor.profileImageUrl = buildDoctorImageUrl(doctor.$id, doctor.profileImageUploadedAt);
  }

  return doctor;
}

function buildDoctorDocumentPayload(
  input: DoctorFormInput,
  actorUserId: string,
  existing?: DoctorRecord,
) {
  const sanitized = sanitizeDoctorFormInput(input);
  const normalized = buildDoctorNormalizedFields(sanitized);
  const now = new Date().toISOString();

  return {
    fullName: sanitized.fullName,
    professionalGrade: sanitized.professionalGrade,
    phone: sanitized.phone || '',
    email: sanitized.email || '',
    cuim: sanitized.cuim || '',
    specialty: sanitized.specialty || '',
    notes: sanitized.notes || '',
    status: sanitized.status || existing?.status || 'active',
    profileImageFileId: existing?.profileImageFileId || '',
    profileImageUrl: existing?.profileImageUrl || '',
    profileImageUploadedAt: existing?.profileImageUploadedAt || '',
    cvFileId: existing?.cvFileId || '',
    cvFileName: existing?.cvFileName || '',
    cvUploadedAt: existing?.cvUploadedAt || '',
    practiceLicenseFileId: existing?.practiceLicenseFileId || '',
    practiceLicenseFileName: existing?.practiceLicenseFileName || '',
    practiceLicenseUploadedAt: existing?.practiceLicenseUploadedAt || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId || actorUserId,
    updatedByUserId: actorUserId,
    ...normalized,
  };
}

function toDuplicateMatch(
  doctor: DoctorRecord,
  incoming: DoctorFormInput,
  reasons: DoctorDuplicateReason[],
): DoctorDuplicateMatch {
  const differingFields = [
    doctor.fullName !== incoming.fullName ? 'fullName' : '',
    doctor.professionalGrade !== incoming.professionalGrade ? 'professionalGrade' : '',
    (doctor.phone || '') !== (incoming.phone || '') ? 'phone' : '',
    (doctor.email || '') !== (incoming.email || '') ? 'email' : '',
    (doctor.cuim || '') !== (incoming.cuim || '') ? 'cuim' : '',
    (doctor.specialty || '') !== (incoming.specialty || '') ? 'specialty' : '',
    (doctor.notes || '') !== (incoming.notes || '') ? 'notes' : '',
  ].filter(Boolean);

  return {
    doctorId: doctor.$id || '',
    fullName: doctor.fullName,
    professionalGrade: doctor.professionalGrade,
    phone: doctor.phone,
    email: doctor.email,
    cuim: doctor.cuim,
    status: doctor.status,
    profileImageUrl: doctor.profileImageUrl,
    hasImage: Boolean(doctor.profileImageFileId),
    matchReasons: reasons,
    differingFields,
    recommendedAction: reasons.includes('cuim') || reasons.includes('email') ? 'update_existing' : 'skip',
  };
}

function getMatchScore(reasons: DoctorDuplicateReason[]) {
  return reasons.reduce((score, reason) => {
    switch (reason) {
      case 'cuim':
        return score + 100;
      case 'email':
        return score + 80;
      case 'phone':
        return score + 60;
      case 'fullName':
        return score + 40;
      default:
        return score;
    }
  }, 0);
}

async function ensureCollection(
  databases: DatabasesClient,
  collectionId: string,
  name: string,
  permissions: string[],
) {
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await databases.createCollection(DATABASE_ID, collectionId, name, permissions);
  }
}

async function ensureAttributes(
  databases: DatabasesClient,
  collectionId: string,
  attributes: readonly { key: string; type: 'string'; size: number; default?: string }[],
) {
  const list = await databases.listAttributes(DATABASE_ID, collectionId);
  const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
  const createdKeys: string[] = [];
  const updatedKeys: string[] = [];

  for (const attribute of attributes) {
    const current = existing.get(attribute.key);
    if (current) {
      if (
        current.type === 'string' &&
        'size' in current &&
        typeof current.size === 'number' &&
        current.size > attribute.size
      ) {
        await databases.updateStringAttribute({
          databaseId: DATABASE_ID,
          collectionId,
          key: attribute.key,
          required: false,
          size: attribute.size,
          xdefault: attribute.default ?? '',
        });
        updatedKeys.push(attribute.key);
      }

      continue;
    }

    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attribute.key,
        attribute.size,
        false,
        attribute.default,
      );
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }

    createdKeys.push(attribute.key);
  }

  for (const key of [...updatedKeys, ...createdKeys]) {
    await waitForAttributeAvailability(databases, collectionId, key);
  }
}

async function waitForAttributeAvailability(
  databases: DatabasesClient,
  collectionId: string,
  key: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const attribute = await databases.getAttribute(DATABASE_ID, collectionId, key);

    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Doctor attribute "${collectionId}.${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Doctor attribute "${collectionId}.${key}" is still processing.`);
}

async function ensureBucket(
  storage: StorageClient,
  bucketId: string,
  name: string,
  allowedFileExtensions: string[],
) {
  try {
    await storage.getBucket(bucketId);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await storage.createBucket(
      bucketId,
      name,
      [],
      false,
      true,
      10 * 1024 * 1024,
      allowedFileExtensions,
    );
  }
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return 0;
}
