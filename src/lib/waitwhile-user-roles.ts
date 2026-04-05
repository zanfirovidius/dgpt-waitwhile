export const WAITWHILE_ROLE_OPTIONS = [
  { value: 'SECRETARIAT', label: 'Secretariat' },
  { value: 'SEF-CABINET', label: 'Șef cabinet' },
] as const;

const ROLE_LABELS = new Map<string, string>(WAITWHILE_ROLE_OPTIONS.map((option) => [option.value, option.label]));

function normalizeRoleToken(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-');
}

export function normalizeWaitwhileRole(value: string | null | undefined, fallback: string) {
  const normalized = normalizeRoleToken(value || '');

  if (normalized === 'SECRETARIAT') {
    return 'SECRETARIAT';
  }

  if (normalized === 'SEF-CABINET' || normalized === 'SEFCABINET') {
    return 'SEF-CABINET';
  }

  return fallback;
}

export function getWaitwhileRoleLabel(role: string) {
  return ROLE_LABELS.get(role) || role;
}
