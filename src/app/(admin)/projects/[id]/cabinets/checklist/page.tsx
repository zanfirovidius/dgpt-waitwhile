import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import { AlertCircle, Package, Stethoscope } from 'lucide-react';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ensureCabinetsSchema } from '@/lib/cabinets-server';
import { getCabinetDailyPlanContext } from '@/lib/cabinet-print-server';
import { PrintToolbar } from '@/components/PrintToolbar';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function CabinetChecklistPrintPage({ params, searchParams }: PageProps) {
  try {
    await createSessionClient();

    const [{ id: projectId }, { date = '' }] = await Promise.all([params, searchParams]);

    if (!date) {
      throw new Error('Selectează ziua pentru care vrei să generezi checklist-ul.');
    }

    const { databases } = await createAdminClient();
    await ensureCabinetsSchema(databases);

    const { project, packets } = await getCabinetDailyPlanContext(databases, projectId, date);
    const formattedDay = format(parseISO(date), 'EEEE, d MMMM yyyy', { locale: ro });
    const pdfHref = `/api/projects/${projectId}/cabinets/checklist-pdf?date=${encodeURIComponent(date)}`;

    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <PrintToolbar backHref={`/projects/${projectId}/cabinets`} pdfHref={pdfHref} />

        <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-base-content/45">
                Checklist logistic cabine
              </div>
              <h1 className="mt-2 text-3xl font-black text-base-content">
                {project.eventName || project.name}
              </h1>
              <p className="mt-2 text-sm text-base-content/60">
                {formattedDay}
                {(project.city || project.locationName || project.venue)
                  ? ` · ${[project.city || project.locationName || '', project.venue || ''].filter(Boolean).join(' · ')}`
                  : ''}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-base-content/70">
              Se generează direct din programul zilei. Fiecare fișă combină cabinetul fizic, disciplina din interval, persoana asignată și materialele aferente.
            </div>
          </div>
        </div>

        {packets.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-base-300 bg-base-100 px-6 py-12 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 text-base-content/30" size={36} />
            <h2 className="text-lg font-black text-base-content">Nu există intervale pentru ziua selectată.</h2>
            <p className="mt-2 text-sm text-base-content/60">
              Adaugă alocări în programul zilei, apoi revino aici pentru checklist-ul de cabinet.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {packets.map((packet) => (
              <section
                key={packet.assignmentId}
                className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                <div className="flex flex-col gap-4 border-b border-base-300 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-primary badge-outline">{packet.cabinetIdentifier || 'CAB'}</span>
                      <h2 className="text-2xl font-black text-base-content">{packet.cabinetLabel}</h2>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-base-content/60">
                      <span className="badge badge-ghost">{packet.specialty || 'Non-clinic'}</span>
                      <span className={`badge ${packet.ultrasoundAvailable ? 'badge-secondary' : 'badge-ghost'}`}>
                        {packet.ultrasoundAvailable ? 'Cu ecograf' : 'Fără ecograf'}
                      </span>
                      <span className="badge badge-ghost">{packet.intervalLabel}</span>
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-base-300 bg-base-50 px-4 py-3 text-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/45">
                      Alocat în interval
                    </div>
                    <div className="mt-1 text-base font-black text-base-content">{packet.assigneeDisplayName}</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
                  <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
                    <div className="flex items-center gap-2 text-base font-black text-base-content">
                      <Package size={16} className="text-secondary" />
                      Materiale și echipamente
                    </div>
                    <div className="mt-1 text-xs text-base-content/55">
                      {packet.readyMaterialsCount}/{packet.totalMaterialsCount} marcate ca pregătite în checklist-ul combinat al cabinetului și al intervalului
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {packet.materials.length > 0 ? (
                        packet.materials.map((material) => (
                          <div
                            key={material.id}
                            className="flex items-start gap-3 rounded-2xl border border-base-300 bg-base-100 px-3 py-3"
                          >
                            <span
                              className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border text-[11px] font-black ${
                                material.checked
                                  ? 'border-secondary bg-secondary/15 text-secondary'
                                  : 'border-base-300 text-base-content/35'
                              }`}
                            >
                              {material.checked ? '✓' : ''}
                            </span>
                            <span className="text-sm text-base-content/80">{material.label}</span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-base-300 px-4 py-5 text-sm text-base-content/55 sm:col-span-2">
                          Nu există materiale configurate pentru acest cabinet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
                      <div className="flex items-center gap-2 text-base font-black text-base-content">
                        <Stethoscope size={16} className="text-primary" />
                        Notițe operative
                      </div>
                      <p className="mt-3 text-sm text-base-content/70">{packet.notes || 'Fără observații pentru acest interval.'}</p>
                    </div>

                    <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4 text-sm text-base-content/70">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/45">
                        Control logistic
                      </div>
                      <ul className="mt-3 space-y-2">
                        <li>Verifică semnalizarea cabinetului înainte de deschidere.</li>
                        <li>Confirmă prezența persoanei alocate pentru interval.</li>
                        <li>Notează manual lipsurile descoperite pe print.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error: unknown) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-[2rem] border border-error/20 bg-error/5 px-6 py-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-error/50" size={36} />
          <h1 className="text-xl font-black text-base-content">Checklist-ul nu a putut fi generat.</h1>
          <p className="mt-2 text-sm text-base-content/70">
            {error instanceof Error ? error.message : 'A apărut o problemă la încărcarea programului zilei.'}
          </p>
        </div>
      </div>
    );
  }
}
