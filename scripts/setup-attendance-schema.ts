import { Client, Databases, DatabasesIndexType, OrderBy, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function setupAttendanceSchema() {
  const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const API_KEY = process.env.APPWRITE_API_KEY;
  const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
  const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

  console.log('--- ENV CHECK ---');
  console.log('ENDPOINT:', ENDPOINT);
  console.log('PROJECT ID:', PROJECT_ID);
  console.log('API_KEY PRESENT:', !!API_KEY);
  
  if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
    console.error('❌ Missing required environment variables!');
    return;
  }

  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

  const databases = new Databases(client);

  try {
    console.log('🚀 Starting Appwrite Schema Setup for Volunteer Attendance...');

    // 1. Collections to setup
    const collections = [
      { id: 'project_attendance_config', name: 'Project Attendance Config', permissions: [
        Permission.read(Role.any()),
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.write(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ]},
      { id: 'volunteer_attendance_sessions', name: 'Volunteer Attendance Sessions', permissions: [
        Permission.read(Role.team(ADMIN_TEAM_ID)),
        Permission.write(Role.team(ADMIN_TEAM_ID)),
      ]},
      { id: 'volunteer_attendance_entries', name: 'Volunteer Attendance Entries', permissions: [
        Permission.create(Role.any()),
        Permission.read(Role.team(ADMIN_TEAM_ID)),
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ]}
    ];

    for (const col of collections) {
      try {
        console.log(`🚀 Creating collection "${col.id}"...`);
        await databases.createCollection(DATABASE_ID, col.id, col.name, col.permissions);
        console.log(`✅ Collection "${col.id}" created.`);
      } catch (error: unknown) {
        if (isAppwriteConflict(error)) console.log(`ℹ️ Collection "${col.id}" already exists.`);
        else throw error;
      }
    }

    // 2. Attributes for project_attendance_config
    console.log('\n--- Setting up attributes for "project_attendance_config" ---');
    const configAttrs = [
      { key: 'projectId', type: 'string', size: 128 },
      { key: 'projectSlug', type: 'string', size: 128 },
      { key: 'attendanceEnabled', type: 'boolean', default: false },
      { key: 'attendanceAccessMode', type: 'string', size: 32, default: 'token' },
      { key: 'attendanceAccessToken', type: 'string', size: 128 },
      { key: 'attendanceAccessPinHash', type: 'string', size: 255 },
      { key: 'instructions', type: 'string', size: 1500 },
      { key: 'privacyNotice', type: 'string', size: 1500 },
      { key: 'successMessageCheckIn', type: 'string', size: 800 },
      { key: 'successMessageCheckOut', type: 'string', size: 800 },
      { key: 'coordinatorValidationRequired', type: 'boolean', default: true },
      { key: 'signatureRequiredAtCheckout', type: 'boolean', default: true },
      { key: 'breakFieldEnabled', type: 'boolean', default: true },
      { key: 'attendanceRoles', type: 'string-array', size: 128 },
      { key: 'setupCompleted', type: 'boolean', default: false },
      { key: 'setupMissingItemsJson', type: 'string', size: 2000 },
    ];

    for (const attr of configAttrs) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(DATABASE_ID, 'project_attendance_config', attr.key, attr.size!, false, attr.default as string);
        } else if (attr.type === 'string-array') {
          await databases.createStringAttribute(DATABASE_ID, 'project_attendance_config', attr.key, attr.size!, false, undefined, true);
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(DATABASE_ID, 'project_attendance_config', attr.key, false, attr.default as boolean);
        }
        console.log(`✅ Config attribute "${attr.key}" created.`);
      } catch (error: unknown) {
        if (!isAppwriteConflict(error)) {
          console.error(`❌ Error creating config attribute "${attr.key}":`, getErrorMessage(error));
        }
      }
    }

    // 3. Attributes for volunteer_attendance_sessions
    console.log('\n--- Setting up attributes for "volunteer_attendance_sessions" ---');
    const sessionAttrs = [
        { key: 'projectId', type: 'string', size: 128 },
        { key: 'volunteerFullName', type: 'string', size: 255 },
        { key: 'token', type: 'string', size: 128 },
        { key: 'lastAction', type: 'string', size: 32 },
        { key: 'lastActionAt', type: 'string', size: 64 },
    ];

    for (const attr of sessionAttrs) {
        try {
            await databases.createStringAttribute(DATABASE_ID, 'volunteer_attendance_sessions', attr.key, attr.size, false);
            console.log(`✅ Session attribute "${attr.key}" created.`);
        } catch (error: unknown) {
            if (!isAppwriteConflict(error)) {
              console.error(`❌ Error creating session attribute "${attr.key}":`, getErrorMessage(error));
            }
        }
    }

    // 4. Attributes for volunteer_attendance_entries
    console.log('\n--- Setting up attributes for "volunteer_attendance_entries" ---');
    const entryAttrs = [
      { key: 'projectId', type: 'string', size: 128 },
      { key: 'sessionId', type: 'string', size: 128 },
      { key: 'attendanceDate', type: 'string', size: 32 },
      { key: 'volunteerFullName', type: 'string', size: 255 },
      { key: 'volunteerEmail', type: 'string', size: 128 },
      { key: 'volunteerPhone', type: 'string', size: 64 },
      { key: 'cnp', type: 'string', size: 32 },
      { key: 'identitySeries', type: 'string', size: 32 },
      { key: 'identityNumber', type: 'string', size: 32 },
      { key: 'departmentRole', type: 'string', size: 128 },
      { key: 'checkInAt', type: 'string', size: 64 },
      { key: 'checkOutAt', type: 'string', size: 64 },
      { key: 'breakMinutes', type: 'integer', default: 0 },
      { key: 'totalMinutes', type: 'integer', default: 0 },
      { key: 'totalHoursDecimal', type: 'float', default: 0.0 },
      { key: 'signatureImageId', type: 'string', size: 1000 },
      { key: 'checkOutConfirmed', type: 'boolean', default: false },
      { key: 'coordinatorValidated', type: 'boolean', default: false },
      { key: 'coordinatorValidatedAt', type: 'string', size: 64 },
      { key: 'coordinatorValidatedByUserId', type: 'string', size: 128 },
      { key: 'notes', type: 'string', size: 1500 },
      { key: 'projectSlugSnapshot', type: 'string', size: 128 },
      { key: 'eventNameSnapshot', type: 'string', size: 255 },
      { key: 'citySnapshot', type: 'string', size: 128 },
      { key: 'venueSnapshot', type: 'string', size: 128 },
    ];

    for (const attr of entryAttrs) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(DATABASE_ID, 'volunteer_attendance_entries', attr.key, attr.size!, false);
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(DATABASE_ID, 'volunteer_attendance_entries', attr.key, false, 0, 100000, attr.default as number);
        } else if (attr.type === 'float') {
          await databases.createFloatAttribute(DATABASE_ID, 'volunteer_attendance_entries', attr.key, false, 0, 100000, attr.default as number);
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(DATABASE_ID, 'volunteer_attendance_entries', attr.key, false, attr.default as boolean);
        }
        console.log(`✅ Entry attribute "${attr.key}" created.`);
      } catch (error: unknown) {
        if (!isAppwriteConflict(error)) {
          console.error(`❌ Error creating entry attribute "${attr.key}":`, getErrorMessage(error));
        }
      }
    }

	    // 5. Indexes
	    console.log('\n--- Setting up indexes ---');
	    const indexes = [
	        { col: 'project_attendance_config', key: 'idx_slug', type: DatabasesIndexType.Unique, attrs: ['projectSlug'], orders: [OrderBy.Asc] },
	        { col: 'volunteer_attendance_entries', key: 'idx_proj_date', type: DatabasesIndexType.Key, attrs: ['projectId', 'attendanceDate'], orders: [OrderBy.Asc, OrderBy.Desc] },
	        { col: 'volunteer_attendance_entries', key: 'idx_vol_name', type: DatabasesIndexType.Key, attrs: ['volunteerFullName'], orders: [OrderBy.Asc] },
	    ];

    for (const idx of indexes) {
        try {
            await databases.createIndex(DATABASE_ID, idx.col, idx.key, idx.type, idx.attrs, idx.orders);
            console.log(`✅ Index "${idx.key}" created for "${idx.col}".`);
        } catch (error: unknown) {
            if (!isAppwriteConflict(error)) {
              console.error(`❌ Error creating index "${idx.key}":`, getErrorMessage(error));
            }
        }
    }

    console.log('\n🎉 Attendance schema setup finished!');

  } catch (error: unknown) {
    console.error('\n❌ CRITICAL ERR:', getErrorMessage(error));
  }
}

setupAttendanceSchema();

function isAppwriteConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Number((error as { code?: number }).code) === 409
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
