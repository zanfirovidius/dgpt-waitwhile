'use client';

import {
  getProjectStatusLabel,
  getProjectStatusToneClass,
  type ProjectStatus,
  PROJECT_STATUS_OPTIONS,
} from '@/lib/project-status';

type ProjectStatusSwitchProps = {
  value: ProjectStatus;
  onChange: (value: ProjectStatus) => void;
  disabled?: boolean;
};

export function ProjectStatusSwitch({
  value,
  onChange,
  disabled = false,
}: ProjectStatusSwitchProps) {
  return (
    <div className="rounded-2xl border border-base-300 bg-base-200/50 p-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {PROJECT_STATUS_OPTIONS.map((status) => {
          const isActive = value === status;

          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              className={`rounded-xl px-3 py-3 text-sm font-bold transition-all ${
                isActive
                  ? `${getProjectStatusToneClass(status)} shadow-sm`
                  : 'text-base-content/55 hover:bg-base-100 hover:text-base-content'
              } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
              onClick={() => onChange(status)}
            >
              {getProjectStatusLabel(status)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
