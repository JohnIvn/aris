const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export function getPeriodRange(
  label?: string | null,
): { start: string; end: string } | null {
  const match = label?.trim().match(/^([A-Za-z]+)\s+(\d{4})\s+(I|II)$/i);
  if (!match) return null;

  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return null;

  const year = Number(match[2]);
  const half = match[3].toUpperCase();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthText = String(month + 1).padStart(2, '0');
  const date = (day: number) =>
    `${year}-${monthText}-${String(day).padStart(2, '0')}`;

  return {
    start: date(half === 'I' ? 1 : 16),
    end: date(half === 'I' ? 15 : lastDay),
  };
}
