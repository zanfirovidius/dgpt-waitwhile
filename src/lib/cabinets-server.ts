import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { createAdminClient } from '@/lib/appwrite-server';
import { getPlatformTemplate } from '@/lib/platform-templates-server';
import type {
  CabinetPrintTemplateRecord,
  CabinetAssignmentFormInput,
  CabinetFormInput,
  ProjectCabinet,
  ProjectCabinetAssignment,
} from '@/lib/cabinet-types';
import {
  buildCabinetSlotKey,
  hydrateCabinetAssignmentRecord,
  hydrateCabinetRecord,
  normalizeCabinetIdentifier,
  normalizeCabinetName,
  normalizeCabinetAssigneeType,
  sanitizeCabinetAssignmentInput,
  sanitizeCabinetFormInput,
  sanitizeResponsibleName,
  serializeCabinetMaterials,
} from '@/lib/cabinet-utils';
import type { DoctorRecord } from '@/lib/doctor-types';

type CabinetVolunteerRecord = {
  $id?: string;
  firstName?: string;
  lastName?: string;
  activityCategory?: string;
};

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type DatabasesClient = AdminClient['databases'];
type StorageClient = AdminClient['storage'];

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

export const PROJECT_CABINETS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_CABINETS_COLLECTION_ID || 'project_cabinets';
export const PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID || 'project_cabinet_assignments';
export const CABINET_PRINT_TEMPLATES_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_CABINET_PRINT_TEMPLATES_COLLECTION_ID || 'cabinet_print_templates';
export const CABINET_PRINT_TEMPLATES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_CABINET_PRINT_TEMPLATES_BUCKET_ID || 'cabinet_print_templates';

const CABINET_ATTRIBUTES = [
  { key: 'projectId', type: 'string', size: 128 },
  { key: 'name', type: 'string', size: 255 },
  { key: 'identifier', type: 'string', size: 64 },
  { key: 'specialty', type: 'string', size: 160 },
  { key: 'ultrasoundAvailable', type: 'boolean', default: false },
  { key: 'materialsJson', type: 'string', size: 6000 },
  { key: 'defaultAssigneeType', type: 'string', size: 24 },
  { key: 'defaultDoctorId', type: 'string', size: 128 },
  { key: 'defaultDoctorName', type: 'string', size: 255 },
  { key: 'defaultResponsibleName', type: 'string', size: 255 },
  { key: 'notes', type: 'string', size: 1500 },
  { key: 'createdAt', type: 'string', size: 64 },
  { key: 'updatedAt', type: 'string', size: 64 },
  { key: 'createdByUserId', type: 'string', size: 128 },
  { key: 'updatedByUserId', type: 'string', size: 128 },
  { key: 'nameNormalized', type: 'string', size: 255 },
  { key: 'identifierNormalized', type: 'string', size: 64 },
] as const;

const ASSIGNMENT_ATTRIBUTES = [
  { key: 'projectId', type: 'string', size: 128 },
  { key: 'cabinetId', type: 'string', size: 128 },
  { key: 'cabinetName', type: 'string', size: 255 },
  { key: 'cabinetIdentifier', type: 'string', size: 64 },
  { key: 'cabinetSpecialty', type: 'string', size: 160 },
  { key: 'materialsJson', type: 'string', size: 6000 },
  { key: 'assignmentDate', type: 'string', size: 32 },
  { key: 'startTime', type: 'string', size: 16 },
  { key: 'endTime', type: 'string', size: 16 },
  { key: 'slotKey', type: 'string', size: 64 },
  { key: 'assigneeType', type: 'string', size: 24 },
  { key: 'doctorId', type: 'string', size: 128 },
  { key: 'doctorName', type: 'string', size: 255 },
  { key: 'volunteerId', type: 'string', size: 128 },
  { key: 'volunteerName', type: 'string', size: 255 },
  { key: 'volunteerCategory', type: 'string', size: 128 },
  { key: 'responsibleName', type: 'string', size: 255 },
  { key: 'notes', type: 'string', size: 1500 },
  { key: 'createdAt', type: 'string', size: 64 },
  { key: 'updatedAt', type: 'string', size: 64 },
  { key: 'createdByUserId', type: 'string', size: 128 },
  { key: 'updatedByUserId', type: 'string', size: 128 },
] as const;

const TEMPLATE_ATTRIBUTES = [
  { key: 'scopeType', type: 'string', size: 24 },
  { key: 'projectId', type: 'string', size: 128 },
  { key: 'libraryTemplateId', type: 'string', size: 128 },
  { key: 'templateName', type: 'string', size: 160 },
  { key: 'templateFileId', type: 'string', size: 128 },
  { key: 'originalFileName', type: 'string', size: 255 },
  { key: 'placeholdersJson', type: 'string', size: 1000 },
  { key: 'createdAt', type: 'string', size: 64 },
  { key: 'updatedAt', type: 'string', size: 64 },
  { key: 'createdByUserId', type: 'string', size: 128 },
  { key: 'updatedByUserId', type: 'string', size: 128 },
] as const;

const INDEXES = [
  {
    collectionId: PROJECT_CABINETS_COLLECTION_ID,
    key: 'idx_cab_proj',
    type: 'key',
    attributes: ['projectId'],
    orders: ['asc'],
  },
  {
    collectionId: PROJECT_CABINETS_COLLECTION_ID,
    key: 'idx_cab_name',
    type: 'key',
    attributes: ['projectId', 'nameNormalized'],
    orders: ['asc', 'asc'],
  },
  {
    collectionId: PROJECT_CABINETS_COLLECTION_ID,
    key: 'idx_cab_code',
    type: 'key',
    attributes: ['projectId', 'identifierNormalized'],
    orders: ['asc', 'asc'],
  },
  {
    collectionId: PROJECT_CABINETS_COLLECTION_ID,
    key: 'idx_cab_spec',
    type: 'key',
    attributes: ['specialty'],
    orders: ['asc'],
  },
  {
    collectionId: PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    key: 'idx_asg_day',
    type: 'key',
    attributes: ['projectId', 'assignmentDate'],
    orders: ['asc', 'asc'],
  },
  {
    collectionId: PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    key: 'idx_asg_cab',
    type: 'key',
    attributes: ['cabinetId', 'assignmentDate'],
    orders: ['asc', 'asc'],
  },
  {
    collectionId: PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    key: 'idx_asg_doc',
    type: 'key',
    attributes: ['doctorId'],
    orders: ['asc'],
  },
  {
    collectionId: PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    key: 'idx_asg_vol',
    type: 'key',
    attributes: ['volunteerId'],
    orders: ['asc'],
  },
  {
    collectionId: PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    key: 'idx_asg_slot',
    type: 'key',
    attributes: ['projectId', 'slotKey'],
    orders: ['asc', 'asc'],
  },
  {
    collectionId: CABINET_PRINT_TEMPLATES_COLLECTION_ID,
    key: 'idx_cpt_scope',
    type: 'key',
    attributes: ['scopeType', 'projectId'],
    orders: ['asc', 'asc'],
  },
] as const;

export async function ensureCabinetsSchema(databases: DatabasesClient) {
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

  await ensureAttributes(databases, PROJECT_CABINETS_COLLECTION_ID, CABINET_ATTRIBUTES);
  await ensureAttributes(databases, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, ASSIGNMENT_ATTRIBUTES);
  await ensureAttributes(databases, CABINET_PRINT_TEMPLATES_COLLECTION_ID, TEMPLATE_ATTRIBUTES);

  for (const index of INDEXES) {
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
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }
  }
}

export async function ensureCabinetPrintTemplateBucket(storage: StorageClient) {
  await ensureBucket(storage, CABINET_PRINT_TEMPLATES_BUCKET_ID, 'Cabinet Print Templates', ['pptx']);
}

export async function listProjectCabinets(databases: DatabasesClient, projectId: string) {
  const result = await databases.listDocuments(DATABASE_ID, PROJECT_CABINETS_COLLECTION_ID, [
    Query.equal('projectId', projectId),
    Query.orderAsc('identifierNormalized'),
    Query.orderAsc('nameNormalized'),
    Query.limit(500),
  ]);

  return (JSON.parse(JSON.stringify(result.documents)) as ProjectCabinet[]).map(hydrateCabinetRecord);
}

export async function listProjectCabinetAssignments(databases: DatabasesClient, projectId: string) {
  const result = await databases.listDocuments(DATABASE_ID, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, [
    Query.equal('projectId', projectId),
    Query.orderAsc('assignmentDate'),
    Query.orderAsc('startTime'),
    Query.orderAsc('cabinetIdentifier'),
    Query.limit(2000),
  ]);

  return (JSON.parse(JSON.stringify(result.documents)) as ProjectCabinetAssignment[]).map(
    hydrateCabinetAssignmentRecord,
  );
}

export async function getProjectCabinet(databases: DatabasesClient, cabinetId: string) {
  const cabinet = await databases.getDocument(DATABASE_ID, PROJECT_CABINETS_COLLECTION_ID, cabinetId);
  return hydrateCabinetRecord(JSON.parse(JSON.stringify(cabinet)) as ProjectCabinet);
}

export async function createProjectCabinetDocument(
  databases: DatabasesClient,
  input: CabinetFormInput,
  actorUserId: string,
) {
  const payload = buildProjectCabinetPayload(input, actorUserId);
  const created = await databases.createDocument(DATABASE_ID, PROJECT_CABINETS_COLLECTION_ID, ID.unique(), payload);
  return hydrateCabinetRecord(JSON.parse(JSON.stringify(created)) as ProjectCabinet);
}

export async function updateProjectCabinetDocument(
  databases: DatabasesClient,
  cabinetId: string,
  input: CabinetFormInput,
  actorUserId: string,
) {
  const existing = await getProjectCabinet(databases, cabinetId);
  const payload = buildProjectCabinetPayload(input, actorUserId, existing);
  const updated = await databases.updateDocument(DATABASE_ID, PROJECT_CABINETS_COLLECTION_ID, cabinetId, payload);
  return hydrateCabinetRecord(JSON.parse(JSON.stringify(updated)) as ProjectCabinet);
}

export async function deleteProjectCabinetDocument(databases: DatabasesClient, cabinetId: string) {
  const existing = await getProjectCabinet(databases, cabinetId);
  const assignments = await databases.listDocuments(DATABASE_ID, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, [
    Query.equal('cabinetId', cabinetId),
    Query.limit(2000),
  ]);

  for (const assignment of assignments.documents) {
    await databases.deleteDocument(DATABASE_ID, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, assignment.$id);
  }

  await databases.deleteDocument(DATABASE_ID, PROJECT_CABINETS_COLLECTION_ID, cabinetId);
  return existing;
}

export async function getProjectCabinetAssignment(databases: DatabasesClient, assignmentId: string) {
  const assignment = await databases.getDocument(
    DATABASE_ID,
    PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    assignmentId,
  );

  return hydrateCabinetAssignmentRecord(JSON.parse(JSON.stringify(assignment)) as ProjectCabinetAssignment);
}

export async function listCabinetPrintTemplates(databases: DatabasesClient, params?: { projectId?: string }) {
  const queries = [Query.orderDesc('$updatedAt'), Query.limit(50)];

  if (params?.projectId) {
    queries.unshift(Query.equal('projectId', params.projectId));
  }

  const result = await databases.listDocuments(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, queries);
  return JSON.parse(JSON.stringify(result.documents)) as CabinetPrintTemplateRecord[];
}

export async function getCabinetPrintTemplate(databases: DatabasesClient, templateId: string) {
  const template = await databases.getDocument(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, templateId);
  return JSON.parse(JSON.stringify(template)) as CabinetPrintTemplateRecord;
}

export async function getResolvedCabinetPrintTemplate(databases: DatabasesClient, projectId: string) {
  const result = await databases.listDocuments(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, [
    Query.or([
      Query.and([Query.equal('scopeType', 'project'), Query.equal('projectId', projectId)]),
      Query.and([Query.equal('scopeType', 'platform'), Query.equal('projectId', '')]),
    ]),
    Query.orderDesc('$updatedAt'),
    Query.limit(20),
  ]);

  const docs = JSON.parse(JSON.stringify(result.documents)) as CabinetPrintTemplateRecord[];
  const projectTemplate = docs.find((doc) => doc.scopeType === 'project' && doc.projectId === projectId) || null;
  const platformTemplate = docs.find((doc) => doc.scopeType === 'platform') || null;

  return {
    projectTemplate,
    platformTemplate,
    activeTemplate: projectTemplate || platformTemplate,
    activeSource: projectTemplate ? 'project' : platformTemplate ? 'platform' : 'bundled',
  } as const;
}

export async function upsertCabinetPrintTemplateDocument(
  databases: DatabasesClient,
  input: {
    scopeType: 'project' | 'platform';
    projectId?: string;
    libraryTemplateId?: string;
    templateName: string;
    templateFileId?: string;
    originalFileName: string;
    placeholdersJson?: string;
  },
  actorUserId: string,
) {
  const existing = await findCabinetPrintTemplateByScope(databases, input.scopeType, input.projectId);
  const now = new Date().toISOString();
  const payload = {
    scopeType: input.scopeType,
    projectId: input.scopeType === 'project' ? input.projectId || '' : '',
    libraryTemplateId: input.libraryTemplateId || '',
    templateName: input.templateName,
    templateFileId: input.templateFileId || '',
    originalFileName: input.originalFileName,
    placeholdersJson: input.placeholdersJson || '[]',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId || actorUserId,
    updatedByUserId: actorUserId,
  };

  if (existing?.$id) {
    const updated = await databases.updateDocument(
      DATABASE_ID,
      CABINET_PRINT_TEMPLATES_COLLECTION_ID,
      existing.$id,
      payload,
    );
    return JSON.parse(JSON.stringify(updated)) as CabinetPrintTemplateRecord;
  }

  const created = await databases.createDocument(
    DATABASE_ID,
    CABINET_PRINT_TEMPLATES_COLLECTION_ID,
    ID.unique(),
    payload,
  );
  return JSON.parse(JSON.stringify(created)) as CabinetPrintTemplateRecord;
}

export async function deleteCabinetPrintTemplateDocument(databases: DatabasesClient, templateId: string) {
  const existing = await getCabinetPrintTemplate(databases, templateId);
  await databases.deleteDocument(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, templateId);
  return existing;
}

export async function detachCabinetTemplateReferencesByLibraryTemplateId(
  databases: DatabasesClient,
  libraryTemplateId: string,
) {
  const result = await databases.listDocuments(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, [
    Query.equal('libraryTemplateId', libraryTemplateId),
    Query.limit(100),
  ]);

  const deleted = JSON.parse(JSON.stringify(result.documents)) as CabinetPrintTemplateRecord[];

  for (const document of result.documents) {
    await databases.deleteDocument(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, document.$id);
  }

  return deleted;
}

export async function resolveCabinetPrintTemplateLibraryReference(
  databases: DatabasesClient,
  record: CabinetPrintTemplateRecord | null,
) {
  if (!record?.libraryTemplateId) {
    return null;
  }

  try {
    return await getPlatformTemplate(databases, record.libraryTemplateId);
  } catch {
    return null;
  }
}

export async function saveCabinetPrintTemplateFile(
  storage: StorageClient,
  fileName: string,
  buffer: Buffer,
) {
  const uploaded = await storage.createFile(
    CABINET_PRINT_TEMPLATES_BUCKET_ID,
    ID.unique(),
    InputFile.fromBuffer(buffer, fileName),
  );

  return uploaded.$id;
}

export async function deleteCabinetPrintTemplateFile(storage: StorageClient, fileId?: string | null) {
  if (!fileId) {
    return;
  }

  try {
    await storage.deleteFile(CABINET_PRINT_TEMPLATES_BUCKET_ID, fileId);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }
  }
}

export async function getCabinetPrintTemplateFileBuffer(storage: StorageClient, fileId: string) {
  return Buffer.from(await storage.getFileDownload(CABINET_PRINT_TEMPLATES_BUCKET_ID, fileId));
}

export async function createProjectCabinetAssignmentDocument(
  databases: DatabasesClient,
  input: CabinetAssignmentFormInput,
  actorUserId: string,
  cabinet: ProjectCabinet,
  doctor?: DoctorRecord | null,
  volunteer?: CabinetVolunteerRecord | null,
) {
  const payload = buildProjectCabinetAssignmentPayload(input, actorUserId, cabinet, doctor, volunteer);
  const created = await databases.createDocument(
    DATABASE_ID,
    PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    ID.unique(),
    payload,
  );

  return hydrateCabinetAssignmentRecord(JSON.parse(JSON.stringify(created)) as ProjectCabinetAssignment);
}

export async function updateProjectCabinetAssignmentDocument(
  databases: DatabasesClient,
  assignmentId: string,
  input: CabinetAssignmentFormInput,
  actorUserId: string,
  cabinet: ProjectCabinet,
  doctor?: DoctorRecord | null,
  volunteer?: CabinetVolunteerRecord | null,
) {
  const existing = await getProjectCabinetAssignment(databases, assignmentId);
  const payload = buildProjectCabinetAssignmentPayload(input, actorUserId, cabinet, doctor, volunteer, existing);
  const updated = await databases.updateDocument(
    DATABASE_ID,
    PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
    assignmentId,
    payload,
  );

  return hydrateCabinetAssignmentRecord(JSON.parse(JSON.stringify(updated)) as ProjectCabinetAssignment);
}

export async function deleteProjectCabinetAssignmentDocument(databases: DatabasesClient, assignmentId: string) {
  const existing = await getProjectCabinetAssignment(databases, assignmentId);
  await databases.deleteDocument(DATABASE_ID, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, assignmentId);
  return existing;
}

function buildProjectCabinetPayload(
  input: CabinetFormInput,
  actorUserId: string,
  existing?: ProjectCabinet,
) {
  const sanitized = sanitizeCabinetFormInput(input);
  const now = new Date().toISOString();

  return {
    projectId: sanitized.projectId,
    name: sanitized.name,
    identifier: sanitized.identifier,
    specialty: sanitized.specialty || '',
    ultrasoundAvailable: Boolean(sanitized.ultrasoundAvailable),
    materialsJson: serializeCabinetMaterials(sanitized.materials),
    defaultAssigneeType: 'unassigned',
    defaultDoctorId: '',
    defaultDoctorName: '',
    defaultResponsibleName: '',
    notes: sanitized.notes || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId || actorUserId,
    updatedByUserId: actorUserId,
    nameNormalized: normalizeCabinetName(sanitized.name),
    identifierNormalized: normalizeCabinetIdentifier(sanitized.identifier),
  };
}

function buildProjectCabinetAssignmentPayload(
  input: CabinetAssignmentFormInput,
  actorUserId: string,
  cabinet: ProjectCabinet,
  doctor?: DoctorRecord | null,
  volunteer?: CabinetVolunteerRecord | null,
  existing?: ProjectCabinetAssignment,
) {
  const sanitized = sanitizeCabinetAssignmentInput(input);
  const assigneeType = normalizeCabinetAssigneeType(sanitized.assigneeType);
  const now = new Date().toISOString();

  return {
    projectId: sanitized.projectId,
    cabinetId: sanitized.cabinetId,
    cabinetName: cabinet.name,
    cabinetIdentifier: cabinet.identifier,
    assignmentDate: sanitized.assignmentDate,
    startTime: sanitized.startTime,
    endTime: sanitized.endTime,
    slotKey: buildCabinetSlotKey(sanitized.assignmentDate, sanitized.startTime, sanitized.endTime),
    assigneeType,
    doctorId: assigneeType === 'doctor' ? sanitized.doctorId || '' : '',
    doctorName: assigneeType === 'doctor' ? doctor?.fullName || existing?.doctorName || '' : '',
    volunteerId:
      assigneeType === 'assistant' || assigneeType === 'cabinet-chief'
        ? sanitized.volunteerId || ''
        : '',
    volunteerName:
      assigneeType === 'assistant' || assigneeType === 'cabinet-chief'
        ? buildCabinetVolunteerDisplayName(volunteer) || existing?.volunteerName || ''
        : '',
    volunteerCategory:
      assigneeType === 'assistant' || assigneeType === 'cabinet-chief'
        ? sanitizeResponsibleName(volunteer?.activityCategory) || existing?.volunteerCategory || ''
        : '',
    responsibleName: assigneeType === 'responsible' ? sanitizeResponsibleName(sanitized.responsibleName) : '',
    cabinetSpecialty:
      assigneeType === 'discipline'
        ? sanitized.cabinetSpecialty || cabinet.specialty || ''
        : '',
    materialsJson:
      assigneeType === 'discipline'
        ? serializeCabinetMaterials(sanitized.materials)
        : '[]',
    notes: sanitized.notes || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId || actorUserId,
    updatedByUserId: actorUserId,
  };
}

function buildCabinetVolunteerDisplayName(volunteer?: CabinetVolunteerRecord | null) {
  return [volunteer?.firstName || '', volunteer?.lastName || '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

async function findCabinetPrintTemplateByScope(
  databases: DatabasesClient,
  scopeType: 'project' | 'platform',
  projectId?: string,
) {
  const result = await databases.listDocuments(DATABASE_ID, CABINET_PRINT_TEMPLATES_COLLECTION_ID, [
    Query.equal('scopeType', scopeType),
    Query.equal('projectId', scopeType === 'project' ? projectId || '' : ''),
    Query.orderDesc('$updatedAt'),
    Query.limit(1),
  ]);

  const doc = result.documents[0];
  return doc ? (JSON.parse(JSON.stringify(doc)) as CabinetPrintTemplateRecord) : null;
}

async function ensureAttributes(
  databases: DatabasesClient,
  collectionId: string,
  attributes: readonly {
    key: string;
    type: 'string' | 'boolean';
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
    } else {
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

    await storage.createBucket(bucketId, name, [], false, true, 10 * 1024 * 1024, allowedFileExtensions);
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
      throw new Error(`Cabinet attribute "${collectionId}.${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Cabinet attribute "${collectionId}.${key}" is still processing.`);
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return 0;
}
