'use client';

import { getOccupancy, OccupancyData } from '@/app/actions/waitwhile';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, ChevronDown, ChevronUp, Hash } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

type SortConfig = {
  key: 'name' | 'occupancyPercent';
  direction: 'asc' | 'desc';
} | null;

function AnimatedCell({ value, children }: { value: string | number, children: React.ReactNode }) {
  const [pulse, setPulse] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    // Fire the animation if the value changes from what it previously was
    if (prevRef.current !== undefined && prevRef.current !== value) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 3000); // 3-second highlight
      prevRef.current = value;
      return () => clearTimeout(timer);
    }
    prevRef.current = value;
  }, [value]);

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center p-1 rounded-md transition-all duration-700 origin-center ${pulse ? 'bg-primary/30 ring-2 ring-primary scale-110 shadow-xl z-20 relative' : ''}`}>
      {children}
    </div>
  );
}

function AnimatedNumber({ value, isPercent = false }: { value: number, isPercent?: boolean }) {
  const [displayValue, setDisplayValue] = useState(value);
  
  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1000; // 1 second animation
    const initialValue = displayValue;
    const endValue = value;
    
    if (initialValue === endValue) return;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // easeOutQuart
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

function PublicDashboard() {
  const searchParams = useSearchParams();
  const selectedLocation = searchParams.get('location') || '';
  const fromDate = searchParams.get('from') || '';
  const toDate = searchParams.get('to') || '';

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
    if (percent > 80) return 'badge-success text-white shadow-success/20 shadow-md'; // Green
    if (percent >= 30) return 'badge-warning text-warning-content shadow-warning/20 shadow-md'; // Orange
    return 'badge-error text-white shadow-error/20 shadow-md'; // Red
  };

  if (!selectedLocation || !fromDate || !toDate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center text-base-content/60">
        <Activity size={48} className="mb-4 opacity-50" />
        <h1 className="text-2xl font-bold text-base-content">Invalid Dashboard Link</h1>
        <p>This public link is missing required location or date parameters.</p>
      </div>
    );
  }

  const global = occupancy?.global;
  const resources: OccupancyData[] = occupancy?.data ? Object.values(occupancy.data) : [];
  
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
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen bg-base-300">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-base-100 p-6 rounded-2xl shadow-xl border border-base-200">
         <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              Waitwhile Real-Time Occupancy
            </h1>
            <p className="text-sm text-base-content/60 mt-1 font-mono">
              Live updates every 30s • {fromDate} to {toDate}
            </p>
         </div>
         {isLoading && (
           <div className="flex items-center gap-2 text-primary font-semibold bg-primary/10 px-4 py-2 rounded-full">
             <span className="loading loading-ring loading-md"></span> Syncing Live Data...
           </div>
         )}
      </div>

      {isError && (
         <div className="alert alert-error shadow-lg">
           <span>Connection Error: {(error as any)?.message}. Retrying in background...</span>
         </div>
      )}

      {/* Global Overview Cards */}
      {global && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="stats shadow bg-base-100 border border-base-200">
            <div className="stat">
              <div className="stat-figure text-base-content/50"><Hash size={32} /></div>
              <div className="stat-title font-semibold">Total Capacity Slots</div>
              <div className="stat-value text-2xl"><AnimatedNumber value={global.total} /></div>
            </div>
          </div>
          <div className="stats shadow bg-base-100 border border-base-200">
            <div className="stat">
              <div className="stat-figure text-success"><Activity size={32} /></div>
              <div className="stat-title font-semibold">Created Bookings</div>
              <div className="stat-value text-2xl"><AnimatedNumber value={global.booked} /></div>
              <div className="stat-desc text-success">Scheduled</div>
            </div>
          </div>
          <div className="stats shadow bg-base-100 border border-base-200">
            <div className="stat">
              <div className="stat-figure text-info"><CalendarDays size={32} /></div>
              <div className="stat-title font-semibold">Remaining Available</div>
              <div className="stat-value text-2xl"><AnimatedNumber value={global.available} /></div>
              <div className="stat-desc text-info">Free slots</div>
            </div>
          </div>
          <div className="stats shadow bg-base-100 border border-base-200">
            <div className="stat">
              <div className="stat-figure"><div className={`radial-progress transition-all duration-1000 ease-out ${getOccupancyColor(global.occupancyPercent)}`} style={{"--value": global.occupancyPercent, "--size": "3rem"} as any}></div></div>
              <div className="stat-title font-semibold">Global Occupancy</div>
              <div className={`stat-value text-2xl ${getOccupancyColor(global.occupancyPercent)}`}>
                <AnimatedNumber value={global.occupancyPercent} isPercent />%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matrix Table */}
      {resources.length > 0 && (
        <div className="card bg-base-100 shadow-xl border border-base-200 mt-6">
          <div className="card-body p-0 overflow-x-auto">
            <table className="table table-md">
              <thead className="bg-base-200/50 relative z-10 block w-full overflow-hidden" style={{display: 'table-header-group'}}>
                <tr>
                  <th 
                    className="font-bold min-w-[200px] cursor-pointer hover:bg-base-300 transition-colors select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-2">
                       Cabinet Resource
                       {sortConfig?.key === 'name' && (
                         sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                       )}
                    </div>
                  </th>
                  <th 
                     className="font-bold text-center border-l border-base-300 bg-base-200 cursor-pointer hover:bg-base-300 transition-colors select-none min-w-[120px]"
                     onClick={() => handleSort('occupancyPercent')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      TOTAL %
                      {sortConfig?.key === 'occupancyPercent' && (
                         sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                       )}
                    </div>
                  </th>
                  {sortedDays.map(day => (
                    <th key={day} className="text-center text-xs opacity-70 border-l border-base-300 min-w-[80px]">
                      {new Date(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block w-full" style={{display: 'table-row-group'}}>
                {sortedResources.map(res => (
                  <tr key={res.resourceId} className="hover:bg-base-200/20">
                    <td className="font-semibold">{res.name}</td>
                    
                    <td className="text-center border-l border-base-300 bg-base-200/30">
                      <AnimatedCell value={`${res.booked}-${res.total}`}>
                        <span className={`badge badge-sm font-bold ${getOccupancyBadge(res.occupancyPercent)}`}>
                          {res.occupancyPercent.toFixed(0)}%
                        </span>
                        <div className="text-[10px] font-mono opacity-60">
                          {res.booked} / {res.total}
                        </div>
                      </AnimatedCell>
                    </td>

                    {sortedDays.map(day => {
                      const dayData = res.daily[day];
                      if (!dayData || dayData.total === 0) {
                        return <td key={day} className="text-center border-l border-base-200 opacity-20">-</td>;
                      }
                      return (
                        <td key={day} className="text-center border-l border-base-200">
                          <AnimatedCell value={`${dayData.booked}-${dayData.total}`}>
                            <span className={`text-xs font-bold ${getOccupancyColor(dayData.occupancyPercent)}`}>
                              {dayData.occupancyPercent.toFixed(0)}%
                            </span>
                            <div className="text-[10px] whitespace-nowrap opacity-60">
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
