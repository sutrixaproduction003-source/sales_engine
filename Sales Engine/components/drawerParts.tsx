import { Mail, Phone, Globe, MapPin, Building2, Sparkles, Link2, Star } from "lucide-react";
import { PipelineLead } from "@/lib/types";

export function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

export function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Mail;
  label: string;
  value?: string | null;
}) {
  return (
    <p className="flex items-center justify-between gap-3 border-b border-slate-800/60 py-1.5 text-sm">
      <span className="flex items-center gap-1.5 text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="truncate text-right text-slate-200">{value || "N/A"}</span>
    </p>
  );
}

/** Only fields that actually exist on the backend Lead model are shown.
 *  Missing values render as N/A — nothing is invented. */
export function DrawerContact(lead: PipelineLead) {
  return (
    <DrawerSection title="Contact Information">
      <InfoRow icon={Mail} label="Email" value={lead.email} />
      <InfoRow icon={Phone} label="Phone" value={lead.phone} />
      <InfoRow icon={Building2} label="Job Title" value={lead.jobTitle} />
      <InfoRow icon={MapPin} label="Location" value={lead.location} />
      <InfoRow icon={Globe} label="LinkedIn" value={lead.linkedinUrl} />
    </DrawerSection>
  );
}

export function DrawerHotelProfile(lead: PipelineLead) {
  return (
    <DrawerSection title="Hotel Profile">
      <InfoRow icon={Building2} label="Hotel Name" value={lead.hotelName || lead.company} />
      <InfoRow label="Brand Type" value={lead.brandType} />
      <InfoRow label="Property Size" value={lead.propertySizeCategory} />
      <InfoRow label="City" value={lead.city} />
      <InfoRow label="State" value={lead.state} />
      <InfoRow icon={MapPin} label="Exact Address" value={lead.exactAddress} />
      <InfoRow icon={Link2} label="Google Maps" value={lead.googleMapsLink} />
    </DrawerSection>
  );
}

export function DrawerDigitalPresence(lead: PipelineLead) {
  return (
    <DrawerSection title="Digital Presence">
      <InfoRow icon={Globe} label="Website" value={lead.website} />
      <InfoRow icon={Link2} label="Google Business" value={lead.googleBusinessLink} />
      <InfoRow icon={Link2} label="TripAdvisor" value={lead.tripAdvisorLink} />
      <InfoRow icon={Link2} label="Booking.com" value={lead.bookingComLink} />
      <InfoRow icon={Link2} label="MakeMyTrip" value={lead.makeMyTripLink} />
      <InfoRow label="Instagram" value={lead.instagramLink} />
      <InfoRow label="Facebook" value={lead.facebookLink} />
      <InfoRow label="LinkedIn" value={lead.linkedinUrl} />
    </DrawerSection>
  );
}

export function DrawerSocialProof(lead: PipelineLead) {
  return (
    <DrawerSection title="Social Proof">
      <InfoRow icon={Star} label="Google Rating" value={lead.googleRating != null ? `${lead.googleRating}/5` : null} />
      <InfoRow label="Total Reviews" value={lead.totalReviewsCount?.toLocaleString()} />
      <InfoRow label="Sentiment Score" value={lead.sentimentScore != null ? `${lead.sentimentScore}/100` : null} />
    </DrawerSection>
  );
}

export function DrawerCompany(lead: PipelineLead) {
  return (
    <DrawerSection title="Company Information">
      <InfoRow icon={Building2} label="Company" value={lead.company} />
      <InfoRow label="Industry" value={lead.industry} />
      <InfoRow label="Source" value={lead.source} />
      <InfoRow label="Project" value={lead.project} />
      <InfoRow
        icon={MapPin}
        label="Coordinates"
        value={
          lead.latitude != null && lead.longitude != null
            ? `${lead.latitude}, ${lead.longitude}`
            : "Location unavailable"
        }
      />
    </DrawerSection>
  );
}

export function DrawerPersonalization(lead: PipelineLead) {
  return (
    <DrawerSection title="AI Icebreaker">
      {lead.icebreaker ? (
        <p className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
          {lead.icebreaker}
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          {lead.status === "PENDING"
            ? "Not generated yet — run the scrape → personalize pipeline."
            : "No AI copy stored for this lead."}
        </p>
      )}
      {lead.scrapedContext && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Scraped Website Context
          </p>
          <p className="mt-1 line-clamp-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
            {lead.scrapedContext}
          </p>
        </div>
      )}
    </DrawerSection>
  );
}