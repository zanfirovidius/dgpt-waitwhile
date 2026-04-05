'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

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

  const visibleOptions = useMemo(
    () => [{ value: '', label: emptyOptionLabel }, ...filteredOptions.map((option) => ({ value: option, label: option }))],
    [emptyOptionLabel, filteredOptions],
  );

  const safeActiveIndex = Math.min(activeIndex, Math.max(visibleOptions.length - 1, 0));
  const activeOptionId = `${listboxId}-option-${safeActiveIndex}`;

  const closeMenu = () => {
    setIsOpen(false);
    setQuery('');
  };

  const openMenu = (focusTarget: 'selected' | 'first' | 'last' = 'selected') => {
    if (disabled) {
      return;
    }

    const selectedIndex = visibleOptions.findIndex((option) => option.value === value);
    const lastIndex = Math.max(visibleOptions.length - 1, 0);

    setQuery('');
    setActiveIndex(
      focusTarget === 'first' ? 0 : focusTarget === 'last' ? lastIndex : selectedIndex >= 0 ? selectedIndex : 0,
    );
    setIsOpen(true);
  };

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    closeMenu();
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    if (!isOpen) {
      openMenu(direction === 1 ? 'first' : 'last');
      return;
    }

    const lastIndex = visibleOptions.length - 1;
    if (lastIndex < 0) {
      return;
    }

    setActiveIndex((current) => {
      const start = Math.min(current, lastIndex);

      if (direction === 1) {
        return start >= lastIndex ? 0 : start + 1;
      }

      return start <= 0 ? lastIndex : start - 1;
    });
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActiveIndex(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActiveIndex(-1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen) {
          handleSelect(visibleOptions[safeActiveIndex]?.value ?? '');
        } else {
          openMenu();
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          closeMenu();
        }
        break;
      default:
        break;
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActiveIndex(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActiveIndex(-1);
        break;
      case 'Enter':
        event.preventDefault();
        handleSelect(visibleOptions[safeActiveIndex]?.value ?? '');
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu();
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="input input-bordered flex w-full items-center justify-between gap-2 text-left"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        aria-disabled={disabled}
        onClick={() => {
          if (isOpen) {
            closeMenu();
            return;
          }

          openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
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
                aria-label={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
            </label>
          </div>

          <div id={listboxId} role="listbox" aria-label={placeholder} className="max-h-64 overflow-y-auto p-2">
            {visibleOptions.map((option, index) => (
              <button
                key={option.value || '__empty__'}
                type="button"
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={value === option.value}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  safeActiveIndex === index ? 'bg-base-200' : 'hover:bg-base-200'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(option.value)}
              >
                <span className="pr-3">{option.label}</span>
                {value === option.value ? <Check size={14} className="shrink-0 text-primary" /> : null}
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
