import dotenv from 'dotenv';
import { Client, Databases, Permission, Role, Storage } from 'node-appwrite';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID;
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const AUDIT_LOGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_AUDIT_LOGS_COLLECTION_ID;
const DOCTORS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_DOCTORS_COLLECTION_ID || 'platform_doctors';
const DOCTOR_IMAGES_BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_DOCTOR_IMAGES_BUCKET_ID || 'doctor_images';
const DOCTOR_DOCUMENTS_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTOR_DOCUMENTS_BUCKET_ID || 'doctor_documents';
const DOCTOR_PORTAL_TOKENS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTOR_PORTAL_TOKENS_COLLECTION_ID || 'doctor_portal_tokens';

type SchemaError = {
  code?: number;
  message?: string;
};

type DatabasesWithIndex = Databases & {
  createIndex: (
    databaseId: string,
    collectionId: string,
    key: string,
    type: string,
    attrs: string[],
    orders?: string[],
  ) => Promise<unknown>;
};

const DOCTOR_ATTRIBUTES: Array<[string, number]> = [
  ['fullName', 255],
  ['professionalGrade', 160],
  ['phone', 64],
  ['email', 160],
  ['cuim', 64],
  ['specialty', 160],
  ['notes', 2000],
  ['status', 16],
  ['profileImageFileId', 128],
  ['profileImageUrl', 255],
  ['profileImageUploadedAt', 64],
  ['cvFileId', 128],
  ['cvFileName', 255],
  ['cvUploadedAt', 64],
  ['practiceLicenseFileId', 128],
  ['practiceLicenseFileName', 255],
  ['practiceLicenseUploadedAt', 64],
  ['createdAt', 64],
  ['updatedAt', 64],
  ['createdByUserId', 128],
  ['updatedByUserId', 128],
  ['fullNameNormalized', 255],
  ['emailNormalized', 160],
  ['phoneNormalized', 64],
  ['cuimNormalized', 64],
];

const AUDIT_ATTRIBUTES: Array<[string, number]> = [
  ['entityType', 64],
  ['entityId', 50],
  ['action', 64],
  ['actorUserId', 50],
  ['beforeJson', 1500],
  ['afterJson', 1500],
];

const PORTAL_TOKEN_ATTRIBUTES: Array<[string, number]> = [
  ['doctorId', 128],
  ['channel', 16],
  ['identifier', 191],
  ['tokenHash', 128],
  ['expiresAt', 64],
  ['usedAt', 64],
  ['createdAt', 64],
];

const DOCTOR_INDEXES: Array<[string, string[], string[]]> = [
  ['idx_doc_cuim', ['cuimNormalized'], ['asc']],
  ['idx_doc_email', ['emailNormalized'], ['asc']],
  ['idx_doc_phone', ['phoneNormalized'], ['asc']],
  ['idx_doc_name', ['fullNameNormalized'], ['asc']],
  ['idx_doc_status', ['status'], ['asc']],
  ['idx_doc_grade', ['professionalGrade'], ['asc']],
  ['idx_doc_image', ['profileImageFileId'], ['asc']],
];

const PORTAL_INDEXES: Array<[string, string[], string[]]> = [
  ['idx_dpt_doc', ['doctorId', 'channel'], ['asc', 'asc']],
  ['idx_dpt_id', ['identifier'], ['asc']],
  ['idx_dpt_exp', ['expiresAt'], ['asc']],
];

async function main() {
  if (!DATABASE_ID || !ADMIN_TEAM_ID || !ENDPOINT || !PROJECT_ID || !API_KEY || !AUDIT_LOGS_COLLECTION_ID) {
    throw new Error('Missing required Appwrite env vars for doctors schema setup.');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client) as DatabasesWithIndex;
  const storage = new Storage(client);

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

  for (const [key, size] of DOCTOR_ATTRIBUTES) {
    await ensureStringAttribute(databases, DOCTORS_COLLECTION_ID, key, size);
  }

  for (const [key, size] of AUDIT_ATTRIBUTES) {
    await ensureStringAttribute(databases, AUDIT_LOGS_COLLECTION_ID, key, size);
  }

  for (const [key, size] of PORTAL_TOKEN_ATTRIBUTES) {
    await ensureStringAttribute(databases, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, key, size);
  }

  for (const [key, attrs, orders] of DOCTOR_INDEXES) {
    await ensureIndex(databases, DOCTORS_COLLECTION_ID, key, attrs, orders);
  }

  for (const [key, attrs, orders] of PORTAL_INDEXES) {
    await ensureIndex(databases, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, key, attrs, orders);
  }

  await ensureBucket(storage, DOCTOR_IMAGES_BUCKET_ID, 'Doctor Images', ['jpg', 'jpeg', 'png', 'webp']);
  await ensureBucket(storage, DOCTOR_DOCUMENTS_BUCKET_ID, 'Doctor Documents', ['pdf']);

  console.log('Doctors schema setup finished.');
}

async function ensureCollection(
  databases: DatabasesWithIndex,
  collectionId: string,
  name: string,
  permissions: string[],
) {
  try {
    await databases.getCollection(DATABASE_ID!, collectionId);
    console.log(`Collection "${collectionId}" already exists.`);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 404) {
      throw error;
    }

    await databases.createCollection(DATABASE_ID!, collectionId, name, permissions);
    console.log(`Created collection "${collectionId}".`);
  }
}

async function ensureStringAttribute(
  databases: DatabasesWithIndex,
  collectionId: string,
  key: string,
  size: number,
) {
  try {
    await databases.createStringAttribute(DATABASE_ID!, collectionId, key, size, false);
    console.log(`Created attribute "${collectionId}.${key}".`);
    await waitForAttribute(databases, collectionId, key);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 409) {
      throw error;
    }

    console.log(`Attribute "${collectionId}.${key}" already exists.`);
  }
}

async function ensureIndex(
  databases: DatabasesWithIndex,
  collectionId: string,
  key: string,
  attrs: string[],
  orders: string[],
) {
  try {
    await databases.createIndex(DATABASE_ID!, collectionId, key, 'key', attrs, orders);
    console.log(`Created index "${collectionId}.${key}".`);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 409) {
      throw error;
    }

    console.log(`Index "${collectionId}.${key}" already exists.`);
  }
}

async function waitForAttribute(
  databases: DatabasesWithIndex,
  collectionId: string,
  key: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const attribute = await databases.getAttribute(DATABASE_ID!, collectionId, key);
    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Attribute ${collectionId}.${key} is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Attribute ${collectionId}.${key} is still processing.`);
}

async function ensureBucket(
  storage: Storage,
  bucketId: string,
  name: string,
  extensions: string[],
) {
  try {
    await storage.getBucket(bucketId);
    console.log(`Bucket "${bucketId}" already exists.`);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 404) {
      throw error;
    }

    await storage.createBucket(bucketId, name, [], false, true, 10 * 1024 * 1024, extensions);
    console.log(`Created bucket "${bucketId}".`);
  }
}

function toSchemaError(error: unknown): SchemaError {
  if (typeof error === 'object' && error !== null) {
    return error as SchemaError;
  }

  return {};
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
