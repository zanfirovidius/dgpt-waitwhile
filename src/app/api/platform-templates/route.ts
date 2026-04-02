import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  createPlatformTemplateDocument,
  ensurePlatformTemplatesBucket,
  ensurePlatformTemplatesSchema,
  inferPlatformTemplateFileType,
  sanitizePlatformTemplateText,
  savePlatformTemplateFile,
} from '@/lib/platform-templates-server';

const ALLOWED_EXTENSIONS = ['pptx', 'docx', 'xlsx', 'pdf'] as const;
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
] as const;

export async function POST(request: Request) {
  try {
    const actor = await requireSession();
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json({ error: 'Nu a fost trimis niciun fișier.' }, { status: 400 });
    }

    validatePlatformTemplateFile(file);

    const templateName = sanitizePlatformTemplateText(String(formData.get('templateName') || ''), 160);
    const category = sanitizePlatformTemplateText(String(formData.get('category') || 'general'), 64) || 'general';
    const description = sanitizePlatformTemplateText(String(formData.get('description') || ''), 1500);
    const placeholdersJson = sanitizePlatformTemplateText(String(formData.get('placeholdersJson') || ''), 3000);

    const { databases, storage } = await createAdminClient();
    await ensurePlatformTemplatesSchema(databases);
    await ensurePlatformTemplatesBucket(storage);

    const uploadedFileId = await savePlatformTemplateFile(
      storage,
      file.name,
      Buffer.from(await file.arrayBuffer()),
    );

    const document = await createPlatformTemplateDocument(
      databases,
      {
        templateName: templateName || stripExtension(file.name),
        category,
        fileType: inferPlatformTemplateFileType(file.name),
        originalFileName: file.name,
        mimeType: file.type,
        templateFileId: uploadedFileId,
        description,
        placeholdersJson,
      },
      actor.$id,
    );

    revalidatePath('/templates');
    return Response.json({ success: true, data: document });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Nu am putut încărca template-ul.' },
      { status: 500 },
    );
  }
}

async function requireSession() {
  const { account } = await createSessionClient();
  return account.get();
}

function validatePlatformTemplateFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error('Selectează un fișier valid.');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Fișierul este prea mare. Maxim 15 MB.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const hasValidExtension = ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number]);
  const hasValidMime = ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number]);

  if (!hasValidExtension && !hasValidMime) {
    throw new Error('Format invalid. Sunt acceptate doar .pptx, .docx, .xlsx și .pdf.');
  }
}

function stripExtension(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, '');
}
