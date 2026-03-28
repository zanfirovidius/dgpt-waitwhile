import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';

const ATTENDANCE_SIGNATURES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_ATTENDANCE_SIGNATURES_BUCKET_ID || 'attendance_signatures';

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
    const file = await storage.getFile(ATTENDANCE_SIGNATURES_BUCKET_ID, fileId);
    const fileView = await storage.getFileView(ATTENDANCE_SIGNATURES_BUCKET_ID, fileId);

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
    const message =
      err instanceof Error ? err.message : 'Nu am putut încărca semnătura.';

    return new Response(message, { status: Number.isFinite(code) ? code : 500 });
  }
}
