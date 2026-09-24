/**
 * Human-friendly lead exports (Excel download, Google Sheets tab). Unlike the
 * storage layout, exports use readable headers and only the useful columns.
 */

import type { Lead } from "@/lib/leadModel";

const date = (value: Date | null) => (value ? value.toISOString().replace("T", " ").slice(0, 16) : "");
const text = (value: unknown) => (value === null || value === undefined ? "" : value);

export const EXPORT_COLUMNS: { header: string; width: number; value: (lead: Lead) => unknown }[] = [
  { header: "Name", width: 28, value: (l) => l.name },
  { header: "Title", width: 26, value: (l) => text(l.jobTitle) },
  { header: "Company", width: 28, value: (l) => text(l.company) },
  { header: "Email", width: 30, value: (l) => text(l.email) },
  { header: "Phone", width: 18, value: (l) => text(l.phone) },
  { header: "Website", width: 28, value: (l) => text(l.website) },
  { header: "LinkedIn", width: 30, value: (l) => text(l.linkedinUrl) },
  { header: "City", width: 14, value: (l) => text(l.city) },
  { header: "State", width: 14, value: (l) => text(l.state) },
  { header: "Location", width: 24, value: (l) => text(l.location) },
  { header: "Address", width: 36, value: (l) => text(l.exactAddress) },
  { header: "Industry", width: 18, value: (l) => text(l.industry) },
  { header: "Status", width: 13, value: (l) => l.status },
  { header: "Source", width: 14, value: (l) => text(l.source) },
  { header: "Project", width: 12, value: (l) => text(l.project) },
  { header: "Google rating", width: 8, value: (l) => text(l.googleRating) },
  { header: "Reviews", width: 9, value: (l) => text(l.totalReviewsCount) },
  { header: "Google Maps", width: 30, value: (l) => text(l.googleMapsLink) },
  { header: "Email subject", width: 34, value: (l) => text(l.emailSubject) },
  { header: "Sent at", width: 17, value: (l) => date(l.sentAt) },
  { header: "HubSpot contact", width: 14, value: (l) => text(l.hubspotContactId) },
  { header: "Added", width: 17, value: (l) => date(l.createdAt) },
];

/** Header row + one row per lead, as plain values. */
export function exportRows(leads: Lead[]): unknown[][] {
  return [EXPORT_COLUMNS.map((c) => c.header), ...leads.map((lead) => EXPORT_COLUMNS.map((c) => c.value(lead)))];
}
