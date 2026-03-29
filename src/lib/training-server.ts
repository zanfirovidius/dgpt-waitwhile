import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { createAdminClient } from '@/lib/appwrite-server';
import { normalizeName } from '@/lib/name-utils';
import {
  DEFAULT_TRAINING_TOPICS,
  DEFAULT_TRAINING_TYPES,
  TRAINING_CONFIRMATION_TEXT,
} from '@/lib/training-defaults';
import type {
  TrainingAttendanceEntry,
  TrainingOrganizerSnapshot,
  TrainingReportContext,
  TrainingSession,
} from '@/lib/training-types';

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type DatabasesClient = AdminClient['databases'];
type StorageClient = AdminClient['storage'];

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const FEEDBACK_CONFIG_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

export const TRAINING_SESSIONS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_SESSIONS_COLLECTION_ID || 'training_sessions';
export const TRAINING_ATTENDANCE_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_ATTENDANCE_COLLECTION_ID || 'training_attendance';
export const TRAINING_SIGNATURES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_SIGNATURES_BUCKET_ID || 'training_signatures';
export const TRAINING_ARCHIVES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_ARCHIVES_BUCKET_ID || 'training_archives';

export { DEFAULT_TRAINING_TOPICS, DEFAULT_TRAINING_TYPES, TRAINING_CONFIRMATION_TEXT };

type ProjectSnapshot = {
  $id: string;
  name?: string;
  eventName?: string;
  projectSlug?: string;
  locationName?: string;
  city?: string;
  venue?: string;
};

type FeedbackSnapshot = TrainingOrganizerSnapshot;

const SESSION_ATTRIBUTES = [
  { key: 'projectId', type: 'string', size: 128 },
  { key: 'projectSlugSnapshot', type: 'string', size: 128 },
  { key: 'eventName', type: 'string', size: 255 },
  { key: 'location', type: 'string', size: 255 },
  { key: 'trainingDate', type: 'string', size: 32 },
  { key: 'instructorName', type: 'string', size: 255 },
  { key: 'instructorUserId', type: 'string', size: 128 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'trainingTypes', type: 'string-array', size: 32 },
  { key: 'topics', type: 'string', size: 4000 },
  { key: 'accessToken', type: 'string', size: 128 },
  { key: 'instructorSignatureImageId', type: 'string', size: 128 },
  { key: 'archivedPdfFileId', type: 'string', size: 128 },
  { key: 'archivedFileName', type: 'string', size: 255 },
  { key: 'archivedAt', type: 'string', size: 64 },
  { key: 'finalizedAt', type: 'string', size: 64 },
  { key: 'finalizedByUserId', type: 'string', size: 128 },
] as const;

const ATTENDANCE_ATTRIBUTES = [
  { key: 'sessionId', type: 'string', size: 128 },
  { key: 'projectId', type: 'string', size: 128 },
  { key: 'volunteerId', type: 'string', size: 128 },
  { key: 'volunteerName', type: 'string', size: 255 },
  { key: 'volunteerNameNormalized', type: 'string', size: 255 },
  { key: 'cnp', type: 'string', size: 32 },
  { key: 'identitySeries', type: 'string', size: 16 },
  { key: 'identityNumber', type: 'string', size: 32 },
  { key: 'signatureImageId', type: 'string', size: 128 },
  { key: 'signedAt', type: 'string', size: 64 },
  { key: 'confirmedParticipation', type: 'boolean', default: false },
  { key: 'source', type: 'string', size: 32 },
] as const;

const SESSION_INDEXES = [
  {
    collectionId: TRAINING_SESSIONS_COLLECTION_ID,
    key: 'idx_tr_s_proj_date',
    type: 'key',
    attributes: ['projectId', 'trainingDate'],
    orders: ['asc', 'desc'],
  },
  {
    collectionId: TRAINING_SESSIONS_COLLECTION_ID,
    key: 'idx_tr_s_proj_slug',
    type: 'key',
    attributes: ['projectSlugSnapshot'],
    orders: ['asc'],
  },
] as const;

const ATTENDANCE_INDEXES = [
  {
    collectionId: TRAINING_ATTENDANCE_COLLECTION_ID,
    key: 'idx_tr_a_name',
    type: 'key',
    attributes: ['sessionId', 'volunteerNameNormalized'],
    orders: ['asc', 'asc'],
  },
  {
    collectionId: TRAINING_ATTENDANCE_COLLECTION_ID,
    key: 'idx_tr_a_signed',
    type: 'key',
    attributes: ['sessionId', 'signedAt'],
    orders: ['asc', 'desc'],
  },
  {
    collectionId: TRAINING_ATTENDANCE_COLLECTION_ID,
    key: 'idx_tr_a_volunteer',
    type: 'key',
    attributes: ['volunteerId'],
    orders: ['asc'],
  },
] as const;

export async function ensureTrainingSchema(databases: DatabasesClient) {
  await ensureCollection(databases, TRAINING_SESSIONS_COLLECTION_ID, 'Training Sessions', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureCollection(databases, TRAINING_ATTENDANCE_COLLECTION_ID, 'Training Attendance', [
    Permission.create(Role.any()),
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureAttributes(databases, TRAINING_SESSIONS_COLLECTION_ID, SESSION_ATTRIBUTES);
  await ensureAttributes(databases, TRAINING_ATTENDANCE_COLLECTION_ID, ATTENDANCE_ATTRIBUTES);

  for (const index of [...SESSION_INDEXES, ...ATTENDANCE_INDEXES]) {
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
        index.collectionId,
        index.key,
        index.type,
        [...index.attributes],
        [...index.orders],
      );
    } catch (err: unknown) {
      if (getErrorCode(err) !== 409) {
        throw err;
      }
    }
  }
}

export async function ensureTrainingBuckets(storage: StorageClient) {
  await ensureBucket(storage, TRAINING_SIGNATURES_BUCKET_ID, 'Training Signatures', ['png', 'jpg', 'jpeg', 'webp']);
  await ensureBucket(storage, TRAINING_ARCHIVES_BUCKET_ID, 'Training Archives', ['pdf']);
}

export async function saveTrainingSignature(
  storage: StorageClient,
  signatureDataUrl: string,
  fileNamePrefix: string,
) {
  const { file, extension } = createInputFileFromDataUrl(signatureDataUrl, fileNamePrefix);
  const uploaded = await storage.createFile(
    TRAINING_SIGNATURES_BUCKET_ID,
    ID.unique(),
    file,
  );

  return {
    fileId: uploaded.$id,
    extension,
  };
}

export async function saveTrainingArchivePdf(
  storage: StorageClient,
  pdfBuffer: Buffer,
  fileName: string,
) {
  const file = InputFile.fromBuffer(pdfBuffer, fileName);
  const uploaded = await storage.createFile(TRAINING_ARCHIVES_BUCKET_ID, ID.unique(), file);
  return uploaded.$id;
}

export async function getTrainingSignatureDataUrl(storage: StorageClient, fileId?: string | null) {
  if (!fileId) {
    return null;
  }

  const file = await storage.getFile(TRAINING_SIGNATURES_BUCKET_ID, fileId);
  const fileView = await storage.getFileView(TRAINING_SIGNATURES_BUCKET_ID, fileId);
  const buffer = await toBuffer(fileView);

  return `data:${file.mimeType || 'image/png'};base64,${buffer.toString('base64')}`;
}

export async function loadTrainingReportContext(sessionId: string): Promise<TrainingReportContext> {
  const { databases, storage } = await createAdminClient();
  const sessionDoc = await databases.getDocument(
    DATABASE_ID,
    TRAINING_SESSIONS_COLLECTION_ID,
    sessionId,
  );
  const session = JSON.parse(JSON.stringify(sessionDoc)) as TrainingSession;
  const project = await readProjectSnapshot(databases, session.projectId);
  const organizer = await readOrganizerSnapshot(databases, session.projectId);
  const entries = await listTrainingEntries(databases, sessionId);

  const entriesWithSignatures = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      signatureDataUrl: await getTrainingSignatureDataUrl(storage, entry.signatureImageId),
    })),
  );

  const instructorSignatureDataUrl = await getTrainingSignatureDataUrl(
    storage,
    session.instructorSignatureImageId,
  );

  return {
    session,
    projectName: project.eventName || project.name || session.eventName,
    projectSlug: project.projectSlug || session.projectSlugSnapshot || '',
    organizer,
    entries: entriesWithSignatures,
    instructorSignatureDataUrl,
  };
}

export async function listTrainingEntries(
  databases: DatabasesClient,
  sessionId: string,
) {
  const res = await databases.listDocuments(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, [
    Query.equal('sessionId', sessionId),
    Query.orderAsc('volunteerNameNormalized'),
    Query.orderAsc('$createdAt'),
    Query.limit(500),
  ]);

  return JSON.parse(JSON.stringify(res.documents)) as TrainingAttendanceEntry[];
}

export async function readProjectSnapshot(
  databases: DatabasesClient,
  projectId: string,
) {
  const project = await databases.getDocument(
    DATABASE_ID,
    PROJECTS_COLLECTION_ID,
    projectId,
  );

  return JSON.parse(JSON.stringify(project)) as ProjectSnapshot;
}

export async function readOrganizerSnapshot(
  databases: DatabasesClient,
  projectId: string,
): Promise<FeedbackSnapshot> {
  try {
    const feedbackConfig = await databases.getDocument(
      DATABASE_ID,
      FEEDBACK_CONFIG_COLLECTION_ID,
      projectId,
    );

    return JSON.parse(JSON.stringify(feedbackConfig)) as FeedbackSnapshot;
  } catch (err: unknown) {
    if (getErrorCode(err) === 404) {
      return {};
    }

    throw err;
  }
}

export async function readTrainingSessionByPublicContext(
  databases: DatabasesClient,
  projectSlug: string,
  sessionId: string,
) {
  const sessionDoc = await databases.getDocument(
    DATABASE_ID,
    TRAINING_SESSIONS_COLLECTION_ID,
    sessionId,
  );
  const session = JSON.parse(JSON.stringify(sessionDoc)) as TrainingSession;

  if (session.projectSlugSnapshot && session.projectSlugSnapshot !== projectSlug) {
    throw new Error('Sesiunea nu aparține proiectului solicitat.');
  }

  const projectRes = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
    Query.equal('projectSlug', projectSlug),
    Query.limit(1),
  ]);

  if (projectRes.total === 0) {
    throw new Error('Proiectul nu a fost găsit.');
  }

  const project = JSON.parse(JSON.stringify(projectRes.documents[0])) as ProjectSnapshot;

  if (project.$id !== session.projectId) {
    throw new Error('Contextul public al sesiunii este invalid.');
  }

  return { project, session };
}

export async function resolveVolunteerIdByName(
  databases: DatabasesClient,
  projectId: string,
  volunteerName: string,
) {
  const normalizedName = normalizeName(volunteerName);
  if (!normalizedName) {
    return undefined;
  }

  try {
    const res = await databases.listDocuments(DATABASE_ID, 'project_volunteers', [
      Query.equal('projectId', projectId),
      Query.equal('fullNameNormalized', normalizedName),
      Query.limit(1),
    ]);

    return res.total > 0 ? res.documents[0].$id : undefined;
  } catch (err) {
    console.warn('[Training] resolveVolunteerIdByName warning:', err);
    return undefined;
  }
}

export function normalizeTrainingTypes(value?: string[] | null) {
  const normalized = (value || [])
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_TRAINING_TYPES];
}

export function normalizeTrainingTopics(value?: string | null) {
  return value?.trim() || DEFAULT_TRAINING_TOPICS;
}

export function sanitizeTrainingCnp(value?: string | null) {
  return (value || '').replace(/\s+/g, '').trim();
}

export function sanitizeIdentitySeries(value?: string | null) {
  return (value || '').replace(/\s+/g, '').trim().toUpperCase();
}

export function sanitizeIdentityNumber(value?: string | null) {
  return (value || '').replace(/\s+/g, '').trim().toUpperCase();
}

export function buildTrainingArchiveFileName(location: string, trainingDate: string) {
  const locationSegment = sanitizeFileNameSegment(location || 'locatie');
  const dateSegment = sanitizeFileNameSegment(trainingDate || new Date().toISOString().slice(0, 10));
  return `DGPAT_DOC-SSM-016_Instructaj-SSM_${locationSegment}_${dateSegment}_FINAL.pdf`;
}

export function generateAccessToken() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function deleteFileIfExists(
  storage: StorageClient,
  bucketId: string,
  fileId?: string | null,
) {
  if (!fileId) {
    return;
  }

  try {
    await storage.deleteFile(bucketId, fileId);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 404) {
      throw err;
    }
  }
}

function sanitizeFileNameSegment(value: string) {
  const normalized = normalizeName(value).replace(/\s+/g, '-');
  return normalized || 'document';
}

async function ensureCollection(
  databases: DatabasesClient,
  collectionId: string,
  name: string,
  permissions: string[],
) {
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 404) {
      throw err;
    }

    await databases.createCollection(DATABASE_ID, collectionId, name, permissions);
  }
}

async function ensureAttributes(
  databases: DatabasesClient,
  collectionId: string,
  attributes: readonly {
    key: string;
    type: 'string' | 'boolean' | 'string-array';
    size?: number;
    default?: boolean;
  }[],
) {
  const list = await databases.listAttributes(DATABASE_ID, collectionId);
  const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
  const createdKeys: string[] = [];

  for (const attribute of attributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    if (attribute.type === 'string') {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attribute.key,
        attribute.size || 255,
        false,
      );
    } else if (attribute.type === 'string-array') {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attribute.key,
        attribute.size || 255,
        false,
        undefined,
        true,
      );
    } else if (attribute.type === 'boolean') {
      await databases.createBooleanAttribute(
        DATABASE_ID,
        collectionId,
        attribute.key,
        false,
        attribute.default ?? false,
      );
    }

    createdKeys.push(attribute.key);
  }

  for (const key of createdKeys) {
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
      throw new Error(`Training attribute "${collectionId}.${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Training attribute "${collectionId}.${key}" is still processing.`);
}

async function ensureBucket(
  storage: StorageClient,
  bucketId: string,
  name: string,
  allowedFileExtensions: string[],
) {
  try {
    await storage.getBucket(bucketId);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 404) {
      throw err;
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

function createInputFileFromDataUrl(signatureDataUrl: string, fileNamePrefix: string) {
  const match = signatureDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Semnătura are un format invalid.');
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  const extension = mimeType.split('/')[1] || 'png';
  const buffer = Buffer.from(base64Payload, 'base64');

  return {
    extension,
    file: InputFile.fromBuffer(buffer, `${fileNamePrefix}.${extension}`),
  };
}

async function toBuffer(value: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function'
  ) {
    const arrayBuffer = await value.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('Nu am putut converti fișierul din Appwrite în buffer.');
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return undefined;
}
