'use client';

import { PROJECT_TAG_OPTIONS, type ProjectTagCode } from '@/lib/project-tags';

type ProjectTagPickerProps = {
  value?: readonly string[] | null;
  onChange: (nextValue: ProjectTagCode[]) => void;
  disabled?: boolean;
};

export function ProjectTagPicker({
  value,
  onChange,
  disabled = false,
}: ProjectTagPickerProps) {
  const selectedTags = new Set((value ?? []) as ProjectTagCode[]);

  const toggleTag = (tag: ProjectTagCode) => {
    if (disabled) {
      return;
    }

    const nextTags = new Set(selectedTags);

    if (nextTags.has(tag)) {
      nextTags.delete(tag);
    } else {
      nextTags.add(tag);
    }

    onChange(PROJECT_TAG_OPTIONS.filter((option) => nextTags.has(option.value)).map((option) => option.value));
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {PROJECT_TAG_OPTIONS.map((option) => {
        const isSelected = selectedTags.has(option.value);

        return (
          <button
            key={option.value}
            type="button"
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              isSelected
                ? option.toneClass
                : 'border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200/60 hover:text-base-content'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            onClick={() => toggleTag(option.value)}
            disabled={disabled}
            aria-pressed={isSelected}
          >
            <span className="min-w-0">
              <span className="block truncate text-[0.9rem] font-semibold text-base-content">
                {option.label}
              </span>
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[0.64rem] font-bold tracking-[0.08em] ${
                isSelected ? option.toneClass : 'border-base-300 bg-base-200/80 text-base-content/55'
              }`}
            >
              {option.shortLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
