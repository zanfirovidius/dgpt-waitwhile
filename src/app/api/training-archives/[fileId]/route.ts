import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { TRAINING_ARCHIVES_BUCKET_ID } from '@/lib/training-server';

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
    const file = await storage.getFile(TRAINING_ARCHIVES_BUCKET_ID, fileId);
    const fileDownload = await storage.getFileDownload(TRAINING_ARCHIVES_BUCKET_ID, fileId);

    return new Response(fileDownload, {
      headers: {
        'Content-Type': file.mimeType || 'application/pdf',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `attachment; filename="${file.name}"`,
      },
    });
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code)
        : 500;

    return new Response(
      err instanceof Error ? err.message : 'Nu am putut descărca arhiva PDF.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}
