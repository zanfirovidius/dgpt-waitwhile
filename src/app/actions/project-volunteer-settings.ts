'use server';

import { Permission, Role } from 'node-appwrite';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { getPlatformSettings } from './platform';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;
const PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID || 'project_volunteer_settings';

type DatabasesClient = Awaited<ReturnType<typeof createAdminClient>>['databases'];
type AppwriteLikeError = {
  code?: number;
  message?: string;
};

export interface ProjectVolunteerSettings {
  $id?: string;
  projectId: string;
  waitwhileEmailDomainSuffix: string;
}

function normalizeWaitwhileEmailDomainSuffix(value?: string | null, fallback = '@dgpt.ro') {
  const rawValue = (value ?? '').trim();
  const normalized = rawValue || fallback;

  return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

export async function getProjectVolunteerSettings(
  projectId: string,
  options: { legacySuffix?: string; useAdmin?: boolean } = {},
): Promise<{ success: boolean; data?: ProjectVolunteerSettings; error?: string }> {
  try {
    const databases = await getDatabasesClient(options.useAdmin);
    const fallbackSuffix = await resolveFallbackSuffix(options.legacySuffix);
    const existing = await readProjectVolunteerSettingsDocument(databases, projectId);

    if (!existing) {
      return {
        success: true,
        data: {
          $id: projectId,
          projectId,
          waitwhileEmailDomainSuffix: fallbackSuffix,
        },
      };
    }

    return {
      success: true,
      data: {
        ...existing,
        waitwhileEmailDomainSuffix: normalizeWaitwhileEmailDomainSuffix(
          existing.waitwhileEmailDomainSuffix,
          fallbackSuffix,
        ),
      },
    };
  } catch (err: unknown) {
    console.error('[ProjectVolunteerSettings] get error:', err);
    return {
      success: false,
      error: getErrorMessage(err, 'Failed to fetch project volunteer settings'),
    };
  }
}

export async function resolveProjectWaitwhileEmailDomainSuffix(
  projectId: string,
  legacySuffix?: string,
  options: { useAdmin?: boolean } = {},
) {
  const res = await getProjectVolunteerSettings(projectId, {
    legacySuffix,
    useAdmin: options.useAdmin,
  });

  if (res.success && res.data) {
    return res.data.waitwhileEmailDomainSuffix;
  }

  return resolveFallbackSuffix(legacySuffix);
}

export async function upsertProjectVolunteerSettings(
  projectId: string,
  data: Partial<ProjectVolunteerSettings>,
  options: { legacySuffix?: string; useAdmin?: boolean } = {},
): Promise<{ success: boolean; data?: ProjectVolunteerSettings; error?: string }> {
  try {
    const { databases: adminDatabases } = await createAdminClient();
    await ensureProjectVolunteerSettingsCollection(adminDatabases);

    const databases = options.useAdmin
      ? adminDatabases
      : (await createSessionClient()).databases;

    const fallbackSuffix = await resolveFallbackSuffix(options.legacySuffix);
    const waitwhileEmailDomainSuffix = normalizeWaitwhileEmailDomainSuffix(
      data.waitwhileEmailDomainSuffix,
      fallbackSuffix,
    );
    const payload: ProjectVolunteerSettings = {
      projectId,
      waitwhileEmailDomainSuffix,
    };
    const existing = await readProjectVolunteerSettingsDocument(databases, projectId);

    if (existing) {
      await databases.updateDocument(
        DATABASE_ID,
        PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID,
        projectId,
        payload,
      );
    } else {
      await databases.createDocument(
        DATABASE_ID,
        PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID,
        projectId,
        payload,
      );
    }

    return {
      success: true,
      data: {
        $id: projectId,
        ...payload,
      },
    };
  } catch (err: unknown) {
    console.error('[ProjectVolunteerSettings] upsert error:', err);
    return {
      success: false,
      error: getErrorMessage(err, 'Failed to update project volunteer settings'),
    };
  }
}

export async function deleteProjectVolunteerSettings(
  projectId: string,
  options: { useAdmin?: boolean } = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    const databases = await getDatabasesClient(options.useAdmin);
    await databases.deleteDocument(DATABASE_ID, PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID, projectId);
    return { success: true };
  } catch (err: unknown) {
    if (getErrorCode(err) === 404) {
      return { success: true };
    }

    console.error('[ProjectVolunteerSettings] delete error:', err);
    return {
      success: false,
      error: getErrorMessage(err, 'Failed to delete project volunteer settings'),
    };
  }
}

async function ensureProjectVolunteerSettingsCollection(databases: DatabasesClient) {
  try {
    await databases.getCollection(DATABASE_ID, PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 404) {
      throw err;
    }

    await databases.createCollection(
      DATABASE_ID,
      PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID,
      'Project Volunteer Settings',
      [
        Permission.read(Role.team(ADMIN_TEAM_ID)),
        Permission.write(Role.team(ADMIN_TEAM_ID)),
        Permission.create(Role.team(ADMIN_TEAM_ID)),
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ],
    );
  }

  const attributes = await databases.listAttributes(DATABASE_ID, PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID);
  const existing = new Map(attributes.attributes.map((attribute) => [attribute.key, attribute]));
  const requiredAttributes = [
    { key: 'projectId', size: 128 },
    { key: 'waitwhileEmailDomainSuffix', size: 255 },
  ];

  for (const attribute of requiredAttributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    await databases.createStringAttribute(
      DATABASE_ID,
      PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID,
      attribute.key,
      attribute.size,
      false,
    );
  }

  await Promise.all(
    requiredAttributes.map(async ({ key }) => {
      if (existing.get(key)?.status === 'available') {
        return;
      }

      await waitForAttributeAvailability(databases, key);
    }),
  );
}

async function readProjectVolunteerSettingsDocument(
  databases: DatabasesClient,
  projectId: string,
): Promise<ProjectVolunteerSettings | null> {
  try {
    const doc = await databases.getDocument(
      DATABASE_ID,
      PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID,
      projectId,
    );

    return JSON.parse(JSON.stringify(doc)) as ProjectVolunteerSettings;
  } catch (err: unknown) {
    if (getErrorCode(err) === 404) {
      return null;
    }

    throw err;
  }
}

async function resolveFallbackSuffix(legacySuffix?: string) {
  if (legacySuffix) {
    return normalizeWaitwhileEmailDomainSuffix(legacySuffix);
  }

  const settingsRes = await getPlatformSettings();
  return normalizeWaitwhileEmailDomainSuffix(settingsRes.data?.defaultWaitwhileEmailDomainSuffix);
}

async function getDatabasesClient(useAdmin?: boolean) {
  if (useAdmin) {
    return (await createAdminClient()).databases;
  }

  return (await createSessionClient()).databases;
}

async function waitForAttributeAvailability(databases: DatabasesClient, key: string) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const attribute = await databases.getAttribute(
      DATABASE_ID,
      PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID,
      key,
    );

    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Project volunteer settings attribute "${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Project volunteer settings attribute "${key}" is still processing`);
}

function getErrorCode(error: unknown) {
  return toAppwriteLikeError(error).code;
}

function getErrorMessage(error: unknown, fallback: string) {
  return toAppwriteLikeError(error).message || fallback;
}

function toAppwriteLikeError(error: unknown): AppwriteLikeError {
  if (error instanceof Error) {
    return error as AppwriteLikeError;
  }

  if (typeof error === 'object' && error !== null) {
    return error as AppwriteLikeError;
  }

  return { message: undefined };
}
