import { sql } from "./db.ts";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]![0] ?? "").toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

export async function conflictWarning(
  companyId: number,
  employeeId: number,
  startDate: string,
  endDate: string,
  teamIds: number[],
): Promise<string | null> {
  if (teamIds.length === 0) return null;
  const others = teamIds.filter((id) => id !== employeeId);
  if (others.length === 0) return null;

  const names: string[] = [];

  const propRows = await sql`
    SELECT DISTINCT e.name FROM holiday_proposals hp
    JOIN employees e ON e.id = hp.employee_id
    WHERE hp.employee_id IN ${sql(others)}
      AND hp.company_id = ${companyId}
      AND hp.status NOT IN ('rejected','withdrawn','clarifying')
      AND hp.start_date <= ${endDate} AND hp.end_date >= ${startDate}
    LIMIT 2
  ` as { name: string }[];
  for (const r of propRows) names.push(r.name.split(" ")[0] ?? r.name);

  if (names.length < 2) {
    const absRows = await sql`
      SELECT DISTINCT e.name FROM absence_records ar
      JOIN employees e ON e.id = ar.employee_id
      WHERE ar.employee_id IN ${sql(others)}
        AND ar.company_id = ${companyId}
        AND ar.status NOT IN ('rejected')
        AND ar.start_date <= ${endDate} AND ar.end_date >= ${startDate}
      LIMIT 2
    ` as { name: string }[];
    for (const r of absRows) {
      const first = r.name.split(" ")[0] ?? r.name;
      if (!names.includes(first)) names.push(first);
    }
  }

  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} also off during this period`;
  return `${names[0]} & ${names[1]} also off during this period`;
}
