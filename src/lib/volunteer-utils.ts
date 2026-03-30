export function sanitizeVolunteerValue(value?: string | null, maxLength = 128) {
  const sanitized = (value || '').replace(/\s+/g, ' ').trim();
  return sanitized ? sanitized.slice(0, maxLength) : '';
}

export function sanitizeVolunteerEmail(value?: string | null) {
  const sanitized = sanitizeVolunteerValue(value, 128);
  return sanitized ? sanitized.toLowerCase() : '';
}

export function sanitizeVolunteerPhone(value?: string | null) {
  return sanitizeVolunteerValue(value, 64);
}

export function normalizeVolunteerPhoneForMatch(value?: string | null) {
  const digits = (value || '').replace(/\D+/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    return `40${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `40${digits}`;
  }

  return digits;
}
