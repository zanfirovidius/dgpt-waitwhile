import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { INCIDENT_ARCHIVES_BUCKET_ID } from '@/lib/incident-server';

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await createSessionClient();

    const { fileId } = await context.params;
    const { storage } = await createAdminClient();
    const file = await storage.getFile(INCIDENT_ARCHIVES_BUCKET_ID, fileId);
    const fileView = await storage.getFileView(INCIDENT_ARCHIVES_BUCKET_ID, fileId);

    return new Response(fileView, {
      headers: {
        'Content-Type': file.mimeType || 'application/pdf',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${file.name}"`,
      },
    });
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? Number((error as { code?: number }).code)
        : 500;

    return new Response(
      error instanceof Error ? error.message : 'Nu am putut încărca arhiva PDF.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}
