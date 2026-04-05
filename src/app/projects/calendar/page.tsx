'use client';

import { getProjects, type Project } from '@/app/actions/projects';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { ProjectTagBadges } from '@/components/projects/ProjectTagBadges';
import { normalizeProjectDates } from '@/lib/project-dates';
import { normalizeProjectStatus } from '@/lib/project-status';
import { PROJECT_TAG_OPTIONS } from '@/lib/project-tags';
import { useQuery } from '@tanstack/react-query';
import {
  addMonths,
  addYears,
  areIntervalsOverlapping,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Layers3,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type CalendarView = 'month' | 'year';

type CalendarProject = Project & {
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
};

const WEEK_STARTS_ON = 1 as const;
const WEEKDAY_LABELS = eachDayOfInterval({
  start: new Date(2024, 0, 1),
  end: new Date(2024, 0, 7),
});

function toCalendarProject(project: Project): CalendarProject {
  const normalized = normalizeProjectDates(project);

  return {
    ...normalized,
    start: parseISO(normalized.startDate),
    end: parseISO(normalized.endDate),
  };
}

function getProjectStatusLineClass(projectStatus?: string | null) {
  switch (normalizeProjectStatus(projectStatus)) {
    case 'active':
      return 'bg-success';
    case 'ended':
      return 'bg-base-content/45';
    default:
      return 'bg-warning';
  }
}

function getProjectStatusBorderClass(projectStatus?: string | null) {
  switch (normalizeProjectStatus(projectStatus)) {
    case 'active':
      return 'border-success/35';
    case 'ended':
      return 'border-base-content/25';
    default:
      return 'border-warning/35';
  }
}

function buildDayProjectMap(projects: CalendarProject[], rangeStart: Date, rangeEnd: Date) {
  const map = new Map<string, CalendarProject[]>();

  for (const project of projects) {
    const overlaps = areIntervalsOverlapping(
      { start: project.start, end: project.end },
      { start: rangeStart, end: rangeEnd },
      { inclusive: true },
    );

    if (!overlaps) {
      continue;
    }

    const visibleStart = new Date(Math.max(project.start.getTime(), rangeStart.getTime()));
    const visibleEnd = new Date(Math.min(project.end.getTime(), rangeEnd.getTime()));

    for (const day of eachDayOfInterval({ start: visibleStart, end: visibleEnd })) {
      const key = format(day, 'yyyy-MM-dd');
      const existingProjects = map.get(key) ?? [];
      existingProjects.push(project);
      existingProjects.sort((left, right) => left.start.getTime() - right.start.getTime() || left.name.localeCompare(right.name));
      map.set(key, existingProjects);
    }
  }

  return map;
}

function getMonthProjects(projects: CalendarProject[], month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  return projects
    .filter((project) =>
      areIntervalsOverlapping(
        { start: project.start, end: project.end },
        { start: monthStart, end: monthEnd },
        { inclusive: true },
      ),
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime() || left.name.localeCompare(right.name));
}

function getMonthGrid(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
  });
}

function getMonthDays(month: Date) {
  return eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });
}

function getMonthSummary(projects: CalendarProject[], month: Date) {
  const monthProjects = getMonthProjects(projects, month);

  return {
    total: monthProjects.length,
    active: monthProjects.filter((project) => normalizeProjectStatus(project.projectStatus) === 'active').length,
    draft: monthProjects.filter((project) => normalizeProjectStatus(project.projectStatus) === 'draft').length,
  };
}

export default function ProjectsCalendarPage() {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>('year');
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [hideEmptyDays, setHideEmptyDays] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalStartDate, setCreateModalStartDate] = useState<string | null>(null);

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['projects-calendar'],
    queryFn: async () => {
      const result = await getProjects();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Nu am putut încărca proiectele.');
      }

      return result.data;
    },
  });

  const calendarProjects = useMemo(() => projects.map(toCalendarProject), [projects]);
  const yearMonths = useMemo(
    () => eachMonthOfInterval({ start: startOfYear(focusedDate), end: endOfYear(focusedDate) }),
    [focusedDate],
  );

  const currentMonthTitle = format(focusedDate, 'LLLL yyyy', { locale: ro });
  const currentYearTitle = format(focusedDate, 'yyyy', { locale: ro });
  const monthGridDays = useMemo(() => getMonthGrid(focusedDate), [focusedDate]);
  const monthDayMap = useMemo(() => {
    if (view !== 'month') {
      return new Map<string, CalendarProject[]>();
    }

    return buildDayProjectMap(calendarProjects, monthGridDays[0], monthGridDays[monthGridDays.length - 1]);
  }, [calendarProjects, monthGridDays, view]);
  const monthSummary = useMemo(() => getMonthSummary(calendarProjects, focusedDate), [calendarProjects, focusedDate]);

  const handleStepBack = () => {
    setFocusedDate((current) => (view === 'year' ? subYears(current, 1) : subMonths(current, 1)));
  };

  const handleStepForward = () => {
    setFocusedDate((current) => (view === 'year' ? addYears(current, 1) : addMonths(current, 1)));
  };

  const handleToday = () => {
    setFocusedDate(new Date());
  };

  const openCreateModal = (date?: Date) => {
    setCreateModalStartDate(date ? format(date, 'yyyy-MM-dd') : null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateModalStartDate(null);
  };

  const handleCreated = (projectId: string) => {
    setIsCreateModalOpen(false);
    setCreateModalStartDate(null);
    router.push(`/projects/${projectId}`);
  };

  return (
    <div className="ui-page-wash space-y-6">
      <section className="ui-surface-sky rounded-[1.75rem] border bg-base-100 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="ui-kicker ui-text-sky">Planificare proiecte</p>
            <h1 className="ui-display-title mt-3 text-base-content">Calendar proiecte</h1>
            <p className="ui-body mt-3 text-base-content/65">
              Vezi proiectele în ritmul anului sau intră într-o lună pentru un calendar complet, cu proiectele plasate direct pe zilele în care rulează.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="rounded-2xl border border-base-200 bg-base-200/60 p-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`btn btn-sm rounded-xl ${view === 'month' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setView('month')}
                >
                  Lună
                </button>
                <button
                  type="button"
                  className={`btn btn-sm rounded-xl ${view === 'year' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setView('year')}
                >
                  An
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-base-200 bg-base-100 px-2 py-2 shadow-sm">
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={handleStepBack} aria-label="Perioada anterioară">
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-[10rem] px-2 text-center">
                <p className="ui-label">{view === 'year' ? 'An afișat' : 'Lună afișată'}</p>
                <p className="mt-1 text-[0.98rem] font-semibold capitalize text-base-content">
                  {view === 'year' ? currentYearTitle : currentMonthTitle}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={handleStepForward} aria-label="Perioada următoare">
                <ChevronRight size={18} />
              </button>
            </div>

            <button type="button" className="btn btn-ghost btn-sm" onClick={handleToday}>
              Azi
            </button>

            <button type="button" className="btn btn-primary gap-2" onClick={() => openCreateModal()}>
              <Plus size={18} />
              Proiect nou
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="ui-surface-teal rounded-[1.75rem] border bg-base-100 p-5 shadow-sm sm:p-6">
          {isLoading ? (
            <div className="flex min-h-[26rem] items-center justify-center">
              <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
          ) : error ? (
            <div className="alert alert-error rounded-2xl">
              {error instanceof Error ? error.message : 'Nu am putut încărca proiectele.'}
            </div>
          ) : calendarProjects.length === 0 ? (
            <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-base-300 bg-base-200/40 px-6 py-12 text-center">
              <FolderKanban size={42} className="text-base-content/30" />
              <h2 className="ui-section-title mt-4 text-base-content">Nu există proiecte în calendar</h2>
              <p className="ui-body mt-2 text-base-content/60">
                Creează primul proiect, iar acesta va apărea automat în vizualizarea pe lună și pe an.
              </p>
              <button type="button" className="btn btn-primary mt-5 gap-2" onClick={() => openCreateModal()}>
                <Plus size={18} />
                Creează proiect
              </button>
            </div>
          ) : view === 'year' ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="ui-kicker ui-text-teal">Vizualizare anuală</p>
                  <h2 className="ui-section-title mt-1 text-base-content">Fiecare lună este afișată ca o coloană separată</h2>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <p className="text-sm text-base-content/55">
                    Fiecare zi devine un rând, iar proiectele sunt afișate direct în luna în care rulează.
                  </p>
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-base-200 bg-base-100 px-3 py-2 sm:min-w-[15rem]">
                    <span className="text-sm font-medium text-base-content/70">Ascunde zilele fără proiecte</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-sm"
                      checked={hideEmptyDays}
                      onChange={(event) => setHideEmptyDays(event.target.checked)}
                    />
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="grid auto-cols-[minmax(20rem,1fr)] grid-flow-col gap-4">
                  {yearMonths.map((month) => {
                    const monthDays = getMonthDays(month);
                    const monthDayMap = buildDayProjectMap(calendarProjects, monthDays[0], monthDays[monthDays.length - 1]);
                    const monthProjects = getMonthProjects(calendarProjects, month);
                    const visibleMonthDays = hideEmptyDays
                      ? monthDays.filter((day) => (monthDayMap.get(format(day, 'yyyy-MM-dd')) ?? []).length > 0)
                      : monthDays;

                    return (
                      <article key={month.toISOString()} className="ui-panel-sky flex min-h-[34rem] flex-col rounded-[0.5rem] bg-gray-300/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="ui-kicker ui-text-sky">{format(month, 'LLLL', { locale: ro })}</p>
                            <h3 className="mt-1 text-[1rem] font-semibold capitalize text-base-content">
                              {format(month, 'LLLL yyyy', { locale: ro })}
                            </h3>
                            <p className="mt-1 text-[0.76rem] text-base-content/55">
                              {monthProjects.length} {monthProjects.length === 1 ? 'proiect în lună' : 'proiecte în lună'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => {
                              setView('month');
                              setFocusedDate(month);
                            }}
                          >
                            Vezi luna
                          </button>
                        </div>

                        <div className="mt-4 flex-1 space-y-1">
                          {visibleMonthDays.length === 0 ? (
                            <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-base-200 bg-base-100/60 px-4 text-center text-sm text-base-content/45">
                              Nu există zile cu proiecte în această lună.
                            </div>
                          ) : visibleMonthDays.map((day) => {
                            const dayProjects = monthDayMap.get(format(day, 'yyyy-MM-dd')) ?? [];
                            const fullDayLabel = format(day, 'd MMMM yyyy', { locale: ro });

                            return (
                              <div
                                key={day.toISOString()}
                                className={`grid grid-cols-[3.4rem_minmax(0,1fr)] gap-1 rounded-2l bg-white border p-2.5 ${
                                  dayProjects.length > 0
                                    ? 'border-base-200 bg-base-100/80'
                                    : 'border-base-200/70 bg-base-100/45'
                                }`}
                              >
                                <button
                                  type="button"
                                  className={`aspect-square rounded-xl px-0.5 py-0.5 text-center transition-colors hover:bg-primary hover:text-primary-content ${isToday(day) ? 'bg-primary text-white' : 'bg-base-300 text-base-content'}`}
                                  onClick={() => openCreateModal(day)}
                                  aria-label={`Creează proiect nou cu data de început ${fullDayLabel}`}
                                  title={`Proiect nou din ${fullDayLabel}`}
                                >
                                  <span className="flex h-full flex-col items-center justify-center">
                                    <span className="text-[0.82rem] font-semibold">{format(day, 'd', { locale: ro })}</span>
                                    <span className={`text-[0.62rem] font-medium uppercase tracking-[0.08em] ${isToday(day) ? 'text-white/70' : 'text-base-content/55'}`}>
                                      {format(day, 'EEE', { locale: ro })}
                                    </span>
                                  </span>
                                </button>

                                <div className="min-w-0 space-y-1.5">
                                  {dayProjects.length > 0 ? (
                                    dayProjects.map((project) => (
                                      <Link
                                        key={`${day.toISOString()}-${project.$id}`}
                                        href={`/projects/${project.$id}`}
                                        className={`relative block overflow-hidden rounded-xl border bg-base-100 px-2.5 py-2.5 transition-[border-color,box-shadow] hover:shadow-sm ${getProjectStatusBorderClass(project.projectStatus)}`}
                                      >
                                        <div className="flex items-start gap-2">
                                          <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[0.78rem] font-semibold leading-5 text-base-content">
                                            {project.name}
                                          </div>
                                          <ProjectTagBadges
                                            tags={project.projectTags?.slice(0, 1)}
                                            compact
                                            className="shrink-0"
                                          />
                                        </div>
                                        <div className="mt-1 truncate text-[0.68rem] leading-4 text-base-content/55">
                                          {project.locationName}
                                        </div>
                                        <div className={`absolute inset-x-0 bottom-0 h-1 ${getProjectStatusLineClass(project.projectStatus)}`}></div>
                                      </Link>
                                    ))
                                  ) : (
                                    <div className="flex h-full min-h-10 items-center rounded-xl px-2.5 text-[0.7rem] text-base-content/35">
                                      Fără proiecte
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="ui-kicker ui-text-teal">Vizualizare lunară</p>
                  <h2 className="ui-section-title mt-1 capitalize text-base-content">{currentMonthTitle}</h2>
                  <p className="ui-body mt-2 text-base-content/60">
                    Calendar complet pe zile, cu proiectele afișate direct în intervalul în care sunt active.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="ui-badge-sky px-3 py-2 text-[0.74rem] font-medium">
                    {monthSummary.total} {monthSummary.total === 1 ? 'proiect' : 'proiecte'}
                  </span>
                  <span className="ui-badge-teal px-3 py-2 text-[0.74rem] font-medium">
                    {monthSummary.active} active
                  </span>
                  <span className="ui-badge-amber px-3 py-2 text-[0.74rem] font-medium">
                    {monthSummary.draft} draft
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {WEEKDAY_LABELS.map((day) => (
                  <div key={day.toISOString()} className="ui-label px-3 py-2 text-center">
                    {format(day, 'EEEEEE', { locale: ro })}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
                {monthGridDays.map((day) => {
                  const dayProjects = monthDayMap.get(format(day, 'yyyy-MM-dd')) ?? [];
                  const inMonth = isSameMonth(day, focusedDate);

                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[11rem] rounded-[1.35rem] border p-3 transition-colors ${
                        inMonth
                          ? 'border-base-200 bg-base-100'
                          : 'border-base-200/70 bg-base-200/30 text-base-content/35'
                      } ${isToday(day) ? 'ring-2 ring-primary/15 ring-offset-2 ring-offset-base-100' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openCreateModal(day)}
                          aria-label={`Creează proiect nou cu data de început ${format(day, 'd MMMM yyyy', { locale: ro })}`}
                          title={`Proiect nou din ${format(day, 'd MMMM yyyy', { locale: ro })}`}
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-[0.88rem] font-semibold ${
                            isToday(day)
                              ? 'bg-primary text-primary-content'
                              : inMonth
                                ? 'bg-base-200/70 text-base-content'
                                : 'bg-base-200/40 text-base-content/40'
                          } transition-colors hover:bg-primary hover:text-primary-content`}
                        >
                          {format(day, 'd', { locale: ro })}
                        </button>

                        {dayProjects.length > 0 ? (
                          <span className="ui-badge-sky px-2.5 py-1.5 text-[0.7rem] font-medium">
                            {dayProjects.length}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {dayProjects.slice(0, 3).map((project) => (
                          <Link
                            key={`${day.toISOString()}-${project.$id}`}
                            href={`/projects/${project.$id}`}
                            className={`relative block overflow-hidden rounded-xl border bg-base-100 px-2.5 py-2.5 transition-[border-color,box-shadow] hover:shadow-sm ${getProjectStatusBorderClass(project.projectStatus)}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[0.8rem] font-semibold leading-5 text-base-content">
                                {project.name}
                              </div>
                              <ProjectTagBadges
                                tags={project.projectTags?.slice(0, 1)}
                                compact
                                className="shrink-0"
                              />
                            </div>
                            <div className="mt-1 truncate text-[0.72rem] leading-4 text-base-content/55">
                              {project.locationName}
                            </div>
                            <div className={`absolute inset-x-0 bottom-0 h-1 ${getProjectStatusLineClass(project.projectStatus)}`}></div>
                          </Link>
                        ))}

                        {dayProjects.length > 3 ? (
                          <div className="rounded-xl bg-base-200/60 px-2.5 py-2 text-[0.72rem] font-medium text-base-content/55">
                            +{dayProjects.length - 3} proiecte în aceeași zi
                          </div>
                        ) : null}

                        {inMonth && dayProjects.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-base-200 px-2.5 py-3 text-[0.72rem] text-base-content/40">
                            Fără proiecte planificate.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="ui-surface-amber rounded-[1.75rem] border bg-base-100 p-5 shadow-sm">
            <p className="ui-kicker ui-text-amber">Perioada selectată</p>
            <h2 className="ui-section-title mt-1 text-base-content">
              {view === 'year' ? `Anul ${currentYearTitle}` : currentMonthTitle}
            </h2>
            <div className="mt-4 space-y-3">
              <div className="ui-panel-amber rounded-2xl border px-4 py-3">
                <p className="ui-label">Vizualizare</p>
                <p className="mt-1 text-[0.96rem] font-semibold text-base-content">
                  {view === 'year' ? 'Calendar anual cu lunile pe coloane' : 'Calendar lunar complet'}
                </p>
              </div>
              <div className="ui-panel-sky rounded-2xl border px-4 py-3">
                <p className="ui-label">Proiecte afișate</p>
                <p className="ui-number mt-2 text-base-content">
                  {view === 'year' ? calendarProjects.length : monthSummary.total}
                </p>
              </div>
            </div>
          </section>

          <section className="ui-surface-sky rounded-[1.75rem] border bg-base-100 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="ui-icon-chip-sky rounded-2xl p-2">
                <Layers3 size={18} />
              </div>
              <div>
                <p className="ui-kicker ui-text-sky">Legendă</p>
                <h2 className="ui-section-title mt-1 text-base-content">Cum citești calendarul</h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100">
                <div className="px-3 py-3 text-sm text-base-content/70">Proiect activ</div>
                <div className="h-1 bg-success"></div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100">
                <div className="px-3 py-3 text-sm text-base-content/70">Proiect draft</div>
                <div className="h-1 bg-warning"></div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100">
                <div className="px-3 py-3 text-sm text-base-content/70">Proiect încheiat</div>
                <div className="h-1 bg-base-content/45"></div>
              </div>
            </div>

            <p className="ui-body mt-5 text-base-content/60">
              Cardurile rămân neutre, eticheta regională stă lângă titlu, iar linia de jos arată starea proiectului: activ, draft sau încheiat.
            </p>

            <div className="mt-5 rounded-2xl border border-base-200 bg-base-200/35 p-4">
              <p className="ui-label">Etichete regionale</p>
              <div className="mt-3 space-y-2">
                {PROJECT_TAG_OPTIONS.map((tag) => (
                  <div key={tag.value} className="flex items-center justify-between gap-3 rounded-xl bg-base-100 px-3 py-2">
                    <span className="text-sm text-base-content/70">{tag.label}</span>
                    <ProjectTagBadges tags={[tag.value]} compact />
                  </div>
                ))}
              </div>
            </div>

            <Link href="/projects" className="btn btn-ghost mt-5 w-full justify-start gap-2">
              <CalendarDays size={16} />
              Înapoi la toate proiectele
            </Link>
          </section>
        </aside>
      </section>

      <NewProjectModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        onCreated={handleCreated}
        initialStartDate={createModalStartDate ?? undefined}
        initialEndDate={createModalStartDate ?? undefined}
      />
    </div>
  );
}
