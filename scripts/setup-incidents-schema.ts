import { Client, Databases, Permission, Role, Storage } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;
const API_KEY = process.env.APPWRITE_API_KEY!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;
const AUDIT_LOGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_AUDIT_LOGS_COLLECTION_ID!;

const INCIDENTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_INCIDENTS_COLLECTION_ID || 'project_incidents';
const INCIDENT_ARCHIVES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_INCIDENT_ARCHIVES_BUCKET_ID || 'incident_archives';

const INCIDENT_ATTRIBUTES = [
  { key: 'projectId', type: 'string', size: 128 },
  { key: 'projectSlugSnapshot', type: 'string', size: 128 },
  { key: 'eventName', type: 'string', size: 160 },
  { key: 'location', type: 'string', size: 160 },
  { key: 'reportedAt', type: 'string', size: 64 },
  { key: 'discoveredAt', type: 'string', size: 64 },
  { key: 'reporterName', type: 'string', size: 160 },
  { key: 'reporterRole', type: 'string', size: 96 },
  { key: 'reporterContact', type: 'string', size: 160 },
  { key: 'incidentType', type: 'string', size: 64 },
  { key: 'description', type: 'string', size: 2000 },
  { key: 'affectedCategories', type: 'string-array', size: 32 },
  { key: 'affectedCount', type: 'integer', min: 0, max: 100000000, default: 0 },
  { key: 'dataTypes', type: 'string-array', size: 32 },
  { key: 'immediateActions', type: 'string', size: 2000 },
  { key: 'status', type: 'string', size: 16, default: 'new' },
  { key: 'riskLevel', type: 'string', size: 16 },
  { key: 'requiresNotification', type: 'boolean', default: false },
  { key: 'notificationDeadline', type: 'string', size: 64 },
  { key: 'dpoNotes', type: 'string', size: 2000 },
  { key: 'evaluatedByUserId', type: 'string', size: 128 },
  { key: 'evaluatedAt', type: 'string', size: 64 },
  { key: 'dpoNameSnapshot', type: 'string', size: 160 },
  { key: 'dpoEmailSnapshot', type: 'string', size: 160 },
  { key: 'notificationStatus', type: 'string', size: 32 },
  { key: 'notificationSentAt', type: 'string', size: 64 },
  { key: 'notificationError', type: 'string', size: 512 },
  { key: 'notificationMessageId', type: 'string', size: 128 },
  { key: 'authorityNotifiedAt', type: 'string', size: 64 },
  { key: 'authorityNotificationReference', type: 'string', size: 160 },
  { key: 'archivedPdfFileId', type: 'string', size: 128 },
  { key: 'archivedFileName', type: 'string', size: 200 },
  { key: 'archivedAt', type: 'string', size: 64 },
] as const;

const AUDIT_LOG_ATTRIBUTES = [
  { key: 'entityType', type: 'string', size: 64 },
  { key: 'entityId', type: 'string', size: 50 },
  { key: 'action', type: 'string', size: 64 },
  { key: 'actorUserId', type: 'string', size: 50 },
  { key: 'beforeJson', type: 'string', size: 1500 },
  { key: 'afterJson', type: 'string', size: 1500 },
] as const;

async function main() {
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const storage = new Storage(client);

  await ensureCollection(databases, INCIDENTS_COLLECTION_ID, 'Project Incidents', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureCollection(databases, AUDIT_LOGS_COLLECTION_ID, 'Audit Logs', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureAttributes(databases, INCIDENTS_COLLECTION_ID, INCIDENT_ATTRIBUTES);
  await ensureAttributes(databases, AUDIT_LOGS_COLLECTION_ID, AUDIT_LOG_ATTRIBUTES);

  await ensureIndex(databases, INCIDENTS_COLLECTION_ID, 'idx_inc_proj_rep', ['projectId', 'reportedAt'], ['asc', 'desc']);
  await ensureIndex(databases, INCIDENTS_COLLECTION_ID, 'idx_inc_status', ['status'], ['asc']);
  await ensureIndex(databases, INCIDENTS_COLLECTION_ID, 'idx_inc_risk', ['riskLevel'], ['asc']);
  await ensureIndex(databases, INCIDENTS_COLLECTION_ID, 'idx_inc_slug', ['projectSlugSnapshot'], ['asc']);

  await ensureBucket(storage, INCIDENT_ARCHIVES_BUCKET_ID, 'Incident Archives', ['pdf']);

  console.log('Incident schema setup completed.');
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
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await databases.createCollection(DATABASE_ID, collectionId, name, permissions);
    console.log(`Created collection "${collectionId}".`);
  }
}

async function ensureAttributes(
  databases: Databases,
  collectionId: string,
  attributes: readonly (
    | { key: string; type: 'string'; size: number; default?: string }
    | { key: string; type: 'string-array'; size: number }
    | { key: string; type: 'boolean'; default?: boolean }
    | { key: string; type: 'integer'; min: number; max: number; default?: number }
  )[],
) {
  const list = await databases.listAttributes(DATABASE_ID, collectionId);
  const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
  const createdKeys: string[] = [];
  const updatedKeys: string[] = [];

  for (const attribute of attributes) {
    const current = existing.get(attribute.key);
    if (current) {
      if (
        attribute.type === 'string' &&
        current.type === 'string' &&
        'size' in current &&
        typeof current.size === 'number' &&
        current.size > attribute.size
      ) {
        await databases.updateStringAttribute(
          {
            databaseId: DATABASE_ID,
            collectionId,
            key: attribute.key,
            required: false,
            xdefault: attribute.default ?? '',
            size: attribute.size,
          },
        );
        updatedKeys.push(attribute.key);
        console.log(`Updated attribute "${collectionId}.${attribute.key}" to size ${attribute.size}.`);
      }

      continue;
    }

    let created = false;

    try {
      if (attribute.type === 'string') {
        await databases.createStringAttribute(
          DATABASE_ID,
          collectionId,
          attribute.key,
          attribute.size,
          false,
          attribute.default,
        );
      } else if (attribute.type === 'string-array') {
        await databases.createStringAttribute(
          DATABASE_ID,
          collectionId,
          attribute.key,
          attribute.size,
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
      } else if (attribute.type === 'integer') {
        await databases.createIntegerAttribute(
          DATABASE_ID,
          collectionId,
          attribute.key,
          false,
          attribute.min,
          attribute.max,
          attribute.default ?? 0,
        );
      }
      created = true;
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }

    createdKeys.push(attribute.key);
    if (created) {
      console.log(`Created attribute "${collectionId}.${attribute.key}".`);
    }
  }

  for (const key of updatedKeys) {
    await waitForAttribute(databases, collectionId, key);
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
  } catch (error: unknown) {
    if (getErrorCode(error) !== 409) {
      throw error;
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
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await storage.createBucket(bucketId, name, [], false, true, 10 * 1024 * 1024, allowedExtensions);
    console.log(`Created bucket "${bucketId}".`);
  }
}

main().catch((error) => {
  console.error('Incident schema setup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return undefined;
}
