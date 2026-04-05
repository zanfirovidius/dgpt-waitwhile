'use client';

import { getProjectTagDefinition } from '@/lib/project-tags';

type ProjectTagBadgesProps = {
  tags?: readonly string[] | null;
  compact?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

export function ProjectTagBadges({
  tags,
  compact = false,
  size = 'sm',
  className = '',
}: ProjectTagBadgesProps) {
  if (!tags || tags.length === 0) {
    return null;
  }

  const badgeSizeClass =
    size === 'md'
      ? compact
        ? 'px-2.5 py-1.5 text-[0.7rem]'
        : 'px-3 py-1.5 text-[0.76rem]'
      : compact
        ? 'px-2 py-1 text-[0.64rem]'
        : 'px-2.5 py-1 text-[0.7rem]';

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {tags.map((tag) => {
        const definition = getProjectTagDefinition(tag);

        if (!definition) {
          return null;
        }

        return (
          <span
            key={definition.value}
            title={definition.label}
            className={`inline-flex items-center rounded-full border font-semibold tracking-tight ${badgeSizeClass} ${definition.toneClass}`}
          >
            {compact ? definition.shortLabel : definition.label}
          </span>
        );
      })}
    </div>
  );
}
