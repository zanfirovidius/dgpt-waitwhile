'use client';

import { createProject } from '@/app/actions/projects';
import LocationSelector from '@/components/LocationSelector';
import { getTodayDateString, normalizeProjectDateValue } from '@/lib/project-dates';
import { type ProjectTagCode } from '@/lib/project-tags';
import { getProjectStatusLabel, type ProjectStatus } from '@/lib/project-status';
import { CalendarDays, FolderPlus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { ProjectTagPicker } from './ProjectTagPicker';
import { ProjectStatusSwitch } from './ProjectStatusSwitch';

type LocationOption = {
  id: string;
  name: string;
};

type NewProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
  initialStartDate?: string;
  initialEndDate?: string;
};

export function NewProjectModal({
  isOpen,
  onClose,
  onCreated,
  initialStartDate,
  initialEndDate,
}: NewProjectModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <NewProjectModalContent
      onClose={onClose}
      onCreated={onCreated}
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
    />
  );
}

function NewProjectModalContent({
  onClose,
  onCreated,
  initialStartDate,
  initialEndDate,
}: Omit<NewProjectModalProps, 'isOpen'>) {
  const titleId = useId();
  const descriptionId = useId();
  const today = getTodayDateString();
  const normalizedInitialStartDate = normalizeProjectDateValue(initialStartDate);
  const safeInitialStartDate = normalizedInitialStartDate
    ? normalizedInitialStartDate < today
      ? today
      : normalizedInitialStartDate
    : '';
  const normalizedInitialEndDate = normalizeProjectDateValue(initialEndDate ?? initialStartDate);
  const safeInitialEndDate = normalizedInitialEndDate
    ? safeInitialStartDate && normalizedInitialEndDate < safeInitialStartDate
      ? safeInitialStartDate
      : normalizedInitialEndDate
    : safeInitialStartDate;
  const wasInitialStartDateAdjusted = Boolean(normalizedInitialStartDate && normalizedInitialStartDate < today);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(safeInitialStartDate);
  const [endDate, setEndDate] = useState(safeInitialEndDate);
  const [locationId, setLocationId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('draft');
  const [projectTags, setProjectTags] = useState<ProjectTagCode[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLocationsLoaded = (nextLocations: LocationOption[]) => {
    setLocations(nextLocations);
  };

  const handleLocationChange = (locId: string) => {
    setLocationId(locId);
    const foundLocation = locations.find((location) => location.id === locId);
    setLocationName(foundLocation?.name || '');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name || !startDate || !endDate) {
      return;
    }

    if (startDate < today) {
      setError('Data de început trebuie să fie astăzi sau într-o zi viitoare.');
      return;
    }

    if (endDate < startDate) {
      setError('Data de final trebuie să fie egală sau ulterioară datei de început.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const result = await createProject({
      name,
      locationId: locationId || '',
      locationName: locationName || '',
      startDate,
      endDate,
      projectStatus,
      projectTags,
    });

    if (result.success && result.projectId) {
      onCreated(result.projectId);
      return;
    }

    setError(result.error || 'Nu am putut crea proiectul.');
    setIsSubmitting(false);
  };

  const handleRequestClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <div className="modal modal-open">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="modal-box max-w-2xl overflow-hidden rounded-3xl border border-base-200 bg-base-100 p-0 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-base-200 bg-base-100 px-6 py-5 sm:px-8">
          <div className="min-w-0">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderPlus size={20} />
            </div>
            <h2 id={titleId} className="ui-section-title text-base-content">
              Proiect nou
            </h2>
            <p id={descriptionId} className="ui-body mt-2 text-base-content/60">
              Completează detaliile de bază și creează proiectul direct din lista de proiecte.
            </p>
            {wasInitialStartDateAdjusted ? (
              <p className="mt-2 text-sm text-warning">
                Data selectată este în trecut, așa că începutul proiectului a fost mutat la data curentă.
              </p>
            ) : initialStartDate ? (
              <p className="mt-2 text-sm text-primary/80">
                Data selectată din calendar a fost precompletată ca punct de pornire.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={handleRequestClose}
            aria-label="Închide fereastra"
            disabled={isSubmitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
          {error ? (
            <div className="alert alert-error rounded-xl text-sm">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="form-control">
              <label className="label px-0">
                <span className="ui-field-label">Nume proiect</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full bg-base-200 focus:bg-base-100"
                placeholder="Ex: Caravana de Primăvară 2026"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="form-control gap-3">
              <label className="label px-0">
                <span className="ui-field-label flex items-center gap-2">
                  <CalendarDays size={16} />
                  Perioadă proiect
                </span>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="form-control">
                  <span className="ui-label mb-2">Data de început</span>
                  <input
                    type="date"
                    className="input input-bordered w-full bg-base-200 focus:bg-base-100"
                    value={startDate}
                    min={today}
                    onChange={(event) => {
                      const nextStartDate = normalizeProjectDateValue(event.target.value);
                      const boundedStartDate =
                        nextStartDate && nextStartDate < today ? today : nextStartDate;

                      setStartDate(boundedStartDate);
                      if (!endDate || endDate < boundedStartDate) {
                        setEndDate(boundedStartDate);
                      }
                    }}
                    required
                  />
                </label>

                <label className="form-control">
                  <span className="ui-label mb-2">Data de final</span>
                  <input
                    type="date"
                    className="input input-bordered w-full bg-base-200 focus:bg-base-100"
                    value={endDate}
                    min={startDate || today}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                  />
                </label>
              </div>

              <p className="text-sm text-base-content/55">
                Data de început trebuie să fie astăzi sau în viitor. Pentru un proiect de o singură zi, folosește aceeași dată la început și la final.
              </p>
            </div>

            <div className="rounded-2xl border border-base-200 bg-base-100/80 p-4">
              <LocationSelector
                selectedLocation={locationId}
                onChange={handleLocationChange}
                onLocationsLoaded={handleLocationsLoaded}
                allowEmptyOption
                emptyOptionLabel="Adaugă locația Waitwhile mai târziu"
              />
              <p className="mt-3 text-sm text-base-content/55">
                Locația Waitwhile este opțională la creare. O poți conecta ulterior din pagina proiectului.
              </p>
            </div>

            <div className="form-control gap-3">
              <label className="label px-0">
                <span className="ui-field-label">Stare proiect</span>
              </label>
              <ProjectStatusSwitch value={projectStatus} onChange={setProjectStatus} disabled={isSubmitting} />
              <p className="text-sm text-base-content/55">
                Proiectul va fi creat în starea <span className="font-semibold">{getProjectStatusLabel(projectStatus)}</span>.
              </p>
            </div>

            <div className="form-control gap-3">
              <label className="label px-0">
                <span className="ui-field-label">Etichete regionale</span>
              </label>
              <ProjectTagPicker value={projectTags} onChange={setProjectTags} disabled={isSubmitting} />
              <p className="text-sm text-base-content/55">
                Poți atașa una sau mai multe etichete pentru filtrare și identificare rapidă în calendar.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleRequestClose}
                disabled={isSubmitting}
              >
                Renunță
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name || !startDate || !endDate}
                className="btn btn-primary gap-2"
              >
                {isSubmitting ? <span className="loading loading-spinner loading-sm"></span> : null}
                Creează proiectul
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="modal-backdrop bg-base-300/60 backdrop-blur-sm" onClick={handleRequestClose}></div>
    </div>
  );
}
