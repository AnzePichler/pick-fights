export const EVENTS_PER_PAGE = 5;

export function getPagination(value: string | string[] | undefined) {
  const parsed = typeof value === "string" ? Number(value) : 1;
  const page =
    Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1;

  return {
    page,
    skip: (page - 1) * EVENTS_PER_PAGE,
    take: EVENTS_PER_PAGE,
  };
}
