import { Client, Databases, Permission, Role, ID } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;

async function setupSchema() {
  try {
    console.log('🚀 Starting Appwrite Schema Setup for Feedback Feature...');

    // 1. Cleanup existing collections (except projects)
    const collectionsToReset = ['platform_settings', 'feedback_submissions', 'audit_logs'];
    for (const id of collectionsToReset) {
      try {
        console.log(`🧹 Deleting existing collection "${id}"...`);
        await databases.deleteCollection(DATABASE_ID, id);
      } catch (e) {}
    }

    // Wait a bit for Appwrite to process deletions
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. Platform Settings (Singleton)
    console.log('\n--- Setting up "platform_settings" ---');
    await databases.createCollection(DATABASE_ID, 'platform_settings', 'Platform Settings', [
      Permission.read(Role.team(ADMIN_TEAM_ID)),
      Permission.update(Role.team(ADMIN_TEAM_ID)),
    ]);

    const settingsAttrs = [
      { key: 'operatorName', type: 'string', size: 128 },
      { key: 'operatorLegalName', type: 'string', size: 128 },
      { key: 'operatorTaxId', type: 'string', size: 64 },
      { key: 'operatorAddress', type: 'string', size: 255 },
      { key: 'operatorPhone', type: 'string', size: 32 },
      { key: 'dpoName', type: 'string', size: 128 },
      { key: 'dpoEmail', type: 'string', size: 128 },
      { key: 'defaultFeedbackRetentionDays', type: 'integer', default: 365 },
      { key: 'defaultPrivacyNoticeTemplate', type: 'string', size: 1500 },
      { key: 'defaultFeedbackFormTitle', type: 'string', size: 128 },
      { key: 'defaultFeedbackIntroText', type: 'string', size: 800 },
      { key: 'defaultFeedbackConsentText', type: 'string', size: 800 },
      { key: 'defaultFeedbackSuccessMessage', type: 'string', size: 800 },
      { key: 'defaultPublicFormStatusOnCreate', type: 'string', size: 32, default: 'active' },
    ];

    for (const attr of settingsAttrs) {
       if (attr.type === 'string') {
         await databases.createStringAttribute(DATABASE_ID, 'platform_settings', attr.key, attr.size!, false, attr.default as string);
       } else if (attr.type === 'integer') {
         await databases.createIntegerAttribute(DATABASE_ID, 'platform_settings', attr.key, false, 0, 10000, attr.default as number);
       }
       console.log(`✅ Attribute "${attr.key}" created.`);
    }

    // 2. Feedback Submissions
    console.log('\n--- Setting up "feedback_submissions" ---');
    await databases.createCollection(DATABASE_ID, 'feedback_submissions', 'Feedback Submissions', [
      Permission.create(Role.any()), // Public can create
      Permission.read(Role.team(ADMIN_TEAM_ID)),
      Permission.update(Role.team(ADMIN_TEAM_ID)),
      Permission.delete(Role.team(ADMIN_TEAM_ID)),
    ]);

    const feedbackAttrs = [
      { key: 'projectId', type: 'string', size: 50 },
      { key: 'projectSlugSnapshot', type: 'string', size: 128 },
      { key: 'eventNameSnapshot', type: 'string', size: 255 },
      { key: 'citySnapshot', type: 'string', size: 128 },
      { key: 'venueSnapshot', type: 'string', size: 128 },
      { key: 'operatorNameSnapshot', type: 'string', size: 128 },
      { key: 'participationDate', type: 'string', size: 32 },
      { key: 'subLocation', type: 'string', size: 128 },
      { key: 'category', type: 'string', size: 64 }, 
      { key: 'message', type: 'string', size: 1500 },
      { key: 'fullName', type: 'string', size: 128 },
      { key: 'email', type: 'string', size: 128 },
      { key: 'phone', type: 'string', size: 64 },
      { key: 'consentToBeContacted', type: 'boolean', default: false },
      { key: 'isAnonymous', type: 'boolean', default: true },
      { key: 'status', type: 'string', size: 32, default: 'new' }, 
      { key: 'sourceIpHash', type: 'string', size: 128 },
      { key: 'userAgentHash', type: 'string', size: 255 },
    ];

    for (const attr of feedbackAttrs) {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, 'feedback_submissions', attr.key, attr.size!, false, attr.default as string);
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(DATABASE_ID, 'feedback_submissions', attr.key, false, attr.default as boolean);
      }
      console.log(`✅ Attribute "${attr.key}" created.`);
    }

    // 3. Audit Logs
    console.log('\n--- Setting up "audit_logs" ---');
    await databases.createCollection(DATABASE_ID, 'audit_logs', 'Audit Logs', [
      Permission.read(Role.team(ADMIN_TEAM_ID)),
    ]);

    const auditAttrs = [
      { key: 'entityType', type: 'string', size: 64 },
      { key: 'entityId', type: 'string', size: 50 },
      { key: 'action', type: 'string', size: 64 },
      { key: 'actorUserId', type: 'string', size: 50 },
      { key: 'beforeJson', type: 'string', size: 1500 },
      { key: 'afterJson', type: 'string', size: 1500 },
    ];

    for (const attr of auditAttrs) {
      await databases.createStringAttribute(DATABASE_ID, 'audit_logs', attr.key, attr.size, false);
      console.log(`✅ Attribute "${attr.key}" created.`);
    }

    // 4. Project Feedback Config (New Dedicated Collection)
    console.log('\n--- Setting up "project_feedback_config" ---');
    try {
      await databases.createCollection(DATABASE_ID, 'project_feedback_config', 'Project Feedback Config', [
        Permission.read(Role.any()), // Public can read for form config
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.write(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ]);
      console.log('✅ Collection "project_feedback_config" created.');
    } catch (e: any) {
      if (e.code === 409) console.log('ℹ️ Collection "project_feedback_config" already exists.');
      else throw e;
    }

    const configAttrs = [
      { key: 'projectId', type: 'string', size: 128 },
      { key: 'projectSlug', type: 'string', size: 128 },
      { key: 'publicFeedbackFormStatus', type: 'string', size: 32, default: 'draft' }, 
      { key: 'feedbackRetentionDays', type: 'integer', default: 365 },
      { key: 'operatorName', type: 'string', size: 128 },
      { key: 'operatorLegalName', type: 'string', size: 128 },
      { key: 'operatorTaxId', type: 'string', size: 64 },
      { key: 'operatorAddress', type: 'string', size: 255 },
      { key: 'operatorPhone', type: 'string', size: 32 },
      { key: 'dpoName', type: 'string', size: 128 },
      { key: 'dpoEmail', type: 'string', size: 128 },
      { key: 'privacyNoticeText', type: 'string', size: 1500 },
      { key: 'feedbackFormTitle', type: 'string', size: 128 },
      { key: 'feedbackFormIntroText', type: 'string', size: 800 },
      { key: 'feedbackFormConsentText', type: 'string', size: 800 },
      { key: 'feedbackSuccessMessage', type: 'string', size: 800 },
      { key: 'setupCompleted', type: 'boolean', default: false },
      { key: 'setupMissingItemsJson', type: 'string', size: 800 },
    ];

    for (const attr of configAttrs) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(DATABASE_ID, 'project_feedback_config', attr.key, attr.size!, false, attr.default as string);
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(DATABASE_ID, 'project_feedback_config', attr.key, false, 0, 10000, attr.default as number);
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(DATABASE_ID, 'project_feedback_config', attr.key, false, attr.default as boolean);
        }
        console.log(`✅ Config attribute "${attr.key}" created.`);
      } catch (e: any) {
        if (e.code !== 409) console.error(`❌ Error creating config attribute "${attr.key}":`, e.message);
      }
    }

    // Index for slug-based lookup on public form
    try {
      await (databases as any).createIndex(DATABASE_ID, 'project_feedback_config', 'unique_slug_config', 'unique', ['projectSlug'], ['asc']);
      console.log('✅ Unique index for projectSlug created in config.');
    } catch (e: any) {
      if (e.code !== 409) console.error('❌ Error creating index:', e.message);
    }

    console.log('\n🎉 All finished! Please wait a few minutes for attributes to reach "available" status in Appwrite Console.');

  } catch (err: any) {
    console.error('\n❌ CRITICAL ERR:', err.message);
  }
}

setupSchema();
