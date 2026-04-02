import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  deleteCabinetPrintTemplateFile,
  ensureCabinetPrintTemplateBucket,
  ensureCabinetsSchema,
  getResolvedCabinetPrintTemplate,
  saveCabinetPrintTemplateFile,
  upsertCabinetPrintTemplateDocument,
} from '@/lib/cabinets-server';
import { CABINET_TEMPLATE_PLACEHOLDERS } from '@/lib/cabinet-print-utils';
import { validateCabinetPrintTemplateFile } from '@/lib/cabinet-print-server';

export async function POST(request: Request) {
  try {
    const actor = await requireSession();
    const formData = await request.formData();
    const file = formData.get('file');
    const scopeType = String(formData.get('scopeType') || '').trim() === 'platform' ? 'platform' : 'project';
    const projectId = String(formData.get('projectId') || '').trim();
    const templateName = String(formData.get('templateName') || '').trim();

    if (!(file instanceof File)) {
      return Response.json({ error: 'Nu a fost trimis niciun template.' }, { status: 400 });
    }

    if (scopeType === 'project' && !projectId) {
      return Response.json({ error: 'ProjectId este obligatoriu pentru template-ul de proiect.' }, { status: 400 });
    }

    validateCabinetPrintTemplateFile(file);

    const { databases, storage } = await createAdminClient();
    await ensureCabinetsSchema(databases);
    await ensureCabinetPrintTemplateBucket(storage);

    const previous = await getResolvedCabinetPrintTemplate(databases, projectId || '');
    const previousTemplate = scopeType === 'project' ? previous.projectTemplate : previous.platformTemplate;
    const uploadedFileId = await saveCabinetPrintTemplateFile(
      storage,
      file.name,
      Buffer.from(await file.arrayBuffer()),
    );

    if (previousTemplate?.templateFileId) {
      await deleteCabinetPrintTemplateFile(storage, previousTemplate.templateFileId);
    }

    const template = await upsertCabinetPrintTemplateDocument(
      databases,
      {
        scopeType,
        projectId,
        templateName: templateName || stripPptxExtension(file.name),
        templateFileId: uploadedFileId,
        originalFileName: file.name,
        placeholdersJson: JSON.stringify(CABINET_TEMPLATE_PLACEHOLDERS.map((key) => `{{${key}}}`)),
      },
      actor.$id,
    );

    revalidateTemplatePaths(projectId);
    return Response.json({ success: true, data: template });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Nu am putut încărca template-ul PPTX.' },
      { status: 500 },
    );
  }
}

async function requireSession() {
  const { account } = await createSessionClient();
  return account.get();
}

function stripPptxExtension(value: string) {
  return value.replace(/\.pptx$/i, '');
}

function revalidateTemplatePaths(projectId?: string) {
  if (projectId) {
    revalidatePath(`/projects/${projectId}/cabinets`);
    revalidatePath(`/projects/${projectId}`);
  }
}
