/**
 * Marker colors for the REAL pipeline states returned by the backend
 * (Prisma LeadStatus: PENDING | SCRAPED | PERSONALIZED | SYNCED).
 * No coordinates are fabricated here — map pins are rendered exclusively
 * from latitude/longitude values returned by the backend.
 */
export const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f97316", // orange — new / awaiting enrichment
  SCRAPED: "#38bdf8", // sky — context collected
  PERSONALIZED: "#34d399", // green — AI icebreaker generated
  SYNCED: "#a78bfa", // violet — outreach sent
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "New",
  SCRAPED: "Scraped",
  PERSONALIZED: "Personalized",
  SYNCED: "Outreach Sent",
};