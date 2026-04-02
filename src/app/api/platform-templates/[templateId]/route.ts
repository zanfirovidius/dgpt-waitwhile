import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  deletePlatformTemplateDocument,
  deletePlatformTemplateFile,
  ensurePlatformTemplatesBucket,
  ensurePlatformTemplatesSchema,
  getPlatformTemplate,
  getPlatformTemplateFileBuffer,
} from '@/lib/platform-templates-server';
import { detachCabinetTemplateReferencesByLibraryTemplateId, ensureCabinetsSchema } from '@/lib/cabinets-server';

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireSession();
    const { templateId } = await context.params;

    const { databases, storage } = await createAdminClient();
    await ensurePlatformTemplatesSchema(databases);
    await ensurePlatformTemplatesBucket(storage);

    const template = await getPlatformTemplate(databases, templateId);
    const buffer = await getPlatformTemplateFileBuffer(storage, template.templateFileId);

    return new Response(buffer, {
      headers: {
        'Content-Type': template.mimeType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `attachment; filename="${template.originalFileName || 'template'}"`,
      },
    });
  } catch (error: unknown) {
    return new Response(
      error instanceof Error ? error.message : 'Nu am putut descărca template-ul.',
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireSession();
    const { templateId } = await context.params;

    const { databases, storage } = await createAdminClient();
    await ensurePlatformTemplatesSchema(databases);
    await ensurePlatformTemplatesBucket(storage);
    await ensureCabinetsSchema(databases);

    const detached = await detachCabinetTemplateReferencesByLibraryTemplateId(databases, templateId);

    const deleted = await deletePlatformTemplateDocument(databases, templateId);
    await deletePlatformTemplateFile(storage, deleted.templateFileId);

    revalidatePath('/templates');
    for (const reference of detached) {
      if (reference.projectId) {
        revalidatePath(`/projects/${reference.projectId}/cabinets`);
        revalidatePath(`/projects/${reference.projectId}`);
      }
    }
    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Nu am putut șterge template-ul.' },
      { status: 500 },
    );
  }
}

async function requireSession() {
  const { account } = await createSessionClient();
  return account.get();
}
