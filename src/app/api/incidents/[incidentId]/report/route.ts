import { createSessionClient } from '@/lib/appwrite-server';
import { generateIncidentReportPdf } from '@/lib/incident-report';
import { buildIncidentArchiveFileName, loadIncidentReportContext } from '@/lib/incident-server';

type RouteContext = {
  params: Promise<{
    incidentId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await createSessionClient();

    const { incidentId } = await context.params;
    const reportContext = await loadIncidentReportContext(incidentId);
    const pdfBuffer = generateIncidentReportPdf(reportContext);
    const url = new URL(request.url);
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const fileName =
      reportContext.incident.archivedFileName ||
      buildIncidentArchiveFileName(
        reportContext.incident.location,
        reportContext.incident.discoveredAt || reportContext.incident.reportedAt,
        reportContext.incident.$id,
      );

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? Number((error as { code?: number }).code)
        : 500;

    return new Response(
      error instanceof Error ? error.message : 'Nu am putut genera raportul PDF.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}
