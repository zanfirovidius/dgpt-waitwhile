import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  ensureCabinetPrintTemplateBucket,
  ensureCabinetsSchema,
  getProjectCabinetAssignment,
} from '@/lib/cabinets-server';
import { buildCabinetPlacardDocument, getCabinetDailyPlanContext, resolveCabinetPlacardTemplate } from '@/lib/cabinet-print-server';
import { buildCabinetPlacardFileName } from '@/lib/cabinet-print-utils';

type RouteContext = {
  params: Promise<{
    projectId: string;
    assignmentId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireSession();
    const { projectId, assignmentId } = await context.params;

    const { databases, storage } = await createAdminClient();
    await ensureCabinetsSchema(databases);
    await ensureCabinetPrintTemplateBucket(storage);

    const assignment = await getProjectCabinetAssignment(databases, assignmentId);
    if (assignment.projectId !== projectId) {
      return new Response('Programarea nu aparține proiectului selectat.', { status: 400 });
    }

    const [{ project, packets }, template] = await Promise.all([
      getCabinetDailyPlanContext(databases, projectId, assignment.assignmentDate),
      resolveCabinetPlacardTemplate(databases, storage, projectId),
    ]);

    const packet = packets.find((item) => item.assignmentId === assignmentId);
    if (!packet) {
      return new Response('Nu am găsit alocarea selectată în programul zilei.', { status: 404 });
    }

    const buffer = await buildCabinetPlacardDocument({
      templateBuffer: template.buffer,
      packet,
      project,
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `attachment; filename="${buildCabinetPlacardFileName(packet)}"`,
      },
    });
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? Number((error as { code?: number }).code)
        : 500;

    return new Response(
      error instanceof Error ? error.message : 'Nu am putut genera planșa cabinetului.',
      { status: Number.isFinite(code) ? code : 500 },
    );
  }
}

async function requireSession() {
  const { account } = await createSessionClient();
  return account.get();
}
