'use client';

import { getLocationDetails, getOccupancy, OccupancyData } from '@/app/actions/waitwhile';
import LocationSelector from '@/components/LocationSelector';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  MapPin,
  Stethoscope,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type SortConfig = {
  key: 'name' | 'occupancyPercent';
  direction: 'asc' | 'desc';
} | null;

type OccupancyDashboardProps = {
  autoDateFromLocation?: boolean;
  headerDescription?: string;
  headerTitle?: string;
  hideLocationSelector?: boolean;
  initialFromDate?: string;
  initialLocationId?: string;
  initialLocationName?: string;
  initialToDate?: string;
};

function AnimatedNumber({ value, isPercent = false }: { value: number; isPercent?: boolean }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1000;
    const initialValue = displayValue;
    const endValue = value;

    if (initialValue === endValue) {
      return;
    }

    const step = (timestamp: number) => {
      if (!startTimestamp) {
        startTimestamp = timestamp;
      }

      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const current = initialValue + (endValue - initialValue) * easeProgress;
      setDisplayValue(current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    window.requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{isPercent ? displayValue.toFixed(1) : Math.round(displayValue)}</>;
}

function formatOccupancyDay(day: string) {
  const parsedDate = new Date(day);
  if (Number.isNaN(parsedDate.getTime())) {
    return day;
  }

  return parsedDate.toLocaleDateString('ro-RO', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function OccupancyDashboard({
  autoDateFromLocation = true,
  headerDescription = 'Selectează locația și intervalul pentru a calcula gradul de ocupare al cabinetelor.',
  headerTitle = 'Grad de ocupare',
  hideLocationSelector = false,
  initialFromDate,
  initialLocationId = '',
  initialLocationName = '',
  initialToDate,
}: OccupancyDashboardProps) {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const defaultNextWeek = useMemo(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }, []);

  const [selectedLocation, setSelectedLocation] = useState<string>(initialLocationId);
  const [fromDate, setFromDate] = useState<string>(initialFromDate || today);
  const [toDate, setToDate] = useState<string>(initialToDate || defaultNextWeek);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'occupancyPercent', direction: 'desc' });
  const [copiedLink, setCopiedLink] = useState(false);
  const [hideFullResources, setHideFullResources] = useState(false);

  useEffect(() => {
    if (!autoDateFromLocation || !selectedLocation) {
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const res = await getLocationDetails(selectedLocation);
        if (!res.success || !res.data || !isMounted) {
          return;
        }

        const loc = res.data;
        if (!loc.hoursByDate || Object.keys(loc.hoursByDate).length === 0) {
          return;
        }

        const dateKeys = Object.keys(loc.hoursByDate);
        let earliest = '9999-12-31';
        let latest = '0000-01-01';

        for (const keyStr of dateKeys) {
          if (keyStr.length !== 8) {
            continue;
          }

          const yyyy = keyStr.substring(0, 4);
          const mm = keyStr.substring(4, 6);
          const dd = keyStr.substring(6, 8);
          const formattedDate = `${yyyy}-${mm}-${dd}`;

          if (formattedDate < earliest) {
            earliest = formattedDate;
          }
          if (formattedDate > latest) {
            latest = formattedDate;
          }
        }

        if (earliest !== '9999-12-31') {
          setFromDate(earliest);
          setToDate(latest);
        }
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [autoDateFromLocation, selectedLocation]);

  const { data: occupancy, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['waitwhile-occupancy', selectedLocation, fromDate, toDate],
    queryFn: async () => {
      if (!selectedLocation) {
        return null;
      }

      const res = await getOccupancy(selectedLocation, fromDate, toDate);
      if (!res.success) {
        throw new Error(res.error);
      }

      return res;
    },
    enabled: Boolean(selectedLocation && fromDate && toDate),
  });

  const handleSharePublic = () => {
    if (!selectedLocation || !fromDate || !toDate) {
      return;
    }

    const url = new URL('/public/occupancy', window.location.origin);
    url.searchParams.set('location', selectedLocation);
    url.searchParams.set('from', fromDate);
    url.searchParams.set('to', toDate);
    if (hideFullResources) {
      url.searchParams.set('hideFull', 'true');
    }

    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleSort = (key: 'name' | 'occupancyPercent') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getOccupancyColor = (percent: number) => {
    if (percent > 80) {
      return 'text-success';
    }
    if (percent >= 30) {
      return 'text-warning';
    }
    return 'text-error';
  };

  const getOccupancyBadge = (percent: number) => {
    if (percent > 80) {
      return 'border-success/20 bg-success/10 text-success';
    }
    if (percent >= 30) {
      return 'border-warning/20 bg-warning/10 text-warning';
    }
    return 'border-error/20 bg-error/10 text-error';
  };

  const global = occupancy?.global;
  let resources: OccupancyData[] = occupancy?.data ? Object.values(occupancy.data) : [];
  if (hideFullResources) {
    resources = resources.filter((resource) => resource.occupancyPercent < 100);
  }

  const totalResourceCount = resources.length;
  const ecoResourceCount = resources.filter((resource) => /ecografie|eco|doppler|mamografie|mamo/i.test(resource.name)).length;

  const sortedResources = [...resources].sort((left, right) => {
    if (!sortConfig) {
      return 0;
    }

    if (sortConfig.key === 'name') {
      if (left.name < right.name) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (left.name > right.name) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    }

    if (left.occupancyPercent < right.occupancyPercent) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (left.occupancyPercent > right.occupancyPercent) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const allDaysSet = new Set<string>();
  for (const resource of resources) {
    Object.keys(resource.daily).forEach((day) => allDaysSet.add(day));
  }
  const sortedDays = Array.from(allDaysSet).sort();

  return (
    <div className="space-y-6">
      <div className="card border border-base-200 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-4 sm:p-6 lg:flex-row lg:items-end">
          <div className="flex-1">
            <h2 className="card-title mb-2 flex items-center gap-2 text-base text-base-content/70">
              <CalendarRange size={18} /> {headerTitle}
            </h2>
            <p className="text-sm text-base-content/55">{headerDescription}</p>
          </div>

          <div className="flex w-full flex-col gap-4 lg:w-auto lg:flex-row lg:items-end">
            {hideLocationSelector ? (
              <div className="form-control min-w-0 lg:min-w-56">
                <label className="label">
                  <span className="label-text font-semibold">Locație proiect</span>
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-base-300 bg-base-200 px-4 py-3 text-sm font-medium text-base-content/75">
                  <MapPin size={15} className="text-primary" />
                  {initialLocationName || 'Locație proiect'}
                </div>
              </div>
            ) : (
              <div className="w-full lg:w-72">
                <h2 className="mb-2 flex items-center gap-2 text-base text-base-content/70">
                  <CalendarRange size={18} /> Parametri ocupare
                </h2>
                <LocationSelector selectedLocation={selectedLocation} onChange={setSelectedLocation} />
              </div>
            )}

            <label className="form-control w-full lg:w-auto">
              <span className="label">
                <span className="label-text font-semibold">Data început</span>
              </span>
              <input
                type="date"
                className="input input-bordered focus:bg-base-200"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>

            <label className="form-control w-full lg:w-auto">
              <span className="label">
                <span className="label-text font-semibold">Data final</span>
              </span>
              <input
                type="date"
                className="input input-bordered focus:bg-base-200"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:ml-auto lg:w-auto lg:flex-nowrap lg:items-center">
              <label className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2 sm:w-auto">
                <span className="label-text whitespace-nowrap text-sm font-semibold">Ascunde complet ocupate</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={hideFullResources}
                  onChange={(event) => setHideFullResources(event.target.checked)}
                />
              </label>

              {occupancy && !isFetching ? (
                <button
                  type="button"
                  onClick={handleSharePublic}
                  className="btn btn-outline w-full shadow-sm sm:w-auto"
                  title="Copiază linkul public"
                >
                  <ExternalLink size={18} /> {copiedLink ? 'Link copiat' : 'Copiază link public'}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void refetch()}
                disabled={!selectedLocation || isFetching}
                className="btn btn-primary w-full shadow-sm sm:w-auto"
              >
                {isFetching || isLoading ? <span className="loading loading-spinner" /> : <Activity size={18} />}
                Recalculează
              </button>
            </div>
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-base-content shadow-sm">
          Eroare la încărcare: {(error as Error)?.message || 'Nu am putut calcula ocuparea.'}
        </div>
      ) : null}

      {global && !isFetching ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-base-content/45">
              <Layers size={16} />
              Cabinete afișate
            </div>
            <div className="text-3xl font-semibold text-base-content">
              <AnimatedNumber value={totalResourceCount} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-base-content/60">
              <Stethoscope size={14} className="text-base-content/45" />
              <span>
                <span className="font-semibold text-base-content">
                  <AnimatedNumber value={ecoResourceCount} />
                </span>{' '}
                cabinete eco, doppler sau mamografie
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-base-content/45">
              <CalendarDays size={16} />
              Capacitate
            </div>
            <div className="text-3xl font-semibold text-base-content">
              <AnimatedNumber value={global.total} />
            </div>
            <p className="mt-1 text-sm text-base-content/55">locuri totale în intervalul selectat</p>
            <p className="mt-3 text-sm text-base-content/60">
              <span className="font-semibold text-base-content">
                <AnimatedNumber value={global.available} />
              </span>{' '}
              încă disponibile
            </p>
          </div>

          <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-base-content/45">
              <Activity size={16} />
              Grad de ocupare
            </div>
            <div className={`text-3xl font-semibold ${getOccupancyColor(global.occupancyPercent)}`}>
              <AnimatedNumber value={global.occupancyPercent} isPercent />%
            </div>
            <p className="mt-1 text-sm text-base-content/55">
              <span className="font-semibold text-base-content">
                <AnimatedNumber value={global.booked} />
              </span>{' '}
              programări din{' '}
              <span className="font-semibold text-base-content">
                <AnimatedNumber value={global.total} />
              </span>
            </p>
            <div className="mt-4 h-2 rounded-full bg-base-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  global.occupancyPercent > 80
                    ? 'bg-success/70'
                    : global.occupancyPercent >= 30
                      ? 'bg-warning/70'
                      : 'bg-error/70'
                }`}
                style={{ width: `${Math.min(global.occupancyPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {resources.length > 0 && !isFetching ? (
        <div className="card mt-6 border border-base-200 bg-base-100 shadow-sm">
          <div className="space-y-3 p-4 md:hidden">
            {sortedResources.map((resource) => {
              const activeDays = sortedDays.filter((day) => {
                const dayData = resource.daily[day];
                return Boolean(dayData && dayData.total > 0);
              });

              return (
                <article key={resource.resourceId} className="rounded-2xl border border-base-200 bg-base-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-base-content">{resource.name}</h3>
                      <p className="mt-1 text-xs text-base-content/55">
                        {resource.booked} ocupate din {resource.total} locuri
                      </p>
                    </div>
                    <span className={`badge badge-sm font-semibold ${getOccupancyBadge(resource.occupancyPercent)}`}>
                      {resource.occupancyPercent.toFixed(0)}%
                    </span>
                  </div>

                  {activeDays.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {activeDays.map((day) => {
                        const dayData = resource.daily[day];
                        if (!dayData || dayData.total === 0) {
                          return null;
                        }

                        return (
                          <div key={day} className="flex items-center justify-between gap-3 rounded-xl bg-base-200/40 px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-base-content">{formatOccupancyDay(day)}</div>
                              <div className="text-[11px] text-base-content/55">
                                {dayData.booked} / {dayData.total}
                              </div>
                            </div>
                            <span className={`text-sm font-semibold ${getOccupancyColor(dayData.occupancyPercent)}`}>
                              {dayData.occupancyPercent.toFixed(0)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-base-200/30 px-3 py-2 text-xs text-base-content/55">
                      Fără sloturi în intervalul selectat.
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="table table-md">
              <thead className="bg-base-200/50">
                <tr>
                  <th
                    className="min-w-[200px] cursor-pointer select-none font-bold transition-colors hover:bg-base-300"
                      onClick={() => handleSort('name')}
                    >
                    <div className="flex items-center gap-2">
                      Cabinet
                      {sortConfig?.key === 'name'
                        ? sortConfig.direction === 'asc'
                          ? <ChevronUp size={14} />
                          : <ChevronDown size={14} />
                        : null}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer border-l border-base-300 bg-base-200 text-center font-bold transition-colors hover:bg-base-300"
                    onClick={() => handleSort('occupancyPercent')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Ocupare totală
                      {sortConfig?.key === 'occupancyPercent'
                        ? sortConfig.direction === 'asc'
                          ? <ChevronUp size={14} />
                          : <ChevronDown size={14} />
                        : null}
                    </div>
                  </th>
                  {sortedDays.map((day) => (
                    <th key={day} className="border-l border-base-300 text-center text-xs opacity-70">
                      {formatOccupancyDay(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResources.map((resource) => (
                  <tr key={resource.resourceId} className="hover:bg-base-200/20">
                    <td className="font-semibold">{resource.name}</td>
                    <td className="border-l border-base-300 bg-base-200/30 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`badge badge-sm font-semibold ${getOccupancyBadge(resource.occupancyPercent)}`}>
                          {resource.occupancyPercent.toFixed(0)}%
                        </span>
                        <div className="font-mono text-[10px] opacity-60">
                          {resource.booked} / {resource.total}
                        </div>
                      </div>
                    </td>

                    {sortedDays.map((day) => {
                      const dayData = resource.daily[day];
                      if (!dayData || dayData.total === 0) {
                        return <td key={day} className="border-l border-base-200 text-center opacity-20">-</td>;
                      }

                      return (
                        <td key={day} className="border-l border-base-200 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-xs font-semibold ${getOccupancyColor(dayData.occupancyPercent)}`}>
                              {dayData.occupancyPercent.toFixed(0)}%
                            </span>
                            <div className="whitespace-nowrap text-[10px] opacity-60">
                              {dayData.booked} / {dayData.total}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!isFetching && !global && !isError ? (
        <div className="hero mt-12 rounded-box border border-base-200 bg-base-200/30 py-16">
          <div className="hero-content text-center opacity-60">
            <div className="max-w-md">
              <Activity className="mx-auto mb-4 opacity-50" size={48} />
              <h1 className="text-xl font-bold">{headerTitle}</h1>
              <p className="py-2 text-sm">{headerDescription}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
