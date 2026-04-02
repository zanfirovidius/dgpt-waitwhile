import { Client, Databases, Permission, Role, Storage } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || '';
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID || '';
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const PLATFORM_TEMPLATES_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_TEMPLATES_COLLECTION_ID || 'platform_templates';
const PLATFORM_TEMPLATES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_TEMPLATES_BUCKET_ID || 'platform_templates';

type SchemaError = {
  code?: number;
  message?: string;
};

type DatabasesWithIndex = InstanceType<typeof Databases> & {
  createIndex: (
    databaseId: string,
    collectionId: string,
    key: string,
    type: string,
    attrs: string[],
    orders: string[],
  ) => Promise<unknown>;
};

const ATTRIBUTES = [
  ['templateName', 160],
  ['category', 64],
  ['fileType', 16],
  ['originalFileName', 255],
  ['mimeType', 160],
  ['templateFileId', 128],
  ['description', 1500],
  ['placeholdersJson', 3000],
  ['createdAt', 64],
  ['updatedAt', 64],
  ['createdByUserId', 128],
  ['updatedByUserId', 128],
  ['nameNormalized', 160],
] as const;

const INDEXES = [
  ['idx_pt_cat', ['category'], ['asc']],
  ['idx_pt_type', ['fileType'], ['asc']],
  ['idx_pt_name', ['nameNormalized'], ['asc']],
  ['idx_pt_cat_nm', ['category', 'nameNormalized'], ['asc', 'asc']],
] as const;

async function main() {
  if (!DATABASE_ID || !ADMIN_TEAM_ID || !ENDPOINT || !PROJECT_ID || !API_KEY) {
    throw new Error('Missing required Appwrite env vars for platform templates schema setup.');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client) as DatabasesWithIndex;
  const storage = new Storage(client);

  await ensureCollection(databases, PLATFORM_TEMPLATES_COLLECTION_ID, 'Platform Templates', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  for (const [key, size] of ATTRIBUTES) {
    await ensureAttribute(databases, PLATFORM_TEMPLATES_COLLECTION_ID, key, size);
  }

  for (const [key, attrs, orders] of INDEXES) {
    await ensureIndex(databases, PLATFORM_TEMPLATES_COLLECTION_ID, key, attrs, orders);
  }

  await ensureBucket(storage, PLATFORM_TEMPLATES_BUCKET_ID, 'Platform Templates', ['pptx', 'docx', 'xlsx', 'pdf']);

  console.log('Platform templates schema setup finished.');
}

async function ensureCollection(
  databases: DatabasesWithIndex,
  collectionId: string,
  name: string,
  permissions: string[],
) {
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`Collection "${collectionId}" already exists.`);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 404) {
      throw error;
    }

    await databases.createCollection(DATABASE_ID, collectionId, name, permissions);
    console.log(`Created collection "${collectionId}".`);
  }
}

async function ensureAttribute(
  databases: DatabasesWithIndex,
  collectionId: string,
  key: string,
  size: number,
) {
  try {
    await databases.createStringAttribute(DATABASE_ID, collectionId, key, size, false);
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
  attrs: readonly string[],
  orders: readonly string[],
) {
  try {
    await databases.createIndex(DATABASE_ID, collectionId, key, 'key', [...attrs], [...orders]);
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
    const attribute = await databases.getAttribute(DATABASE_ID, collectionId, key);
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
  allowedExtensions: string[],
) {
  try {
    await storage.getBucket(bucketId);
    console.log(`Bucket "${bucketId}" already exists.`);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 404) {
      throw error;
    }

    await storage.createBucket(bucketId, name, [], false, true, 15 * 1024 * 1024, allowedExtensions);
    console.log(`Created bucket "${bucketId}".`);
  }
}

function toSchemaError(error: unknown): SchemaError {
  return typeof error === 'object' && error !== null ? (error as SchemaError) : {};
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
