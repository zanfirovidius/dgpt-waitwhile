'use client';

import { getLocationDetails, getOccupancy, OccupancyData } from '@/app/actions/waitwhile';
import LocationSelector from '@/components/LocationSelector';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, CalendarRange, ChevronDown, ChevronUp, ExternalLink, Hash } from 'lucide-react';
import { useEffect, useState } from 'react';

type SortConfig = {
  key: 'name' | 'occupancyPercent';
  direction: 'asc' | 'desc';
} | null;

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

export default function OccupancyPage() {
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  
  // Default to today to next week
  const [fromDate, setFromDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const [toDate, setToDate] = useState<string>(
    nextWeek.toISOString().split('T')[0]
  );
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'occupancyPercent', direction: 'desc' });
  const [copiedLink, setCopiedLink] = useState(false);

  // Auto-fetch special dates when location changes
  useEffect(() => {
    if (!selectedLocation) return;
    
    let isMounted = true;
    (async () => {
      try {
        const res = await getLocationDetails(selectedLocation);
        if (res.success && res.data && isMounted) {
          const loc = res.data;
          
          if (loc.hoursByDate && Object.keys(loc.hoursByDate).length > 0) {
            const dateKeys = Object.keys(loc.hoursByDate);
            let earliest = '9999-12-31';
            let latest = '0000-01-01';

            dateKeys.forEach((keyStr: string) => {
              // Waitwhile stores them as "YYYYMMDD", e.g. "20260301"
              if (keyStr.length === 8) {
                const yyyy = keyStr.substring(0, 4);
                const mm = keyStr.substring(4, 6);
                const dd = keyStr.substring(6, 8);
                const formattedDate = `${yyyy}-${mm}-${dd}`;
                
                if (formattedDate < earliest) earliest = formattedDate;
                if (formattedDate > latest) latest = formattedDate;
              }
            });

            if (earliest !== '9999-12-31') {
              setFromDate(earliest);
              setToDate(latest);
            }
          }
        }
      } catch(e) {
        console.error("Error auto-dating", e);
      }
    })();
    return () => { isMounted = false; };
  }, [selectedLocation]);

  const { data: occupancy, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['waitwhile-occupancy', selectedLocation, fromDate, toDate],
    queryFn: async () => {
      if (!selectedLocation) return null;
      const res = await getOccupancy(selectedLocation, fromDate, toDate);
      if (!res.success) throw new Error(res.error);
      return res;
    },
    enabled: false, // Wait for manual triggering
  });

  const handleCalculate = () => {
    if (selectedLocation && fromDate && toDate) {
      refetch();
    }
  };

  const handleSharePublic = () => {
    if (!selectedLocation || !fromDate || !toDate) return;
    const url = new URL('/public/occupancy', window.location.origin);
    url.searchParams.set('location', selectedLocation);
    url.searchParams.set('from', fromDate);
    url.searchParams.set('to', toDate);
    
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

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

  const global = occupancy?.global;
  const resources: OccupancyData[] = occupancy?.data ? Object.values(occupancy.data) : [];
  
  // Sort resources dynamically
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

  // Collect all unique days for the column headers
  const allDaysSet = new Set<string>();
  resources.forEach(r => Object.keys(r.daily).forEach(d => allDaysSet.add(d)));
  const sortedDays = Array.from(allDaysSet).sort();

  return (
    <div className="space-y-6">
      {/* Top Configuration Filter */}
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body gap-6 sm:flex-row items-end">
          <div className="flex-1 w-full sm:w-1/3">
            <h2 className="card-title text-base text-base-content/70 mb-2 flex items-center gap-2">
              <CalendarRange size={18} /> Schedule Parameters
            </h2>
            <LocationSelector 
              selectedLocation={selectedLocation} 
              onChange={setSelectedLocation} 
            />
          </div>
          
          <div className="form-control w-full sm:w-auto">
            <label className="label">
              <span className="label-text font-semibold">Start Date</span>
            </label>
            <input 
              type="date" 
              className="input input-bordered focus:bg-base-200" 
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="form-control w-full sm:w-auto">
            <label className="label">
              <span className="label-text font-semibold">End Date</span>
            </label>
            <input 
              type="date" 
              className="input input-bordered focus:bg-base-200" 
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {occupancy && !isFetching && (
              <button 
                onClick={handleSharePublic}
                className="btn btn-secondary shadow-lg shadow-secondary/20"
                title="Copy Sharable Public Link"
              >
                <ExternalLink size={18} /> {copiedLink ? "Copied!" : "Share Board"}
              </button>
            )}

            <button 
              onClick={handleCalculate}
              disabled={!selectedLocation || isFetching}
              className="btn btn-primary shadow-lg shadow-primary/20"
            >
              {isFetching ? <span className="loading loading-spinner"></span> : <Activity size={18} />} Calculate
            </button>
          </div>
        </div>
      </div>

      {isError && (
         <div className="alert alert-error shadow-lg">
           <span>Error loading data: {(error as any)?.message}</span>
         </div>
      )}

      {/* Global Overview Cards */}
      {global && !isFetching && (
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
      {resources.length > 0 && !isFetching && (
        <div className="card bg-base-100 shadow-xl border border-base-200 mt-6">
          <div className="card-body p-0 overflow-x-auto">
            <table className="table table-md">
              <thead className="bg-base-200/50">
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
                     className="font-bold text-center border-l border-base-300 bg-base-200 cursor-pointer hover:bg-base-300 transition-colors select-none"
                     onClick={() => handleSort('occupancyPercent')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      TOTAL OCCUPANCY
                      {sortConfig?.key === 'occupancyPercent' && (
                         sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                       )}
                    </div>
                  </th>
                  {sortedDays.map(day => (
                    <th key={day} className="text-center text-xs opacity-70 border-l border-base-300">
                      {new Date(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResources.map(res => (
                  <tr key={res.resourceId} className="hover:bg-base-200/20">
                    <td className="font-semibold">{res.name}</td>
                    
                    {/* Overall Cell */}
                    <td className="text-center border-l border-base-300 bg-base-200/30">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`badge badge-sm font-bold ${getOccupancyBadge(res.occupancyPercent)}`}>
                          {res.occupancyPercent.toFixed(0)}%
                        </span>
                        <div className="text-[10px] font-mono opacity-60">
                          {res.booked} / {res.total}
                        </div>
                      </div>
                    </td>

                    {/* Daily Cells */}
                    {sortedDays.map(day => {
                      const dayData = res.daily[day];
                      if (!dayData || dayData.total === 0) {
                        return <td key={day} className="text-center border-l border-base-200 opacity-20">-</td>;
                      }
                      return (
                        <td key={day} className="text-center border-l border-base-200">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-xs font-bold ${getOccupancyColor(dayData.occupancyPercent)}`}>
                              {dayData.occupancyPercent.toFixed(0)}%
                            </span>
                            <div className="text-[10px] whitespace-nowrap opacity-60">
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
      )}

      {/* Initial state placeholder */}
      {!isFetching && !global && !isError && (
        <div className="hero mt-12 bg-base-200/30 rounded-box border border-base-200 py-16">
          <div className="hero-content text-center opacity-60">
            <div className="max-w-md">
              <Activity className="mx-auto mb-4 opacity-50" size={48} />
              <h1 className="text-xl font-bold">Occupancy Dashboard</h1>
              <p className="py-2 text-sm">Select a location and timeframe above to calculate the occupancy rate block matrix.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
