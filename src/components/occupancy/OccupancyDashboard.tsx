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
  Hash,
  Layers,
  MapPin,
  Stethoscope,
} from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';

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

export function OccupancyDashboard({
  autoDateFromLocation = true,
  headerDescription = 'Selectează locația și intervalul pentru a calcula gradul de ocupare al cabinetelor.',
  headerTitle = 'Occupancy Dashboard',
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
      } catch (error) {
        console.error('[Occupancy] auto-dating error', error);
      }
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
      return 'badge-success text-white shadow-success/20 shadow-md';
    }
    if (percent >= 30) {
      return 'badge-warning text-warning-content shadow-warning/20 shadow-md';
    }
    return 'badge-error text-white shadow-error/20 shadow-md';
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
      <div className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body gap-6 sm:flex-row sm:items-end">
          <div className="flex-1">
            <h2 className="card-title mb-2 flex items-center gap-2 text-base text-base-content/70">
              <CalendarRange size={18} /> {headerTitle}
            </h2>
            <p className="text-sm text-base-content/55">{headerDescription}</p>
          </div>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-end">
            {hideLocationSelector ? (
              <div className="form-control min-w-56">
                <label className="label">
                  <span className="label-text font-semibold">Locație proiect</span>
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-base-300 bg-base-200 px-4 py-3 text-sm font-medium text-base-content/75">
                  <MapPin size={15} className="text-primary" />
                  {initialLocationName || 'Locație proiect'}
                </div>
              </div>
            ) : (
              <div className="w-full sm:w-72">
                <h2 className="mb-2 flex items-center gap-2 text-base text-base-content/70">
                  <CalendarRange size={18} /> Parametri occupancy
                </h2>
                <LocationSelector selectedLocation={selectedLocation} onChange={setSelectedLocation} />
              </div>
            )}

            <label className="form-control w-full sm:w-auto">
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

            <label className="form-control w-full sm:w-auto">
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

            <div className="ml-auto flex items-center gap-2">
              <label className="mr-2 flex cursor-pointer items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                <span className="label-text whitespace-nowrap text-sm font-semibold">Ascunde full</span>
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
                  className="btn btn-secondary shadow-lg shadow-secondary/20"
                  title="Copy sharable public link"
                >
                  <ExternalLink size={18} /> {copiedLink ? 'Copied!' : 'Share Board'}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void refetch()}
                disabled={!selectedLocation || isFetching}
                className="btn btn-primary shadow-lg shadow-primary/20"
              >
                {isFetching || isLoading ? <span className="loading loading-spinner" /> : <Activity size={18} />}
                Recalculează
              </button>
            </div>
          </div>
        </div>
      </div>

      {isError ? (
        <div className="alert alert-error shadow-lg">
          <span>Eroare la încărcare: {(error as Error)?.message || 'Nu am putut calcula ocuparea.'}</span>
        </div>
      ) : null}

      {global && !isFetching ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="stats border border-base-200 bg-base-100 shadow">
            <div className="stat px-4 py-3">
              <div className="stat-figure text-base-content/50"><Layers size={24} /></div>
              <div className="stat-title text-xs font-semibold lg:text-sm">Resources</div>
              <div className="stat-value text-xl lg:text-2xl"><AnimatedNumber value={totalResourceCount} /></div>
              <div className="stat-desc text-[10px] lg:text-xs">Total showing</div>
            </div>
          </div>
          <div className="stats border border-base-200 bg-base-100 shadow">
            <div className="stat px-4 py-3">
              <div className="stat-figure text-secondary"><Stethoscope size={24} /></div>
              <div className="stat-title text-xs font-semibold lg:text-sm">Eco/Doppler/Mamo</div>
              <div className="stat-value text-xl text-secondary lg:text-2xl"><AnimatedNumber value={ecoResourceCount} /></div>
              <div className="stat-desc text-[10px] text-secondary lg:text-xs">Matching</div>
            </div>
          </div>
          <div className="stats border border-base-200 bg-base-100 shadow">
            <div className="stat px-4 py-3">
              <div className="stat-figure text-base-content/50"><Hash size={24} /></div>
              <div className="stat-title text-xs font-semibold lg:text-sm">Total Slots</div>
              <div className="stat-value text-xl lg:text-2xl"><AnimatedNumber value={global.total} /></div>
              <div className="stat-desc select-none text-[10px] text-transparent lg:text-xs">-</div>
            </div>
          </div>
          <div className="stats border border-base-200 bg-base-100 shadow">
            <div className="stat px-4 py-3">
              <div className="stat-figure text-success"><Activity size={24} /></div>
              <div className="stat-title text-xs font-semibold lg:text-sm">Bookings</div>
              <div className="stat-value text-xl lg:text-2xl"><AnimatedNumber value={global.booked} /></div>
              <div className="stat-desc text-[10px] text-success lg:text-xs">Scheduled</div>
            </div>
          </div>
          <div className="stats border border-base-200 bg-base-100 shadow">
            <div className="stat px-4 py-3">
              <div className="stat-figure text-info"><CalendarDays size={24} /></div>
              <div className="stat-title text-xs font-semibold lg:text-sm">Available</div>
              <div className="stat-value text-xl lg:text-2xl"><AnimatedNumber value={global.available} /></div>
              <div className="stat-desc text-[10px] text-info lg:text-xs">Free slots</div>
            </div>
          </div>
          <div className="stats border border-base-200 bg-base-100 shadow">
            <div className="stat px-4 py-3">
              <div className="stat-figure">
                <div
                  className={`radial-progress transition-all duration-1000 ease-out ${getOccupancyColor(global.occupancyPercent)}`}
                  style={{ '--value': global.occupancyPercent, '--size': '2.5rem', '--thickness': '3px' } as CSSProperties}
                />
              </div>
              <div className="stat-title text-xs font-semibold lg:text-sm">Occupancy</div>
              <div className={`stat-value text-xl lg:text-2xl ${getOccupancyColor(global.occupancyPercent)}`}>
                <AnimatedNumber value={global.occupancyPercent} isPercent />%
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {resources.length > 0 && !isFetching ? (
        <div className="card mt-6 border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body overflow-x-auto p-0">
            <table className="table table-md">
              <thead className="bg-base-200/50">
                <tr>
                  <th
                    className="min-w-[200px] cursor-pointer select-none font-bold transition-colors hover:bg-base-300"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-2">
                      Cabinet Resource
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
                      TOTAL OCCUPANCY
                      {sortConfig?.key === 'occupancyPercent'
                        ? sortConfig.direction === 'asc'
                          ? <ChevronUp size={14} />
                          : <ChevronDown size={14} />
                        : null}
                    </div>
                  </th>
                  {sortedDays.map((day) => (
                    <th key={day} className="border-l border-base-300 text-center text-xs opacity-70">
                      {new Date(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
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
                        <span className={`badge badge-sm font-bold ${getOccupancyBadge(resource.occupancyPercent)}`}>
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
                            <span className={`text-xs font-bold ${getOccupancyColor(dayData.occupancyPercent)}`}>
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
