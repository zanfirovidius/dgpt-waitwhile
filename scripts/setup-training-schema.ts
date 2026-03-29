import { Client, Databases, Permission, Role, Storage } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;
const API_KEY = process.env.APPWRITE_API_KEY!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

const TRAINING_SESSIONS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_SESSIONS_COLLECTION_ID || 'training_sessions';
const TRAINING_ATTENDANCE_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_ATTENDANCE_COLLECTION_ID || 'training_attendance';
const TRAINING_SIGNATURES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_SIGNATURES_BUCKET_ID || 'training_signatures';
const TRAINING_ARCHIVES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRAINING_ARCHIVES_BUCKET_ID || 'training_archives';

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

async function main() {
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const storage = new Storage(client);

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

  await ensureIndex(databases, TRAINING_SESSIONS_COLLECTION_ID, 'idx_tr_s_proj_date', ['projectId', 'trainingDate'], ['asc', 'desc']);
  await ensureIndex(databases, TRAINING_SESSIONS_COLLECTION_ID, 'idx_tr_s_proj_slug', ['projectSlugSnapshot'], ['asc']);
  await ensureIndex(databases, TRAINING_ATTENDANCE_COLLECTION_ID, 'idx_tr_a_name', ['sessionId', 'volunteerNameNormalized'], ['asc', 'asc']);
  await ensureIndex(databases, TRAINING_ATTENDANCE_COLLECTION_ID, 'idx_tr_a_signed', ['sessionId', 'signedAt'], ['asc', 'desc']);
  await ensureIndex(databases, TRAINING_ATTENDANCE_COLLECTION_ID, 'idx_tr_a_volunteer', ['volunteerId'], ['asc']);

  await ensureBucket(storage, TRAINING_SIGNATURES_BUCKET_ID, 'Training Signatures', ['png', 'jpg', 'jpeg', 'webp']);
  await ensureBucket(storage, TRAINING_ARCHIVES_BUCKET_ID, 'Training Archives', ['pdf']);

  console.log('Training schema setup completed.');
}

async function ensureCollection(
  databases: Databases,
  collectionId: string,
  name: string,
  permissions: string[],
) {
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`Collection "${collectionId}" already exists.`);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 404) {
      throw err;
    }

    await databases.createCollection(DATABASE_ID, collectionId, name, permissions);
    console.log(`Created collection "${collectionId}".`);
  }
}

async function ensureAttributes(
  databases: Databases,
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
      await databases.createStringAttribute(DATABASE_ID, collectionId, attribute.key, attribute.size || 255, false);
    } else if (attribute.type === 'string-array') {
      await databases.createStringAttribute(DATABASE_ID, collectionId, attribute.key, attribute.size || 255, false, undefined, true);
    } else if (attribute.type === 'boolean') {
      await databases.createBooleanAttribute(DATABASE_ID, collectionId, attribute.key, false, attribute.default ?? false);
    }

    createdKeys.push(attribute.key);
    console.log(`Created attribute "${collectionId}.${attribute.key}".`);
  }

  for (const key of createdKeys) {
    await waitForAttribute(databases, collectionId, key);
  }
}

async function waitForAttribute(databases: Databases, collectionId: string, key: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const attribute = await databases.getAttribute(DATABASE_ID, collectionId, key);
    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Attribute "${collectionId}.${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Attribute "${collectionId}.${key}" is still processing.`);
}

async function ensureIndex(
  databases: Databases,
  collectionId: string,
  key: string,
  attributes: string[],
  orders: string[],
) {
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
    }).createIndex(DATABASE_ID, collectionId, key, 'key', attributes, orders);
    console.log(`Created index "${key}".`);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 409) {
      throw err;
    }
  }
}

async function ensureBucket(
  storage: Storage,
  bucketId: string,
  name: string,
  allowedExtensions: string[],
) {
  try {
    await storage.getBucket(bucketId);
    console.log(`Bucket "${bucketId}" already exists.`);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 404) {
      throw err;
    }

    await storage.createBucket(bucketId, name, [], false, true, 10 * 1024 * 1024, allowedExtensions);
    console.log(`Created bucket "${bucketId}".`);
  }
}

main().catch((err) => {
  console.error('Training schema setup failed:', err?.message || err);
  process.exit(1);
});

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return undefined;
}
