type ProjectDateFields = {
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type DateLabelOptions = Intl.DateTimeFormatOptions & {
  locale?: string;
};

export function normalizeProjectDates<T extends ProjectDateFields>(project: T): T & {
  date: string;
  startDate: string;
  endDate: string;
} {
  const startDate = normalizeProjectDateValue(project.startDate ?? project.date);
  const endDate = normalizeProjectDateValue(project.endDate ?? project.startDate ?? project.date);

  return {
    ...project,
    date: startDate,
    startDate,
    endDate,
  };
}

export function formatProjectDateRange(project: ProjectDateFields, options: DateLabelOptions = {}) {
  const { locale = 'ro-RO', ...dateOptions } = options;
  const { startDate, endDate } = normalizeProjectDates(project);

  if (!startDate && !endDate) {
    return 'Date not set';
  }

  if (!endDate || startDate === endDate) {
    return formatProjectDate(startDate || endDate, locale, dateOptions);
  }

  return `${formatProjectDate(startDate, locale, dateOptions)} - ${formatProjectDate(endDate, locale, dateOptions)}`;
}

function formatProjectDate(value: string, locale: string, options: Intl.DateTimeFormatOptions) {
  if (!value) {
    return 'Date not set';
  }

  const formatted = new Date(`${value}T00:00:00`).toLocaleDateString(locale, options);
  return formatted === 'Invalid Date' ? value : formatted;
}

function normalizeProjectDateValue(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}
