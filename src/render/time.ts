// Every time on the dashboard is absolute and in UTC, so the same input always
// gives the same bytes (record 0029): `2026-09-21 08:52 UTC`.
export function utcMinute(at: Date): string {
  const iso = at.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
