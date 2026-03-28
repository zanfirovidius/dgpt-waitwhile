/* eslint-disable @typescript-eslint/no-require-imports */
const { Client, Databases, Permission, Role, Query } = require('node-appwrite');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

type SchemaError = {
  code?: number;
  message?: string;
};

type AttributeSpec =
  | { key: string; type: 'string'; size: number; default?: string }
  | { key: string; type: 'boolean'; default?: boolean };

type IndexSpec = {
  key: string;
  type: string;
  attrs: string[];
};

type DatabasesWithIndex = InstanceType<typeof Databases> & {
  createIndex: (
    databaseId: string,
    collectionId: string,
    key: string,
    type: string,
    attrs: string[],
  ) => Promise<unknown>;
};

const BILLING_BLOCK_MESSAGE =
  'Appwrite Cloud blocked this schema change because the workspace/project has no payment method configured. Add a payment method in Appwrite Console, then rerun this script.';

async function setupVolunteersSchema() {
  const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const API_KEY = process.env.APPWRITE_API_KEY;
  const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
  const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID;
  const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID;
  const PLATFORM_SETTINGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;
  const VOLUNTEER_SETTINGS_COLLECTION_ID =
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_VOLUNTEER_SETTINGS_COLLECTION_ID || 'project_volunteer_settings';
  const VOLUNTEERS_COLLECTION_ID = 'project_volunteers';
  const ATTENDANCE_ENTRIES_COLLECTION_ID =
    process.env.NEXT_PUBLIC_APPWRITE_VOLUNTEER_ATTENDANCE_ENTRIES_COLLECTION_ID || 'volunteer_attendance_entries';

  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !ADMIN_TEAM_ID || !PROJECTS_COLLECTION_ID) {
    console.error('❌ Missing required Appwrite environment variables.');
    process.exitCode = 1;
    return;
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client) as DatabasesWithIndex;

  try {
    console.log('🚀 Starting Appwrite Schema Setup for Project Volunteers...');

    console.log(`🚀 Creating collection "${VOLUNTEER_SETTINGS_COLLECTION_ID}"...`);
    await createCollectionIfMissing(
      databases,
      DATABASE_ID,
      VOLUNTEER_SETTINGS_COLLECTION_ID,
      'Project Volunteer Settings',
      [
        Permission.read(Role.team(ADMIN_TEAM_ID)),
        Permission.write(Role.team(ADMIN_TEAM_ID)),
        Permission.create(Role.team(ADMIN_TEAM_ID)),
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ],
    );

    console.log(`\n--- Setting up attributes for "${VOLUNTEER_SETTINGS_COLLECTION_ID}" ---`);
    await ensureVolunteerSettingsAttribute(databases, DATABASE_ID, VOLUNTEER_SETTINGS_COLLECTION_ID, {
      key: 'projectId',
      type: 'string',
      size: 128,
    });
    await ensureVolunteerSettingsAttribute(databases, DATABASE_ID, VOLUNTEER_SETTINGS_COLLECTION_ID, {
      key: 'waitwhileEmailDomainSuffix',
      type: 'string',
      size: 255,
    });

    const defaultSuffix = await getDefaultWaitwhileEmailDomainSuffix(
      databases,
      DATABASE_ID,
      PLATFORM_SETTINGS_COLLECTION_ID,
    );

    console.log(`\n📝 Backfilling "${VOLUNTEER_SETTINGS_COLLECTION_ID}" from existing projects...`);
    await backfillVolunteerSettings(
      databases,
      DATABASE_ID,
      PROJECTS_COLLECTION_ID,
      VOLUNTEER_SETTINGS_COLLECTION_ID,
      defaultSuffix,
    );

    console.log(`\n🚀 Creating collection "${VOLUNTEERS_COLLECTION_ID}"...`);
    await createCollectionIfMissing(
      databases,
      DATABASE_ID,
      VOLUNTEERS_COLLECTION_ID,
      'Project Volunteers',
      [
        Permission.read(Role.team(ADMIN_TEAM_ID)),
        Permission.write(Role.team(ADMIN_TEAM_ID)),
        Permission.create(Role.team(ADMIN_TEAM_ID)),
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ],
    );

    console.log(`\n--- Setting up attributes for "${VOLUNTEERS_COLLECTION_ID}" ---`);
    const volunteerAttributes: AttributeSpec[] = [
      { key: 'projectId', type: 'string', size: 128 },
      { key: 'firstName', type: 'string', size: 128 },
      { key: 'lastName', type: 'string', size: 128 },
      { key: 'fullNameNormalized', type: 'string', size: 255 },
      { key: 'phone', type: 'string', size: 64 },
      { key: 'email', type: 'string', size: 128 },
      { key: 'activityCategory', type: 'string', size: 64 },
      { key: 'status', type: 'string', size: 32, default: 'active' },
      { key: 'notes', type: 'string', size: 2000 },
      { key: 'waitwhileAccountCreated', type: 'boolean', default: false },
      { key: 'waitwhileCustomerId', type: 'string', size: 128 },
      { key: 'waitwhileEmailUsed', type: 'string', size: 255 },
      { key: 'waitwhileCreatedAt', type: 'string', size: 64 },
      { key: 'waitwhileDeletedAt', type: 'string', size: 64 },
    ];

    for (const attribute of volunteerAttributes) {
      await ensureVolunteerAttribute(databases, DATABASE_ID, VOLUNTEERS_COLLECTION_ID, attribute);
    }

    console.log('\n--- Setting up indexes ---');
    const indexes: IndexSpec[] = [
      { key: 'idx_projectId', type: 'key', attrs: ['projectId'] },
      { key: 'idx_category', type: 'key', attrs: ['activityCategory'] },
      { key: 'idx_name', type: 'key', attrs: ['fullNameNormalized'] },
      { key: 'idx_email', type: 'key', attrs: ['email'] },
      { key: 'idx_phone', type: 'key', attrs: ['phone'] },
      { key: 'idx_waitwhile', type: 'key', attrs: ['waitwhileAccountCreated'] },
    ];

    for (const index of indexes) {
      await ensureIndex(databases, DATABASE_ID, VOLUNTEERS_COLLECTION_ID, index);
    }

    console.log(`\n📝 Ensuring "${ATTENDANCE_ENTRIES_COLLECTION_ID}" has "projectVolunteerId"...`);
    await ensureStringAttribute(
      databases,
      DATABASE_ID,
      ATTENDANCE_ENTRIES_COLLECTION_ID,
      'projectVolunteerId',
      128,
      'attendance entries',
    );

    console.log('📝 Creating index for "projectVolunteerId" in attendance entries...');
    await ensureIndex(databases, DATABASE_ID, ATTENDANCE_ENTRIES_COLLECTION_ID, {
      key: 'idx_volunteerId',
      type: 'key',
      attrs: ['projectVolunteerId'],
    });

    console.log('\n🎉 Project Volunteers schema setup finished!');
  } catch (error) {
    const schemaError = toSchemaError(error);

    console.error('\n❌ CRITICAL ERR:', schemaError.message || 'Unknown error');
    process.exitCode = 1;
  }
}

async function createCollectionIfMissing(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
  collectionName: string,
  permissions: string[],
) {
  try {
    await databases.createCollection(databaseId, collectionId, collectionName, permissions);
    console.log(`✅ Collection "${collectionId}" created.`);
  } catch (error) {
    const schemaError = toSchemaError(error);

    if (schemaError.code === 409) {
      console.log(`ℹ️ Collection "${collectionId}" already exists.`);
      return;
    }

    throw schemaError;
  }
}

async function ensureVolunteerSettingsAttribute(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
  attribute: Extract<AttributeSpec, { type: 'string' }>,
) {
  await ensureStringAttribute(
    databases,
    databaseId,
    collectionId,
    attribute.key,
    attribute.size,
    collectionId,
  );
}

async function ensureVolunteerAttribute(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
  attribute: AttributeSpec,
) {
  try {
    if (attribute.type === 'string') {
      await databases.createStringAttribute(
        databaseId,
        collectionId,
        attribute.key,
        attribute.size,
        false,
        attribute.default,
      );
    } else {
      await databases.createBooleanAttribute(
        databaseId,
        collectionId,
        attribute.key,
        false,
        attribute.default,
      );
    }

    console.log(`✅ Attribute "${attribute.key}" created.`);
    await waitForAttributeAvailability(databases, databaseId, collectionId, attribute.key);
  } catch (error) {
    const schemaError = toSchemaError(error);

    if (schemaError.code === 409) {
      console.log(`ℹ️ Attribute "${attribute.key}" already exists.`);
      await waitForAttributeAvailability(databases, databaseId, collectionId, attribute.key);
      return;
    }

    throw schemaError;
  }
}

async function ensureStringAttribute(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
  key: string,
  size: number,
  collectionLabel: string,
) {
  try {
    await databases.createStringAttribute(databaseId, collectionId, key, size, false);
    console.log(`✅ Added "${key}" to ${collectionLabel}.`);
    await waitForAttributeAvailability(databases, databaseId, collectionId, key);
  } catch (error) {
    const schemaError = toSchemaError(error);

    if (schemaError.code === 409) {
      console.log(`ℹ️ Attribute "${key}" already exists in ${collectionLabel}.`);
      await waitForAttributeAvailability(databases, databaseId, collectionId, key);
      return;
    }

    throw schemaError;
  }
}

async function ensureIndex(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
  index: IndexSpec,
) {
  try {
    await databases.createIndex(databaseId, collectionId, index.key, index.type, index.attrs);
    console.log(`✅ Index "${index.key}" created.`);
  } catch (error) {
    const schemaError = toSchemaError(error);

    if (schemaError.code === 409) {
      console.log(`ℹ️ Index "${index.key}" already exists.`);
      return;
    }

    throw schemaError;
  }
}

async function backfillVolunteerSettings(
  databases: DatabasesWithIndex,
  databaseId: string,
  projectsCollectionId: string,
  settingsCollectionId: string,
  defaultSuffix: string,
) {
  const projects = await listAllProjectDocuments(databases, databaseId, projectsCollectionId);

  if (projects.length === 0) {
    console.log('ℹ️ No projects found to backfill.');
    return;
  }

  for (const project of projects) {
    const suffix = normalizeWaitwhileEmailDomainSuffix(
      (project as { waitwhileEmailDomainSuffix?: string }).waitwhileEmailDomainSuffix,
      defaultSuffix,
    );
    const payload = {
      projectId: project.$id,
      waitwhileEmailDomainSuffix: suffix,
    };

    try {
      await databases.createDocument(databaseId, settingsCollectionId, project.$id, payload);
      console.log(`✅ Created volunteer settings for project "${project.$id}".`);
    } catch (error) {
      const schemaError = toSchemaError(error);

      if (schemaError.code === 409) {
        await databases.updateDocument(databaseId, settingsCollectionId, project.$id, payload);
        console.log(`ℹ️ Synced volunteer settings for project "${project.$id}".`);
        continue;
      }

      throw schemaError;
    }
  }
}

async function listAllProjectDocuments(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
) {
  const documents: Array<{ $id: string; waitwhileEmailDomainSuffix?: string }> = [];
  let cursorAfter: string | null = null;

  while (true) {
    const queries = [Query.limit(100)];

    if (cursorAfter) {
      queries.push(Query.cursorAfter(cursorAfter));
    }

    const res = await databases.listDocuments(databaseId, collectionId, queries);

    documents.push(...(res.documents as Array<{ $id: string; waitwhileEmailDomainSuffix?: string }>));

    if (res.documents.length < 100) {
      return documents;
    }

    cursorAfter = res.documents[res.documents.length - 1].$id;
  }
}

async function getDefaultWaitwhileEmailDomainSuffix(
  databases: DatabasesWithIndex,
  databaseId: string,
  platformSettingsCollectionId?: string,
) {
  if (platformSettingsCollectionId) {
    try {
      const res = await databases.listDocuments(databaseId, platformSettingsCollectionId, [Query.limit(1)]);

      if (res.total > 0) {
        const defaultSuffix = (res.documents[0] as { defaultWaitwhileEmailDomainSuffix?: string })
          .defaultWaitwhileEmailDomainSuffix;

        return normalizeWaitwhileEmailDomainSuffix(defaultSuffix);
      }
    } catch {
      console.warn('⚠️ Could not read platform settings default. Falling back to @dgpt.ro.');
    }
  }

  return '@dgpt.ro';
}

function normalizeWaitwhileEmailDomainSuffix(value?: string | null, fallback = '@dgpt.ro') {
  const rawValue = (value ?? '').trim();
  const normalized = rawValue || fallback;

  return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

async function waitForAttributeAvailability(
  databases: DatabasesWithIndex,
  databaseId: string,
  collectionId: string,
  key: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const attribute = await databases.getAttribute(databaseId, collectionId, key);

    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Attribute "${key}" in "${collectionId}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Attribute "${key}" in "${collectionId}" is still processing`);
}

function toSchemaError(error: unknown): SchemaError {
  const candidate = (error ?? {}) as SchemaError;
  const message = candidate.message || 'Unknown error';

  if (isBillingBlocked(message)) {
    return {
      ...candidate,
      message: BILLING_BLOCK_MESSAGE,
    };
  }

  return {
    ...candidate,
    message,
  };
}

function isBillingBlocked(message: string) {
  return message.toLowerCase().includes('payment method not found');
}

setupVolunteersSchema();
