import { Client, Databases, Permission, Role, Storage } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || '';
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID || '';
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const PROJECT_CABINETS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_CABINETS_COLLECTION_ID || 'project_cabinets';
const PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID || 'project_cabinet_assignments';
const CABINET_PRINT_TEMPLATES_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_CABINET_PRINT_TEMPLATES_COLLECTION_ID || 'cabinet_print_templates';
const CABINET_PRINT_TEMPLATES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_CABINET_PRINT_TEMPLATES_BUCKET_ID || 'cabinet_print_templates';

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

const CABINET_ATTRIBUTES = [
  ['projectId', 'string', 128],
  ['name', 'string', 255],
  ['identifier', 'string', 64],
  ['specialty', 'string', 160],
  ['ultrasoundAvailable', 'boolean', 0],
  ['materialsJson', 'string', 6000],
  ['defaultAssigneeType', 'string', 24],
  ['defaultDoctorId', 'string', 128],
  ['defaultDoctorName', 'string', 255],
  ['defaultResponsibleName', 'string', 255],
  ['notes', 'string', 1500],
  ['createdAt', 'string', 64],
  ['updatedAt', 'string', 64],
  ['createdByUserId', 'string', 128],
  ['updatedByUserId', 'string', 128],
  ['nameNormalized', 'string', 255],
  ['identifierNormalized', 'string', 64],
] as const;

const ASSIGNMENT_ATTRIBUTES = [
  ['projectId', 'string', 128],
  ['cabinetId', 'string', 128],
  ['cabinetName', 'string', 255],
  ['cabinetIdentifier', 'string', 64],
  ['cabinetSpecialty', 'string', 160],
  ['materialsJson', 'string', 6000],
  ['assignmentDate', 'string', 32],
  ['startTime', 'string', 16],
  ['endTime', 'string', 16],
  ['slotKey', 'string', 64],
  ['assigneeType', 'string', 24],
  ['doctorId', 'string', 128],
  ['doctorName', 'string', 255],
  ['volunteerId', 'string', 128],
  ['volunteerName', 'string', 255],
  ['volunteerCategory', 'string', 128],
  ['responsibleName', 'string', 255],
  ['notes', 'string', 1500],
  ['createdAt', 'string', 64],
  ['updatedAt', 'string', 64],
  ['createdByUserId', 'string', 128],
  ['updatedByUserId', 'string', 128],
] as const;

const TEMPLATE_ATTRIBUTES = [
  ['scopeType', 'string', 24],
  ['projectId', 'string', 128],
  ['libraryTemplateId', 'string', 128],
  ['templateName', 'string', 160],
  ['templateFileId', 'string', 128],
  ['originalFileName', 'string', 255],
  ['placeholdersJson', 'string', 1000],
  ['createdAt', 'string', 64],
  ['updatedAt', 'string', 64],
  ['createdByUserId', 'string', 128],
  ['updatedByUserId', 'string', 128],
] as const;

const INDEXES = [
  [PROJECT_CABINETS_COLLECTION_ID, 'idx_cab_proj', ['projectId'], ['asc']],
  [PROJECT_CABINETS_COLLECTION_ID, 'idx_cab_name', ['projectId', 'nameNormalized'], ['asc', 'asc']],
  [PROJECT_CABINETS_COLLECTION_ID, 'idx_cab_code', ['projectId', 'identifierNormalized'], ['asc', 'asc']],
  [PROJECT_CABINETS_COLLECTION_ID, 'idx_cab_spec', ['specialty'], ['asc']],
  [PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, 'idx_asg_day', ['projectId', 'assignmentDate'], ['asc', 'asc']],
  [PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, 'idx_asg_cab', ['cabinetId', 'assignmentDate'], ['asc', 'asc']],
  [PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, 'idx_asg_doc', ['doctorId'], ['asc']],
  [PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, 'idx_asg_vol', ['volunteerId'], ['asc']],
  [PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, 'idx_asg_slot', ['projectId', 'slotKey'], ['asc', 'asc']],
  [CABINET_PRINT_TEMPLATES_COLLECTION_ID, 'idx_cpt_scope', ['scopeType', 'projectId'], ['asc', 'asc']],
] as const;

async function main() {
  if (!DATABASE_ID || !ADMIN_TEAM_ID || !ENDPOINT || !PROJECT_ID || !API_KEY) {
    throw new Error('Missing required Appwrite env vars for cabinets schema setup.');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client) as DatabasesWithIndex;
  const storage = new Storage(client);

  await ensureCollection(databases, PROJECT_CABINETS_COLLECTION_ID, 'Project Cabinets', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureCollection(databases, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, 'Project Cabinet Assignments', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureCollection(databases, CABINET_PRINT_TEMPLATES_COLLECTION_ID, 'Cabinet Print Templates', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  for (const [key, type, size] of CABINET_ATTRIBUTES) {
    await ensureAttribute(databases, PROJECT_CABINETS_COLLECTION_ID, key, type, size);
  }

  for (const [key, type, size] of ASSIGNMENT_ATTRIBUTES) {
    await ensureAttribute(databases, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, key, type, size);
  }

  for (const [key, type, size] of TEMPLATE_ATTRIBUTES) {
    await ensureAttribute(databases, CABINET_PRINT_TEMPLATES_COLLECTION_ID, key, type, size);
  }

  for (const [collectionId, key, attrs, orders] of INDEXES) {
    await ensureIndex(databases, collectionId, key, attrs, orders);
  }

  await ensureBucket(storage, CABINET_PRINT_TEMPLATES_BUCKET_ID, 'Cabinet Print Templates', ['pptx']);

  console.log('Cabinets schema setup finished.');
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
  type: string,
  size: number,
) {
  try {
    if (type === 'boolean') {
      await databases.createBooleanAttribute(DATABASE_ID, collectionId, key, false, false);
    } else {
      await databases.createStringAttribute(DATABASE_ID, collectionId, key, size, false);
    }

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
  allowedFileExtensions: string[],
) {
  try {
    await storage.getBucket(bucketId);
    console.log(`Bucket "${bucketId}" already exists.`);
  } catch (error: unknown) {
    if (Number(toSchemaError(error).code || 0) !== 404) {
      throw error;
    }

    await storage.createBucket(bucketId, name, [], false, true, 10 * 1024 * 1024, allowedFileExtensions);
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
  console.error(error?.message || error);
  process.exitCode = 1;
});

export {};
