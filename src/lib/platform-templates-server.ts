import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { createAdminClient } from '@/lib/appwrite-server';
import { normalizeName } from '@/lib/name-utils';
import type {
  PlatformTemplateCreateInput,
  PlatformTemplateRecord,
} from '@/lib/platform-template-types';

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type DatabasesClient = AdminClient['databases'];
type StorageClient = AdminClient['storage'];

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

export const PLATFORM_TEMPLATES_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_TEMPLATES_COLLECTION_ID || 'platform_templates';
export const PLATFORM_TEMPLATES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_TEMPLATES_BUCKET_ID || 'platform_templates';

const PLATFORM_TEMPLATE_ATTRIBUTES = [
  { key: 'templateName', type: 'string', size: 160 },
  { key: 'category', type: 'string', size: 64 },
  { key: 'fileType', type: 'string', size: 16 },
  { key: 'originalFileName', type: 'string', size: 255 },
  { key: 'mimeType', type: 'string', size: 160 },
  { key: 'templateFileId', type: 'string', size: 128 },
  { key: 'description', type: 'string', size: 1500 },
  { key: 'placeholdersJson', type: 'string', size: 3000 },
  { key: 'createdAt', type: 'string', size: 64 },
  { key: 'updatedAt', type: 'string', size: 64 },
  { key: 'createdByUserId', type: 'string', size: 128 },
  { key: 'updatedByUserId', type: 'string', size: 128 },
  { key: 'nameNormalized', type: 'string', size: 160 },
] as const;

const PLATFORM_TEMPLATE_INDEXES = [
  {
    key: 'idx_pt_cat',
    attributes: ['category'],
    orders: ['asc'],
  },
  {
    key: 'idx_pt_type',
    attributes: ['fileType'],
    orders: ['asc'],
  },
  {
    key: 'idx_pt_name',
    attributes: ['nameNormalized'],
    orders: ['asc'],
  },
  {
    key: 'idx_pt_cat_nm',
    attributes: ['category', 'nameNormalized'],
    orders: ['asc', 'asc'],
  },
] as const;

const PLATFORM_TEMPLATE_ALLOWED_EXTENSIONS = ['pptx', 'docx', 'xlsx', 'pdf'] as const;

export async function ensurePlatformTemplatesSchema(databases: DatabasesClient) {
  await ensureCollection(databases, PLATFORM_TEMPLATES_COLLECTION_ID, 'Platform Templates', [
    Permission.read(Role.team(ADMIN_TEAM_ID)),
    Permission.create(Role.team(ADMIN_TEAM_ID)),
    Permission.update(Role.team(ADMIN_TEAM_ID)),
    Permission.delete(Role.team(ADMIN_TEAM_ID)),
  ]);

  await ensureAttributes(databases, PLATFORM_TEMPLATES_COLLECTION_ID, PLATFORM_TEMPLATE_ATTRIBUTES);

  for (const index of PLATFORM_TEMPLATE_INDEXES) {
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
        PLATFORM_TEMPLATES_COLLECTION_ID,
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

export async function ensurePlatformTemplatesBucket(storage: StorageClient) {
  try {
    await storage.getBucket(PLATFORM_TEMPLATES_BUCKET_ID);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await storage.createBucket(
      PLATFORM_TEMPLATES_BUCKET_ID,
      'Platform Templates',
      [],
      false,
      true,
      15 * 1024 * 1024,
      [...PLATFORM_TEMPLATE_ALLOWED_EXTENSIONS],
    );
  }
}

export async function listPlatformTemplates(
  databases: DatabasesClient,
  params?: { category?: string; fileType?: string; search?: string },
) {
  const queries = [Query.orderDesc('$updatedAt'), Query.limit(500)];

  if (params?.category) {
    queries.unshift(Query.equal('category', params.category));
  }

  if (params?.fileType) {
    queries.unshift(Query.equal('fileType', params.fileType));
  }

  if (params?.search) {
    queries.unshift(Query.search('templateName', params.search));
  }

  const result = await databases.listDocuments(DATABASE_ID, PLATFORM_TEMPLATES_COLLECTION_ID, queries);
  return JSON.parse(JSON.stringify(result.documents)) as PlatformTemplateRecord[];
}

export async function getPlatformTemplate(databases: DatabasesClient, templateId: string) {
  const document = await databases.getDocument(DATABASE_ID, PLATFORM_TEMPLATES_COLLECTION_ID, templateId);
  return JSON.parse(JSON.stringify(document)) as PlatformTemplateRecord;
}

export async function createPlatformTemplateDocument(
  databases: DatabasesClient,
  input: PlatformTemplateCreateInput,
  actorUserId: string,
) {
  const payload = buildPlatformTemplatePayload(input, actorUserId);
  const created = await databases.createDocument(DATABASE_ID, PLATFORM_TEMPLATES_COLLECTION_ID, ID.unique(), payload);
  return JSON.parse(JSON.stringify(created)) as PlatformTemplateRecord;
}

export async function deletePlatformTemplateDocument(databases: DatabasesClient, templateId: string) {
  const existing = await getPlatformTemplate(databases, templateId);
  await databases.deleteDocument(DATABASE_ID, PLATFORM_TEMPLATES_COLLECTION_ID, templateId);
  return existing;
}

export async function savePlatformTemplateFile(
  storage: StorageClient,
  fileName: string,
  buffer: Buffer,
) {
  const uploaded = await storage.createFile(
    PLATFORM_TEMPLATES_BUCKET_ID,
    ID.unique(),
    InputFile.fromBuffer(buffer, fileName),
  );

  return uploaded.$id;
}

export async function deletePlatformTemplateFile(storage: StorageClient, fileId?: string | null) {
  if (!fileId) {
    return;
  }

  try {
    await storage.deleteFile(PLATFORM_TEMPLATES_BUCKET_ID, fileId);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }
  }
}

export async function getPlatformTemplateFileBuffer(storage: StorageClient, fileId: string) {
  return Buffer.from(await storage.getFileDownload(PLATFORM_TEMPLATES_BUCKET_ID, fileId));
}

export function sanitizePlatformTemplateText(value?: string | null, maxLength = 255) {
  const sanitized = (value || '').replace(/\s+/g, ' ').trim();
  return sanitized ? sanitized.slice(0, maxLength) : '';
}

export function inferPlatformTemplateFileType(fileName?: string | null) {
  const extension = (fileName || '').split('.').pop()?.toLowerCase();
  if (extension === 'pptx' || extension === 'docx' || extension === 'xlsx' || extension === 'pdf') {
    return extension;
  }

  return 'other';
}

function buildPlatformTemplatePayload(
  input: PlatformTemplateCreateInput,
  actorUserId: string,
  existing?: PlatformTemplateRecord,
) {
  const now = new Date().toISOString();
  const templateName = sanitizePlatformTemplateText(input.templateName, 160);
  const category = sanitizePlatformTemplateText(input.category, 64);
  const fileType = sanitizePlatformTemplateText(input.fileType, 16);

  return {
    templateName,
    category,
    fileType,
    originalFileName: sanitizePlatformTemplateText(input.originalFileName, 255),
    mimeType: sanitizePlatformTemplateText(input.mimeType, 160),
    templateFileId: sanitizePlatformTemplateText(input.templateFileId, 128),
    description: sanitizePlatformTemplateText(input.description, 1500),
    placeholdersJson: sanitizePlatformTemplateText(input.placeholdersJson, 3000),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId || actorUserId,
    updatedByUserId: actorUserId,
    nameNormalized: normalizeName(templateName),
  };
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
  attributes: readonly {
    key: string;
    type: 'string';
    size: number;
  }[],
) {
  const list = await databases.listAttributes(DATABASE_ID, collectionId);
  const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
  const createdKeys: string[] = [];

  for (const attribute of attributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    await databases.createStringAttribute(
      DATABASE_ID,
      collectionId,
      attribute.key,
      attribute.size,
      false,
    );

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
      throw new Error(`Platform template attribute "${collectionId}.${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Platform template attribute "${collectionId}.${key}" is still processing.`);
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return 0;
}
