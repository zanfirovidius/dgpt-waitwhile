export const PROJECT_TAG_OPTIONS = [
  {
    value: 'TN',
    label: 'Transilvania Nord',
    shortLabel: 'TN',
    toneClass: 'border-primary/20 bg-primary/10 text-primary',
  },
  {
    value: 'TS',
    label: 'Transilvania Sud',
    shortLabel: 'TS',
    toneClass: 'border-info/20 bg-info/10 text-info',
  },
  {
    value: 'MU',
    label: 'Muntenia',
    shortLabel: 'MU',
    toneClass: 'border-secondary/20 bg-secondary/10 text-secondary',
  },
  {
    value: 'MO',
    label: 'Moldova',
    shortLabel: 'MO',
    toneClass: 'border-accent/20 bg-accent/10 text-accent',
  },
  {
    value: 'BA',
    label: 'Banat',
    shortLabel: 'BA',
    toneClass: 'border-success/20 bg-success/10 text-success',
  },
  {
    value: 'OL',
    label: 'Oltenia',
    shortLabel: 'OL',
    toneClass: 'border-warning/20 bg-warning/10 text-warning',
  },
  {
    value: 'AZS',
    label: 'Uniune',
    shortLabel: 'AZS',
    toneClass: 'border-base-300 bg-base-200/80 text-base-content/75',
  },
] as const;

export type ProjectTagCode = (typeof PROJECT_TAG_OPTIONS)[number]['value'];

const PROJECT_TAGS_BY_VALUE = new Map(PROJECT_TAG_OPTIONS.map((tag) => [tag.value, tag]));

export function getProjectTagDefinition(tag?: string | null) {
  return tag ? PROJECT_TAGS_BY_VALUE.get(tag as ProjectTagCode) ?? null : null;
}

export function normalizeProjectTags(tags: unknown): ProjectTagCode[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const uniqueTags = new Set<ProjectTagCode>();

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const normalizedTag = tag.trim().toUpperCase() as ProjectTagCode;
    if (PROJECT_TAGS_BY_VALUE.has(normalizedTag)) {
      uniqueTags.add(normalizedTag);
    }
  }

  return PROJECT_TAG_OPTIONS.filter((tag) => uniqueTags.has(tag.value)).map((tag) => tag.value);
}
