import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { TRAINING_SIGNATURES_BUCKET_ID } from '@/lib/training-server';

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
    const file = await storage.getFile(TRAINING_SIGNATURES_BUCKET_ID, fileId);
    const fileView = await storage.getFileView(TRAINING_SIGNATURES_BUCKET_ID, fileId);

    return new Response(fileView, {
      headers: {
        'Content-Type': file.mimeType || 'image/png',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${file.name}"`,
      },
    });
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code)
        : 500;

    return new Response(
      err instanceof Error ? err.message : 'Nu am putut încărca semnătura.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}
