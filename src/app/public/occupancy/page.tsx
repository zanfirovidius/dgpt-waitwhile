'use client';

import { getOccupancy, OccupancyData, getLocationDetails } from '@/app/actions/waitwhile';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, ChevronDown, ChevronUp, Layers, Stethoscope } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

type SortConfig = {
  key: 'name' | 'occupancyPercent';
  direction: 'asc' | 'desc';
} | null;

function AnimatedCell({ children, toneClassName }: { children: React.ReactNode, toneClassName?: string }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center rounded-xl p-2 ${toneClassName ?? ''}`}>
      {children}
    </div>
  );
}

function AnimatedNumber({ value, isPercent = false }: { value: number, isPercent?: boolean }) {
  return <>{isPercent ? value.toFixed(1) : Math.round(value)}</>;
}

function formatOccupancyDay(day: string) {
  const parsedDate = new Date(day);
  if (Number.isNaN(parsedDate.getTime())) {
    return day;
  }

  return parsedDate.toLocaleDateString('ro-RO', { weekday: 'short', month: 'short', day: 'numeric' });
}

function PublicDashboard() {
  const searchParams = useSearchParams();
  const selectedLocation = searchParams.get('location') || '';
  const fromDate = searchParams.get('from') || '';
  const toDate = searchParams.get('to') || '';

  const [hideFullResources, setHideFullResources] = useState(() => searchParams.get('hideFull') === 'true');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'occupancyPercent', direction: 'desc' });

  const { data: occupancy, isLoading, isError, error } = useQuery({
    queryKey: ['waitwhile-occupancy', selectedLocation, fromDate, toDate],
    queryFn: async () => {
      if (!selectedLocation || !fromDate || !toDate) return null;
      const res = await getOccupancy(selectedLocation, fromDate, toDate);
      if (!res.success) throw new Error(res.error);
      return res;
    },
    enabled: !!selectedLocation && !!fromDate && !!toDate,
    refetchInterval: 30000, // Live auto-refresh every 30 seconds
  });

  const { data: locationDetails } = useQuery({
    queryKey: ['waitwhile-location', selectedLocation],
    queryFn: async () => {
      if (!selectedLocation) return null;
      const res = await getLocationDetails(selectedLocation);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: !!selectedLocation,
  });

  const handleSort = (key: 'name' | 'occupancyPercent') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getOccupancyColor =(percent: number) => {
    if (percent > 80) return 'text-success'; // Green
    if (percent >= 30) return 'text-warning'; // Orange
    return 'text-error'; // Red
  };

  const getOccupancyBadge = (percent: number) => {
    if (percent > 80) return 'border-success/20 bg-success/10 text-success';
    if (percent >= 30) return 'border-warning/20 bg-warning/10 text-warning';
    return 'border-error/20 bg-error/10 text-error';
  };

  const getOccupancySurface = (percent: number) => {
    if (percent > 80) return 'border-success/20 bg-success/10';
    if (percent >= 30) return 'border-warning/25 bg-warning/10';
    return 'border-error/20 bg-error/10';
  };

  const getOccupancyCellTone = (percent: number) => {
    if (percent > 80) return 'bg-success/5';
    if (percent >= 30) return 'bg-warning/10';
    return 'bg-error/5';
  };

  if (!selectedLocation || !fromDate || !toDate) {
	    return (
	      <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center text-base-content/60">
	        <Activity size={48} className="mb-4 opacity-50" />
	        <h1 className="ui-section-title text-base-content">Link invalid pentru gradul de ocupare</h1>
	        <p className="ui-body mt-2 text-base-content/60">Lipsesc parametrii necesari pentru locație sau interval.</p>
	      </div>
	    );
	  }

  const global = occupancy?.global;
  let resources: OccupancyData[] = occupancy?.data ? Object.values(occupancy.data) : [];
  
  if (hideFullResources) {
    resources = resources.filter(r => r.occupancyPercent < 100);
  }
  
  const totalResourceCount = resources.length;
  const ecoResourceCount = resources.filter(r => /ecografie|eco|doppler|mamografie|mamo/i.test(r.name)).length;

  const sortedResources = [...resources].sort((a, b) => {
    if (!sortConfig) return 0;
    if (sortConfig.key === 'name') {
       if (a.name < b.name) return sortConfig.direction === 'asc' ? -1 : 1;
       if (a.name > b.name) return sortConfig.direction === 'asc' ? 1 : -1;
       return 0;
    }
    if (sortConfig.key === 'occupancyPercent') {
       if (a.occupancyPercent < b.occupancyPercent) return sortConfig.direction === 'asc' ? -1 : 1;
       if (a.occupancyPercent > b.occupancyPercent) return sortConfig.direction === 'asc' ? 1 : -1;
       return 0;
    }
    return 0;
  });

  const allDaysSet = new Set<string>();
  resources.forEach(r => Object.keys(r.daily).forEach(d => allDaysSet.add(d)));
  const sortedDays = Array.from(allDaysSet).sort();

	return (
	    <div className="ui-page-wash mx-auto min-h-screen max-w-[1600px] space-y-6 bg-base-200/30 p-4 md:p-8">
	      <div className="ui-surface-sky flex flex-col justify-between gap-4 rounded-[1.75rem] border bg-base-100 p-6 md:flex-row md:items-center">
	         <div>
	            <h1 className="ui-display-title max-w-4xl text-base-content">
	              Grad de ocupare în timp real
	              {locationDetails?.name && (
	                <span className="ui-text-sky mt-2 block text-[1rem] font-medium tracking-normal sm:ml-3 sm:mt-0 sm:inline">
	                  {locationDetails.name}
	                </span>
	              )}
	            </h1>
	            <p className="ui-body ui-tabular mt-2 text-base-content/60">
	              Se actualizează automat la fiecare 30 de secunde • {fromDate} - {toDate}
	            </p>
	         </div>
	         <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
		           <label className="ui-panel-sky flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 sm:w-auto">
	             <span className="ui-field-label whitespace-nowrap">Ascunde complet ocupate</span>
	             <input 
	               type="checkbox" 
               className="toggle toggle-sm toggle-primary" 
               checked={hideFullResources}
               onChange={(e) => setHideFullResources(e.target.checked)}
             />
           </label>
		           {isLoading && (
		             <div className="ui-badge-sky flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
		               <span className="loading loading-ring loading-md"></span> Actualizăm datele...
		             </div>
		           )}
         </div>
      </div>

	      {isError && (
	         <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-base-content shadow-sm">
	           Eroare de conexiune: {error instanceof Error ? error.message : 'Nu am putut actualiza datele. Reîncercăm în fundal.'}
	         </div>
	      )}

      {global && (
		        <div className="grid gap-4 md:grid-cols-3">
		          <div className="ui-surface-teal rounded-2xl border bg-base-100 p-5 shadow-sm">
		            <div className="ui-label ui-text-teal mb-4 flex items-center gap-2">
		              <Layers size={16} />
	              Cabinete afișate
	            </div>
	            <div className="ui-number text-base-content">
	              <AnimatedNumber value={totalResourceCount} />
	            </div>
		            <div className="mt-3 flex items-center gap-2 text-[0.95rem] leading-6 text-base-content/60">
		              <Stethoscope size={14} className="ui-text-teal" />
	              <span>
	                <span className="ui-tabular font-semibold text-base-content">
	                  <AnimatedNumber value={ecoResourceCount} />
	                </span>{' '}
	                cabinete eco, doppler sau mamografie
              </span>
            </div>
          </div>

		          <div className="ui-surface-sky rounded-2xl border bg-base-100 p-5 shadow-sm">
		            <div className="ui-label ui-text-sky mb-4 flex items-center gap-2">
		              <CalendarDays size={16} />
	              Capacitate
	            </div>
	            <div className="ui-number text-base-content">
	              <AnimatedNumber value={global.total} />
	            </div>
	            <p className="mt-1 text-[0.95rem] leading-6 text-base-content/55">locuri totale în intervalul selectat</p>
	            <p className="mt-3 text-[0.95rem] leading-6 text-base-content/60">
	              <span className="ui-tabular font-semibold text-base-content">
	                <AnimatedNumber value={global.available} />
	              </span>{' '}
	              încă disponibile
            </p>
          </div>

		          <div className={`rounded-2xl border bg-base-100 p-5 shadow-sm ${getOccupancySurface(global.occupancyPercent)}`}>
		            <div className="ui-label mb-4 flex items-center gap-2">
		              <Activity size={16} />
	              Grad de ocupare
	            </div>
	            <div className={`ui-number ${getOccupancyColor(global.occupancyPercent)}`}>
	              <AnimatedNumber value={global.occupancyPercent} isPercent />%
	            </div>
	            <p className="mt-1 text-[0.95rem] leading-6 text-base-content/55">
	              <span className="ui-tabular font-semibold text-base-content">
	                <AnimatedNumber value={global.booked} />
	              </span>{' '}
	              programări din{' '}
	              <span className="ui-tabular font-semibold text-base-content">
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
      )}

      {resources.length > 0 && (
	        <div className="ui-surface-sky card mt-6 border bg-base-100 shadow-sm">
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
	                      <h3 className="truncate text-[0.98rem] font-semibold leading-5 text-base-content">{resource.name}</h3>
	                      <p className="ui-tabular mt-1 text-[0.8rem] text-base-content/55">
	                        {resource.booked} ocupate din {resource.total} locuri
	                      </p>
	                    </div>
	                    <span className={`badge badge-sm ui-tabular font-semibold ${getOccupancyBadge(resource.occupancyPercent)}`}>
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
		                          <div key={day} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${getOccupancyCellTone(dayData.occupancyPercent)}`}>
	                            <div className="min-w-0">
	                              <div className="text-[0.82rem] font-semibold leading-5 text-base-content">{formatOccupancyDay(day)}</div>
	                              <div className="ui-tabular text-[0.74rem] text-base-content/55">
	                                {dayData.booked} / {dayData.total}
	                              </div>
	                            </div>
	                            <span className={`ui-tabular text-[0.92rem] font-semibold ${getOccupancyColor(dayData.occupancyPercent)}`}>
	                              {dayData.occupancyPercent.toFixed(0)}%
	                            </span>
	                          </div>
                        );
                      })}
                    </div>
	                  ) : (
	                    <div className="mt-4 rounded-xl bg-base-200/30 px-3 py-2 text-[0.82rem] leading-5 text-base-content/55">
	                      Fără sloturi în intervalul selectat.
	                    </div>
	                  )}
                </article>
              );
            })}
          </div>

	          <div className="hidden overflow-x-auto md:block">
	            <table className="table table-md">
	              <thead className="bg-base-200/50 relative z-10 block w-full overflow-hidden" style={{display: 'table-header-group'}}>
	                <tr>
	                  <th 
	                    className="ui-label min-w-[200px] cursor-pointer select-none text-left transition-colors hover:bg-base-300"
	                    onClick={() => handleSort('name')}
	                  >
	                    <div className="flex items-center gap-2">
                       Cabinet
                       {sortConfig?.key === 'name' && (
                         sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                       )}
                    </div>
	                  </th>
	                  <th 
	                     className="ui-label min-w-[120px] cursor-pointer select-none border-l border-base-300 bg-base-200 text-center transition-colors hover:bg-base-300"
	                     onClick={() => handleSort('occupancyPercent')}
	                  >
                    <div className="flex items-center justify-center gap-2">
                      Ocupare totală
                      {sortConfig?.key === 'occupancyPercent' && (
                         sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                       )}
                    </div>
	                  </th>
	                  {sortedDays.map(day => (
	                    <th key={day} className="ui-label min-w-[80px] border-l border-base-300 text-center opacity-70">
	                      {formatOccupancyDay(day)}
	                    </th>
	                  ))}
	                </tr>
              </thead>
	              <tbody className="block w-full" style={{display: 'table-row-group'}}>
	                {sortedResources.map(res => (
	                  <tr key={res.resourceId} className="hover:bg-base-200/20">
	                    <td className="text-[0.95rem] font-semibold text-base-content">{res.name}</td>
	                    
	                    <td className="text-center border-l border-base-300 bg-base-200/30">
		                      <AnimatedCell toneClassName={getOccupancyCellTone(res.occupancyPercent)}>
	                        <span className={`badge badge-sm ui-tabular font-semibold ${getOccupancyBadge(res.occupancyPercent)}`}>
	                          {res.occupancyPercent.toFixed(0)}%
	                        </span>
	                        <div className="ui-tabular text-[0.72rem] font-mono opacity-60">
	                          {res.booked} / {res.total}
	                        </div>
	                      </AnimatedCell>
                    </td>

	                    {sortedDays.map(day => {
	                      const dayData = res.daily[day];
	                      if (!dayData || dayData.total === 0) {
	                        return <td key={day} className="ui-tabular text-center border-l border-base-200 text-[0.8rem] opacity-20">-</td>;
	                      }
	                      return (
	                        <td key={day} className="text-center border-l border-base-200">
		                          <AnimatedCell toneClassName={getOccupancyCellTone(dayData.occupancyPercent)}>
	                            <span className={`ui-tabular text-[0.8rem] font-semibold ${getOccupancyColor(dayData.occupancyPercent)}`}>
	                              {dayData.occupancyPercent.toFixed(0)}%
	                            </span>
	                            <div className="ui-tabular whitespace-nowrap text-[0.72rem] opacity-60">
	                              {dayData.booked} / {dayData.total}
	                            </div>
	                          </AnimatedCell>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

	      {!isLoading && !isError && global && resources.length === 0 ? (
		        <div className="ui-panel-sky rounded-2xl border px-6 py-10 text-center shadow-sm">
	          <Activity className="mx-auto mb-3 text-base-content/35" size={32} />
	          <h2 className="ui-section-title text-base-content">Nu există cabinete de afișat</h2>
	          <p className="ui-body mx-auto mt-2 text-base-content/60">
	            În intervalul selectat nu am găsit cabinete disponibile pentru această locație.
	          </p>
	        </div>
      ) : null}
    </div>
  );
}

export default function PublicOccupancyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-base-300">
         <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    }>
      <PublicDashboard />
    </Suspense>
  );
}
