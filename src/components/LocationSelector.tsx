'use client';

import { getLocations } from '@/app/actions/waitwhile';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';

import { useEffect } from 'react';

interface LocationSelectorProps {
  selectedLocation: string;
  onChange: (locId: string) => void;
  onLocationsLoaded?: (locations: {id: string; name: string}[]) => void;
}

export default function LocationSelector({ selectedLocation, onChange, onLocationsLoaded }: LocationSelectorProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['waitwhile-locations'],
    queryFn: async () => {
      const res = await getLocations();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const locations = data || [];

  useEffect(() => {
    if (onLocationsLoaded && locations.length > 0) {
      onLocationsLoaded(locations);
    }
  }, [locations, onLocationsLoaded]);

  return (
    <div className="form-control w-full max-w-sm">
      <label className="label">
        <span className="label-text font-semibold flex items-center gap-2">
          <MapPin size={16} /> Select Waitwhile Location
        </span>
      </label>
      {isLoading ? (
        <div className="skeleton h-12 w-full rounded-xl"></div>
      ) : isError ? (
        <div className="alert alert-error text-sm rounded-xl py-2">Failed to load locations</div>
      ) : (
        <select 
          className="select select-bordered select-lg w-full bg-base-200 focus:bg-base-100 transition-colors" 
          value={selectedLocation}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>Choose a location...</option>
          {locations?.map((loc: { id: string; name: string }) => (
             <option key={loc.id} value={loc.id}>
               {loc.name}
             </option>
          ))}
        </select>
      )}
    </div>
  );
}
