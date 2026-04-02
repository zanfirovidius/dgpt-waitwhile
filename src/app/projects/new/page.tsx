'use client';

import { createProject } from '@/app/actions/projects';
import { ProjectStatusSwitch } from '@/components/projects/ProjectStatusSwitch';
import { getProjectStatusLabel, type ProjectStatus } from '@/lib/project-status';
import LocationSelector from '@/components/LocationSelector';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('draft');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLocationsLoaded = (locations: { id: string; name: string }[]) => {
    // Pre-select the first location automatically
    if (locations.length > 0 && !locationId) {
      setLocationId(locations[0].id);
      setLocationName(locations[0].name);
    }
  };

  const handleLocationChange = (locId: string, locations: { id: string; name: string }[]) => {
    setLocationId(locId);
    const found = locations.find(l => l.id === locId);
    setLocationName(found?.name || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !locationId || !startDate || !endDate) return;

    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const res = await createProject({ name, locationId, locationName, startDate, endDate, projectStatus });
    if (res.success && res.projectId) {
      router.push(`/projects/${res.projectId}`);
    } else {
      setError(res.error || 'Failed to create project');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-base-content">New Project</h2>
        <p className="text-sm text-base-content/60 mt-1">Fill in the details to create a new project</p>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        {error && (
          <div className="alert alert-error rounded-xl text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">Project Name</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="e.g. Spring Campaign 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-control gap-3">
            <label className="label">
              <span className="label-text font-medium">Date Range</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="form-control">
                <span className="label-text text-xs uppercase tracking-wide text-base-content/50 mb-2">Start Date</span>
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={startDate}
                  onChange={(e) => {
                    const nextStartDate = e.target.value;

                    setStartDate(nextStartDate);
                    if (!endDate || endDate < nextStartDate) {
                      setEndDate(nextStartDate);
                    }
                  }}
                  required
                />
              </label>

              <label className="form-control">
                <span className="label-text text-xs uppercase tracking-wide text-base-content/50 mb-2">End Date</span>
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </label>
            </div>
            <p className="text-xs text-base-content/50">For a one-day project, use the same start and end date.</p>
          </div>

          <LocationSelectorWrapper
            selectedLocation={locationId}
            onChange={(locId, locations) => handleLocationChange(locId, locations)}
            onLocationsLoaded={handleLocationsLoaded}
          />

          <div className="form-control gap-3">
            <label className="label">
              <span className="label-text font-medium">Project status</span>
            </label>
            <ProjectStatusSwitch value={projectStatus} onChange={setProjectStatus} disabled={isSubmitting} />
            <p className="text-xs text-base-content/50">
              Proiectul va fi creat în starea <span className="font-semibold">{getProjectStatusLabel(projectStatus)}</span>.
            </p>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !name || !locationId || !startDate || !endDate}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? <span className="loading loading-spinner loading-sm"></span> : 'Create Project'}
            </button>
            <Link href="/projects" className="btn btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

// Wrapper to pass locations list to handleLocationChange
function LocationSelectorWrapper({
  selectedLocation,
  onChange,
  onLocationsLoaded,
}: {
  selectedLocation: string;
  onChange: (locId: string, locations: { id: string; name: string }[]) => void;
  onLocationsLoaded: (locations: { id: string; name: string }[]) => void;
}) {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  return (
    <LocationSelector
      selectedLocation={selectedLocation}
      onChange={(locId) => onChange(locId, locations)}
      onLocationsLoaded={(locs) => {
        setLocations(locs);
        onLocationsLoaded(locs);
      }}
    />
  );
}
