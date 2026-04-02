export const PROJECT_STATUS_OPTIONS = ['draft', 'active', 'ended'] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number];

export function normalizeProjectStatus(value?: string | null): ProjectStatus {
  if (value === 'active' || value === 'ended') {
    return value;
  }

  return 'draft';
}

export function getProjectStatusLabel(status?: string | null) {
  switch (normalizeProjectStatus(status)) {
    case 'active':
      return 'Activ';
    case 'ended':
      return 'Ended';
    default:
      return 'Draft';
  }
}

export function getProjectStatusBadgeClass(status?: string | null) {
  switch (normalizeProjectStatus(status)) {
    case 'active':
      return 'badge-success';
    case 'ended':
      return 'badge-neutral';
    default:
      return 'badge-warning';
  }
}

export function getProjectStatusToneClass(status?: string | null) {
  switch (normalizeProjectStatus(status)) {
    case 'active':
      return 'border-success/20 bg-success/5 text-success';
    case 'ended':
      return 'border-base-300 bg-base-200/70 text-base-content/70';
    default:
      return 'border-warning/20 bg-warning/5 text-warning';
  }
}
