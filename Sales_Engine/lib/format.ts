/** Small display formatters shared by tables and cards. */

const SOURCE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  openstreetmap: "OpenStreetMap",
  apollo: "Apollo",
  sales_navigator: "Sales Navigator",
  linkedin_search: "LinkedIn",
  csv: "CSV import",
  manual: "Manual",
};

/** "sales_navigator" → "Sales Navigator" (unknown sources are title-cased). */
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "https://www.x.com/a?utm=…" → "x.com". */
export function domainOf(website: string | null | undefined): string {
  if (!website) return "";
  try {
    return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0];
  }
}

/** "3m ago", "5h ago", "2d ago", then a date. */
export function timeAgo(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Two-letter initials for an avatar. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}
