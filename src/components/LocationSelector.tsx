'use client';

import type { Location } from '@/app/actions/waitwhile';
import { getLocations } from '@/app/actions/waitwhile';
import { useQuery } from '@tanstack/react-query';
import { MapPin, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

const EMPTY_LOCATIONS: Location[] = [];

interface LocationSelectorProps {
  selectedLocation: string;
  onChange: (locId: string) => void;
  onLocationsLoaded?: (locations: Location[]) => void;
}

export default function LocationSelector({ selectedLocation, onChange, onLocationsLoaded }: LocationSelectorProps) {
  const { data: locations = EMPTY_LOCATIONS, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['waitwhile-locations'],
    queryFn: async () => {
      const res = await getLocations();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  useEffect(() => {
    if (onLocationsLoaded && locations.length > 0) {
      onLocationsLoaded(locations);
    }
  }, [locations, onLocationsLoaded]);

	return (
	    <div className="form-control w-full max-w-sm">
	      <label className="label">
	        <span className="ui-field-label flex items-center gap-2">
	          <MapPin size={16} /> Locație Waitwhile
	        </span>
	      </label>
      {isLoading ? (
        <div className="skeleton h-12 w-full rounded-xl"></div>
      ) : isError ? (
	        <div className="alert alert-error rounded-xl py-3 text-[0.94rem] leading-6">
	          <span className="min-w-0 flex-1 break-words">
	            {error instanceof Error ? error.message : 'Nu am putut încărca locațiile.'}
	          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Reîncearcă
          </button>
        </div>
      ) : locations.length === 0 ? (
	        <div className="rounded-xl border border-dashed border-base-300 bg-base-200/30 px-4 py-3 text-[0.95rem] leading-6 text-base-content/60">
	          Nu există locații disponibile pentru selecție.
	        </div>
      ) : (
        <select 
          className="select select-bordered select-lg w-full bg-base-200 focus:bg-base-100 transition-colors" 
          value={selectedLocation}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>Alege o locație...</option>
          {locations.map((loc) => (
             <option key={loc.id} value={loc.id}>
               {loc.name}
             </option>
          ))}
        </select>
      )}
    </div>
  );
}
