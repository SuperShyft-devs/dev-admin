export function computeCampNo(
  organizationId: number | null | undefined,
  startDate: string,
): number | null {
  const orgId = organizationId && organizationId > 0 ? organizationId : null;
  if (!orgId || !startDate) return null;
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Number(
    `${orgId}${String(d).padStart(2, "0")}${String(m).padStart(2, "0")}${String(y % 100).padStart(2, "0")}`,
  );
}
