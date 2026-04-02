import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  deleteCabinetPrintTemplateDocument,
  deleteCabinetPrintTemplateFile,
  ensureCabinetPrintTemplateBucket,
  ensureCabinetsSchema,
} from '@/lib/cabinets-server';

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireSession();
    const { templateId } = await context.params;
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId') || '';

    const { databases, storage } = await createAdminClient();
    await ensureCabinetsSchema(databases);
    await ensureCabinetPrintTemplateBucket(storage);

    const deleted = await deleteCabinetPrintTemplateDocument(databases, templateId);
    await deleteCabinetPrintTemplateFile(storage, deleted.templateFileId);

    revalidateTemplatePaths(projectId);
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

function revalidateTemplatePaths(projectId?: string) {
  if (projectId) {
    revalidatePath(`/projects/${projectId}/cabinets`);
    revalidatePath(`/projects/${projectId}`);
  }
}
