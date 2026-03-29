import { createSessionClient } from '@/lib/appwrite-server';
import { generateTrainingReportPdf } from '@/lib/training-report';
import { buildTrainingArchiveFileName, loadTrainingReportContext } from '@/lib/training-server';

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await createSessionClient();

    const { sessionId } = await context.params;
    const reportContext = await loadTrainingReportContext(sessionId);
    const pdfBuffer = generateTrainingReportPdf(reportContext);
    const url = new URL(request.url);
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const fileName =
      reportContext.session.archivedFileName ||
      buildTrainingArchiveFileName(reportContext.session.location, reportContext.session.trainingDate);

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
      },
    });
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code)
        : 500;

    return new Response(
      err instanceof Error ? err.message : 'Nu am putut genera raportul PDF.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}
