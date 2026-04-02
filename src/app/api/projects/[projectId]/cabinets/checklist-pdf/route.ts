import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ensureCabinetsSchema } from '@/lib/cabinets-server';
import { generateCabinetChecklistPdf } from '@/lib/cabinet-checklist-report';
import { getCabinetDailyPlanContext } from '@/lib/cabinet-print-server';

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireSession();
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const assignmentDate = url.searchParams.get('date') || '';

    if (!assignmentDate) {
      return new Response('Lipsește parametrul date.', { status: 400 });
    }

    const { databases } = await createAdminClient();
    await ensureCabinetsSchema(databases);

    const { project, packets } = await getCabinetDailyPlanContext(databases, projectId, assignmentDate);
    const buffer = generateCabinetChecklistPdf({
      project,
      assignmentDate,
      packets,
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `attachment; filename="${buildChecklistPdfFileName(project.eventName || project.name, assignmentDate)}"`,
      },
    });
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? Number((error as { code?: number }).code)
        : 500;

    return new Response(
      error instanceof Error ? error.message : 'Nu am putut genera checklist-ul PDF.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}

async function requireSession() {
  const { account } = await createSessionClient();
  return account.get();
}

function buildChecklistPdfFileName(projectName: string, assignmentDate: string) {
  const slug = [projectName, assignmentDate]
    .filter(Boolean)
    .join('_')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '');

  return `checklist-cabinete-${slug || 'zi'}.pdf`;
}
