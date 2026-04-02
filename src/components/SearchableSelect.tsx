'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeName } from '@/lib/name-utils';

type SearchableSelectProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyOptionLabel?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Selectează',
  emptyOptionLabel = 'Fără selecție',
  searchPlaceholder = 'Caută...',
  noResultsLabel = 'Nu există rezultate.',
  disabled = false,
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.setTimeout(() => {
      searchRef.current?.focus();
    }, 0);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeName(query);
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => normalizeName(option).includes(normalizedQuery));
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="input input-bordered flex w-full items-center justify-between gap-2 text-left"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => {
              if (!current) {
                setQuery('');
              }

              return !current;
            });
          }
        }}
      >
        <span className={`truncate ${value ? 'text-base-content' : 'text-base-content/45'}`}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-base-content/45 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-[1.25rem] border border-base-300 bg-base-100 shadow-xl">
          <div className="border-b border-base-200 p-3">
            <label className="input input-sm input-bordered flex items-center gap-2">
              <Search size={14} className="text-base-content/45" />
              <input
                ref={searchRef}
                type="text"
                className="grow"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
            >
              <span>{emptyOptionLabel}</span>
              {!value ? <Check size={14} className="text-primary" /> : null}
            </button>

            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-base-200"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                <span className="pr-3">{option}</span>
                {value === option ? <Check size={14} className="shrink-0 text-primary" /> : null}
              </button>
            ))}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-base-content/50">{noResultsLabel}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
