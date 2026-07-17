/**
 * Maps a recruitment job_posts row into (a) the fields the on-page BrandedJD component renders and
 * (b) the exact JSON the RUH-AI JD skill (skills/jd-pdf-generator/scripts/generate_jd_pdf.py) expects,
 * so the on-page JD and the downloadable branded PDF come from ONE source of truth.
 */
export type JobJDRow = {
  id: string;
  title: string;
  level: string | null;
  department: string | null;
  employment_type: string | null;
  openings: number | null;
  summary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  min_experience: number | null;
  required_skills: unknown;
  responsibilities: unknown;
};

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

export const jdSkills = (row: JobJDRow): string[] => asList(row.required_skills);
export const jdResponsibilities = (row: JobJDRow): string[] => asList(row.responsibilities);

export function jdExperienceText(row: JobJDRow): string {
  return row.min_experience != null ? `${row.min_experience}+ years of relevant experience` : "";
}

export function jdSalaryText(row: JobJDRow): string | null {
  const sym: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };
  const code = (row.currency || "USD").toUpperCase();
  const s = sym[code] ?? "";
  const fmt = (n: number) => `${s}${n.toLocaleString()}`;
  if (row.salary_min != null && row.salary_max != null) return `${code} ${fmt(row.salary_min)} – ${fmt(row.salary_max)}`;
  if (row.salary_min != null) return `${code} ${fmt(row.salary_min)}+`;
  return null;
}

/** The JSON contract for generate_jd_pdf.py (field names must match its build_html()). */
export function jdPayload(row: JobJDRow): Record<string, unknown> {
  return {
    jobTitle: row.title,
    jobSummary: row.summary || "",
    employmentType: row.employment_type || "Full-Time",
    department: row.department || "",
    openings: row.openings ?? "",
    positionType: row.level || "",
    minExperience: row.min_experience != null ? `${row.min_experience}+ years` : "",
    requiredSkills: jdSkills(row),
    responsibilities: jdResponsibilities(row),
    currency: (row.currency || "USD").toUpperCase(),
    salaryMin: row.salary_min ?? "",
    salaryMax: row.salary_max ?? "",
  };
}

/** Columns to SELECT for either use. */
export const JD_COLUMNS =
  "id, title, level, department, employment_type, openings, summary, salary_min, salary_max, currency, min_experience, required_skills, responsibilities";
