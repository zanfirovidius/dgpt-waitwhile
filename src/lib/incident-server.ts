import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { createAdminClient } from '@/lib/appwrite-server';
import {
  INCIDENT_AFFECTED_CATEGORY_OPTIONS,
  INCIDENT_DATA_TYPE_OPTIONS,
  INCIDENT_NOTIFICATION_SUBJECT_PREFIX,
  INCIDENT_RISK_LEVEL_OPTIONS,
  INCIDENT_STATUS_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
} from '@/lib/incident-defaults';
import type {
  IncidentAuditLog,
  IncidentNotificationStatus,
  IncidentOrganizerSnapshot,
  IncidentRecord,
  IncidentReportContext,
} from '@/lib/incident-types';
import { normalizeName } from '@/lib/name-utils';

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type DatabasesClient = AdminClient['databases'];
type StorageClient = AdminClient['storage'];
type UsersClient = AdminClient['users'];
type MessagingClient = AdminClient['messaging'];

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const FEEDBACK_CONFIG_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!;
const PLATFORM_SETTINGS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID!;
const AUDIT_LOGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_AUDIT_LOGS_COLLECTION_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

export const INCIDENTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_INCIDENTS_COLLECTION_ID || 'project_incidents';
export const INCIDENT_ARCHIVES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_INCIDENT_ARCHIVES_BUCKET_ID || 'incident_archives';

type ProjectSnapshot = {
  $id: string;
  name?: string;
  eventName?: string;
  projectSlug?: string;
  locationName?: string;
  city?: string;
  venue?: string;
};

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

const INCIDENT_INDEXES = [
  {
    key: 'idx_inc_proj_rep',
    type: 'key',
    attributes: ['projectId', 'reportedAt'],
    orders: ['asc', 'desc'],
  },
  {
    key: 'idx_inc_status',
    type: 'key',
    attributes: ['status'],
    orders: ['asc'],
  },
  {
    key: 'idx_inc_risk',
    type: 'key',
    attributes: ['riskLevel'],
    orders: ['asc'],
  },
  {
    key: 'idx_inc_slug',
    type: 'key',
    attributes: ['projectSlugSnapshot'],
    orders: ['asc'],
  },
] as const;

export async function ensureIncidentSchema(databases: DatabasesClient) {
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

  for (const index of INCIDENT_INDEXES) {
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
        INCIDENTS_COLLECTION_ID,
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

export async function ensureIncidentBuckets(storage: StorageClient) {
  await ensureBucket(storage, INCIDENT_ARCHIVES_BUCKET_ID, 'Incident Archives', ['pdf']);
}

export async function readPublicIncidentProjectContext(projectSlug: string) {
  const { databases } = await createAdminClient();
  const projectRes = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
    Query.equal('projectSlug', projectSlug),
    Query.limit(1),
  ]);

  if (projectRes.total === 0) {
    throw new Error('Proiectul nu a fost găsit.');
  }

  const project = JSON.parse(JSON.stringify(projectRes.documents[0])) as ProjectSnapshot;
  const organizer = await readOrganizerSnapshot(databases, project.$id);

  return {
    project,
    organizer,
  };
}

export async function readProjectIncidentSnapshot(
  databases: DatabasesClient,
  projectId: string,
) {
  const project = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, projectId);
  return JSON.parse(JSON.stringify(project)) as ProjectSnapshot;
}

export async function readOrganizerSnapshot(
  databases: DatabasesClient,
  projectId: string,
): Promise<IncidentOrganizerSnapshot> {
  try {
    const feedbackConfig = await databases.getDocument(
      DATABASE_ID,
      FEEDBACK_CONFIG_COLLECTION_ID,
      projectId,
    );

    return JSON.parse(JSON.stringify(feedbackConfig)) as IncidentOrganizerSnapshot;
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }
  }

  const settingsRes = await databases.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, [
    Query.limit(1),
  ]);

  if (settingsRes.total === 0) {
    return {};
  }

  return JSON.parse(JSON.stringify(settingsRes.documents[0])) as IncidentOrganizerSnapshot;
}

export async function listProjectIncidents(
  databases: DatabasesClient,
  projectId: string,
) {
  const res = await databases.listDocuments(DATABASE_ID, INCIDENTS_COLLECTION_ID, [
    Query.equal('projectId', projectId),
    Query.orderDesc('reportedAt'),
    Query.orderDesc('$createdAt'),
    Query.limit(500),
  ]);

  return JSON.parse(JSON.stringify(res.documents)) as IncidentRecord[];
}

export async function listIncidentAuditLogs(
  databases: DatabasesClient,
  incidentId: string,
) {
  try {
    const res = await databases.listDocuments(DATABASE_ID, AUDIT_LOGS_COLLECTION_ID, [
      Query.equal('entityType', 'project_incident'),
      Query.equal('entityId', incidentId),
      Query.orderDesc('$createdAt'),
      Query.limit(200),
    ]);

    return JSON.parse(JSON.stringify(res.documents)) as IncidentAuditLog[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) {
      return [];
    }

    throw error;
  }
}

export async function loadIncidentReportContext(incidentId: string): Promise<IncidentReportContext> {
  const { databases } = await createAdminClient();
  const incidentDoc = await databases.getDocument(DATABASE_ID, INCIDENTS_COLLECTION_ID, incidentId);
  const incident = JSON.parse(JSON.stringify(incidentDoc)) as IncidentRecord;
  const project = await readProjectIncidentSnapshot(databases, incident.projectId);
  const organizer = await readOrganizerSnapshot(databases, incident.projectId);

  return {
    incident,
    projectName: project.eventName || project.name || incident.eventName,
    projectSlug: project.projectSlug || incident.projectSlugSnapshot || '',
    organizer,
  };
}

export async function saveIncidentArchivePdf(
  storage: StorageClient,
  pdfBuffer: Buffer,
  fileName: string,
) {
  const file = InputFile.fromBuffer(pdfBuffer, fileName);
  const uploaded = await storage.createFile(INCIDENT_ARCHIVES_BUCKET_ID, ID.unique(), file);
  return uploaded.$id;
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
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }
  }
}

export async function writeIncidentAuditLog(data: {
  databases: DatabasesClient;
  entityId: string;
  action: string;
  actorUserId: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await data.databases.createDocument(DATABASE_ID, AUDIT_LOGS_COLLECTION_ID, ID.unique(), {
      entityType: 'project_incident',
      entityId: data.entityId,
      action: data.action,
      actorUserId: data.actorUserId,
      beforeJson: serializeForAudit(data.before),
      afterJson: serializeForAudit(data.after),
    });
  } catch (error) {
    console.warn('[Incidents] audit log warning:', error);
  }
}

export async function notifyDpoOfIncident(options: {
  users: UsersClient;
  messaging: MessagingClient;
  incident: IncidentRecord;
  incidentUrl?: string;
}): Promise<{
  status: IncidentNotificationStatus;
  sentAt?: string;
  error?: string;
  messageId?: string;
}> {
  const dpoEmail = options.incident.dpoEmailSnapshot?.trim().toLowerCase();
  if (!dpoEmail) {
    return { status: 'missing_recipient', error: 'Nu există un email DPO configurat pentru proiect.' };
  }

  const userRes = await options.users.list({
    queries: [Query.equal('email', dpoEmail), Query.limit(1)],
  });

  if (userRes.total === 0) {
    return {
      status: 'missing_recipient',
      error: `Nu există un utilizator Appwrite asociat emailului ${dpoEmail}.`,
    };
  }

  const incidentUrl = options.incidentUrl || '';
  const messageBody = [
    `<p>A fost raportat un incident GDPR / securitate nou.</p>`,
    `<ul>`,
    `<li><strong>ID incident:</strong> ${options.incident.$id || '-'}</li>`,
    `<li><strong>Eveniment:</strong> ${escapeHtml(options.incident.eventName || '-')}</li>`,
    `<li><strong>Locație:</strong> ${escapeHtml(options.incident.location || '-')}</li>`,
    `<li><strong>Tip:</strong> ${escapeHtml(options.incident.incidentType || '-')}</li>`,
    `<li><strong>Raportat la:</strong> ${escapeHtml(options.incident.reportedAt || '-')}</li>`,
    `</ul>`,
    `<p>${escapeHtml(options.incident.description || '-')}</p>`,
    incidentUrl
      ? `<p><a href="${incidentUrl}">Deschide incidentul în platformă</a></p>`
      : '',
  ].join('');

  try {
    const response = await options.messaging.createEmail({
      messageId: ID.unique(),
      subject: `${INCIDENT_NOTIFICATION_SUBJECT_PREFIX} #${options.incident.$id || '-'}`,
      content: messageBody,
      users: [userRes.users[0].$id],
      html: true,
    });

    return {
      status: 'sent',
      sentAt: new Date().toISOString(),
      messageId: response.$id,
    };
  } catch (error: unknown) {
    return {
      status: 'failed',
      error: getErrorMessage(error, 'Nu am putut trimite notificarea email către DPO.'),
    };
  }
}

export function normalizeIncidentType(value?: string | null) {
  const normalized = (value || '').trim();
  return INCIDENT_TYPE_OPTIONS.includes(normalized as (typeof INCIDENT_TYPE_OPTIONS)[number])
    ? normalized
    : INCIDENT_TYPE_OPTIONS[0];
}

export function normalizeIncidentStatus(value?: string | null) {
  const normalized = (value || '').trim().toLowerCase();
  return INCIDENT_STATUS_OPTIONS.includes(normalized as (typeof INCIDENT_STATUS_OPTIONS)[number])
    ? (normalized as IncidentRecord['status'])
    : 'new';
}

export function normalizeRiskLevel(value?: string | null) {
  const normalized = (value || '').trim().toLowerCase();
  return INCIDENT_RISK_LEVEL_OPTIONS.includes(normalized as (typeof INCIDENT_RISK_LEVEL_OPTIONS)[number])
    ? normalized
    : undefined;
}

export function normalizeAffectedCategories(values?: string[] | null) {
  const normalized = (values || [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) =>
      INCIDENT_AFFECTED_CATEGORY_OPTIONS.includes(
        value as (typeof INCIDENT_AFFECTED_CATEGORY_OPTIONS)[number],
      ),
    );

  return Array.from(new Set(normalized));
}

export function normalizeDataTypes(values?: string[] | null) {
  const normalized = (values || [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) =>
      INCIDENT_DATA_TYPE_OPTIONS.includes(value as (typeof INCIDENT_DATA_TYPE_OPTIONS)[number]),
    );

  return Array.from(new Set(normalized));
}

export function sanitizeIncidentText(value?: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function sanitizeIncidentLongText(value?: string | null) {
  return (value || '').replace(/\r\n/g, '\n').trim();
}

export function sanitizeAffectedCount(value?: number | string | null) {
  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value || '').replace(/[^\d]/g, '').trim() || 0);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Math.floor(numeric);
}

export function buildIncidentArchiveFileName(location: string, discoveredAt: string, incidentId?: string) {
  const locationSegment = sanitizeFileNameSegment(location || 'incident');
  const dateSegment = sanitizeFileNameSegment((discoveredAt || new Date().toISOString()).slice(0, 10));
  const incidentSegment = sanitizeFileNameSegment(incidentId || 'record');
  return `DGPAT_GDPR-Incident_${locationSegment}_${dateSegment}_${incidentSegment}.pdf`;
}

export function buildIncidentAdminUrl(projectId: string, incidentId: string) {
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const path = `/projects/${projectId}/incidents/${incidentId}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

function sanitizeFileNameSegment(value: string) {
  const normalized = normalizeName(value).replace(/\s+/g, '-');
  return normalized || 'incident';
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
      }

      continue;
    }

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
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }

    createdKeys.push(attribute.key);
  }

  for (const key of updatedKeys) {
    await waitForAttributeAvailability(databases, collectionId, key);
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
      throw new Error(`Incident attribute "${collectionId}.${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Incident attribute "${collectionId}.${key}" is still processing.`);
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

function serializeForAudit(value: unknown) {
  if (value === undefined) {
    return '';
  }

  const serialized = JSON.stringify(value);
  if (!serialized) {
    return '';
  }

  return serialized.length > 1500 ? `${serialized.slice(0, 1497)}...` : serialized;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return Number((error as { code?: number }).code);
  }

  return undefined;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  return fallback;
}
