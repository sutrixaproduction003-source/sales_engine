import { Mail, Phone, Globe, MapPin, Building2, Sparkles, Link2, Star, Briefcase, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { PipelineLead } from "@/lib/types";
import { getProject } from "@/lib/projects";
import { domainOf, sourceLabel } from "@/lib/format";

export function DrawerSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

type Row = {
  label: string;
  value?: string | number | null;
  icon?: typeof Mail;
  /** Render the value as a link ("Open" for long URLs). */
  href?: string | null;
};

const hasValue = (v: Row["value"]) => v !== null && v !== undefined && String(v).trim() !== "";

function InfoRow({ label, value, icon: Icon, href }: Row) {
  const text = String(value);
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="flex shrink-0 items-center gap-2 text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 text-right text-indigo-300 hover:text-indigo-200"
          title={href}
        >
          <span className="truncate">{text}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="min-w-0 break-words text-right text-slate-200">{text}</span>
      )}
    </div>
  );
}

/** A titled list of fields; rows without a value are left out, and an empty section isn't shown. */
function FieldSection({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter((r) => hasValue(r.value));
  if (!shown.length) return null;
  return (
    <DrawerSection title={title}>
      <div className="divide-y divide-slate-800/70 rounded-lg border border-slate-800 bg-slate-900/60 px-3">
        {shown.map((row) => (
          <InfoRow key={row.label} {...row} />
        ))}
      </div>
    </DrawerSection>
  );
}

const url = (value?: string | null) => (value ? (/^https?:/i.test(value) ? value : `https://${value}`) : null);

export function DrawerContact(lead: PipelineLead) {
  return (
    <FieldSection
      title="Contact"
      rows={[
        { label: "Email", value: lead.email, icon: Mail, href: lead.email ? `mailto:${lead.email}` : null },
        { label: "Phone", value: lead.phone, icon: Phone, href: lead.phone ? `tel:${lead.phone.replace(/\s+/g, "")}` : null },
        { label: "Company phone", value: lead.companyPhone, icon: Phone },
        { label: "Job title", value: lead.jobTitle, icon: Briefcase },
        { label: "LinkedIn", value: lead.linkedinUrl ? "Profile" : null, icon: Link2, href: url(lead.linkedinUrl) },
      ]}
    />
  );
}

export function DrawerCompany(lead: PipelineLead) {
  return (
    <FieldSection
      title="Company & location"
      rows={[
        { label: "Company", value: lead.company || lead.hotelName, icon: Building2 },
        { label: "Industry", value: lead.industry },
        { label: "Website", value: domainOf(lead.website), icon: Globe, href: url(lead.website) },
        { label: "Address", value: lead.exactAddress, icon: MapPin },
        { label: "Location", value: lead.exactAddress ? null : lead.location || [lead.city, lead.state].filter(Boolean).join(", ") },
        { label: "Google Maps", value: lead.googleMapsLink ? "Open" : null, icon: MapPin, href: lead.googleMapsLink },
        { label: "Brand type", value: lead.brandType },
        { label: "Property size", value: lead.propertySizeCategory },
        { label: "Source", value: sourceLabel(lead.source) === "—" ? null : sourceLabel(lead.source) },
        { label: "Project", value: getProject(lead.project)?.name ?? lead.project },
      ]}
    />
  );
}

export function DrawerDigitalPresence(lead: PipelineLead) {
  return (
    <FieldSection
      title="Online"
      rows={[
        { label: "Google Business", value: lead.googleBusinessLink ? "Open" : null, href: lead.googleBusinessLink },
        { label: "TripAdvisor", value: lead.tripAdvisorLink ? "Open" : null, href: lead.tripAdvisorLink },
        { label: "Booking.com", value: lead.bookingComLink ? "Open" : null, href: lead.bookingComLink },
        { label: "MakeMyTrip", value: lead.makeMyTripLink ? "Open" : null, href: lead.makeMyTripLink },
        { label: "Instagram", value: lead.instagramLink ? "Open" : null, href: lead.instagramLink },
        { label: "Facebook", value: lead.facebookLink ? "Open" : null, href: lead.facebookLink },
      ]}
    />
  );
}

export function DrawerSocialProof(lead: PipelineLead) {
  return (
    <FieldSection
      title="Reputation"
      rows={[
        { label: "Google rating", value: lead.googleRating != null ? `${lead.googleRating} / 5` : null, icon: Star },
        { label: "Reviews", value: lead.totalReviewsCount != null ? lead.totalReviewsCount.toLocaleString() : null },
        { label: "Sentiment", value: lead.sentimentScore != null ? `${lead.sentimentScore} / 100` : null },
      ]}
    />
  );
}

/** Kept for compatibility: the hotel fields now live in "Company & location". */
export function DrawerHotelProfile() {
  return null;
}

export function DrawerPersonalization(lead: PipelineLead) {
  const hasDraft = Boolean(lead.emailSubject || lead.emailBody);
  if (!hasDraft && !lead.icebreaker && !lead.scrapedContext) return null;
  return (
    <DrawerSection title="Email draft">
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        {hasDraft ? (
          <>
            {lead.emailSubject && <p className="text-sm font-medium text-white">{lead.emailSubject}</p>}
            {lead.emailBody && (
              <p className="line-clamp-[10] whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">{lead.emailBody}</p>
            )}
          </>
        ) : (
          lead.icebreaker && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">{lead.icebreaker}</p>
        )}
        {lead.scrapedContext && (
          <details className="text-xs text-slate-400">
            <summary className="flex cursor-pointer items-center gap-1.5 text-slate-400 hover:text-slate-200">
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" /> Website text the draft was based on
            </summary>
            <p className="mt-2 line-clamp-6 leading-relaxed">{lead.scrapedContext}</p>
          </details>
        )}
      </div>
    </DrawerSection>
  );
}
