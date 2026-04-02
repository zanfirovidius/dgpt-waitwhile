'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  ensurePlatformTemplatesBucket,
  ensurePlatformTemplatesSchema,
  getPlatformTemplate,
  listPlatformTemplates,
} from '@/lib/platform-templates-server';
import type { PlatformTemplateRecord } from '@/lib/platform-template-types';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getPlatformTemplateLibrary(params?: {
  category?: string;
  fileType?: string;
  search?: string;
}): Promise<ActionResult<PlatformTemplateRecord[]>> {
  try {
    await requireTemplateActor();
    const admin = await createAdminClient();
    await ensurePlatformTemplatesSchema(admin.databases);
    await ensurePlatformTemplatesBucket(admin.storage);

    const templates = await listPlatformTemplates(admin.databases, params);
    return { success: true, data: templates };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut încărca biblioteca de template-uri.',
    };
  }
}

export async function getPlatformTemplateById(templateId: string): Promise<ActionResult<PlatformTemplateRecord>> {
  try {
    await requireTemplateActor();
    const admin = await createAdminClient();
    await ensurePlatformTemplatesSchema(admin.databases);
    const template = await getPlatformTemplate(admin.databases, templateId);
    return { success: true, data: template };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut încărca template-ul.',
    };
  }
}

async function requireTemplateActor() {
  const { account } = await createSessionClient();
  return account.get();
}
