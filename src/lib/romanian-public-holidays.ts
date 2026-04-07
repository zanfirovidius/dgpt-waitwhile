import { addDays } from 'date-fns';

export const ROMANIAN_PUBLIC_HOLIDAY_SOURCE_URL = 'https://legislatie.just.ro/public/detaliidocument/128647';

export type RomanianPublicHoliday = {
  date: string;
  label: string;
};

export function getRomanianPublicHolidayMap(years: Iterable<number>) {
  const holidayMap = new Map<string, string[]>();

  for (const year of years) {
    for (const holiday of getRomanianPublicHolidays(year)) {
      const existing = holidayMap.get(holiday.date) ?? [];
      existing.push(holiday.label);
      holidayMap.set(holiday.date, existing);
    }
  }

  return holidayMap;
}

export function getRomanianPublicHolidays(year: number): RomanianPublicHoliday[] {
  const orthodoxEaster = getOrthodoxEasterDate(year);
  const goodFriday = addDays(orthodoxEaster, -2);
  const easterMonday = addDays(orthodoxEaster, 1);
  const pentecostSunday = addDays(orthodoxEaster, 49);
  const pentecostMonday = addDays(orthodoxEaster, 50);

  return [
    { date: buildDateKey(year, 1, 1), label: 'Anul Nou' },
    { date: buildDateKey(year, 1, 2), label: 'A doua zi de Anul Nou' },
    { date: buildDateKey(year, 1, 6), label: 'Boboteaza' },
    { date: buildDateKey(year, 1, 7), label: 'Soborul Sfântului Ioan Botezătorul' },
    { date: buildDateKey(year, 1, 24), label: 'Ziua Unirii Principatelor Române' },
    { date: toDateKey(goodFriday), label: 'Vinerea Mare' },
    { date: toDateKey(orthodoxEaster), label: 'Paști' },
    { date: toDateKey(easterMonday), label: 'A doua zi de Paști' },
    { date: buildDateKey(year, 5, 1), label: 'Ziua Muncii' },
    { date: buildDateKey(year, 6, 1), label: 'Ziua Copilului' },
    { date: toDateKey(pentecostSunday), label: 'Rusalii' },
    { date: toDateKey(pentecostMonday), label: 'A doua zi de Rusalii' },
    { date: buildDateKey(year, 8, 15), label: 'Adormirea Maicii Domnului' },
    { date: buildDateKey(year, 11, 30), label: 'Sfântul Andrei' },
    { date: buildDateKey(year, 12, 1), label: 'Ziua Națională a României' },
    { date: buildDateKey(year, 12, 25), label: 'Crăciun' },
    { date: buildDateKey(year, 12, 26), label: 'A doua zi de Crăciun' },
  ];
}

function getOrthodoxEasterDate(year: number) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julianToGregorianOffset = Math.floor(year / 100) - Math.floor(year / 400) - 2;

  return new Date(year, month - 1, day + julianToGregorianOffset, 12);
}

function buildDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toDateKey(date: Date) {
  return buildDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
