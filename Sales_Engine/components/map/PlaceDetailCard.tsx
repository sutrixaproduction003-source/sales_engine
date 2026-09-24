"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Globe, Mail, MapPin, Phone, Star, X } from "lucide-react";
import { cn } from "@/components/ui";
import { STATE_CONFIGS } from "@/lib/states";
import { placeCategory, type ScrapedPlace } from "@/lib/places";

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-slate-300">
      <span className="mt-0.5 shrink-0 text-slate-500">{icon}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

const linkClass = "text-sky-300 hover:text-sky-200 hover:underline";

/** Everything scraped for one business, shown over the map. */
export function PlaceDetailCard({
  place,
  color,
  onClose,
  className,
}: {
  place: ScrapedPlace;
  color?: string;
  onClose: () => void;
  className?: string;
}) {
  const status = place.status ? STATE_CONFIGS[place.status] : null;
  const socials = [
    { href: place.instagramLink, short: "IG", label: "Instagram" },
    { href: place.facebookLink, short: "FB", label: "Facebook" },
    { href: place.linkedinUrl, short: "in", label: "LinkedIn" },
  ].filter((s) => s.href);

  return (
    <div
      className={cn(
        "w-80 max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur",
        className
      )}
    >
      <button onClick={onClose} className="absolute right-3 top-3 text-slate-500 hover:text-slate-200" title="Close">
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-5">
        {place.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- remote Google image, size unknown
          <img src={place.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-white">{place.companyName}</h3>
          {place.contactName && (
            <p className="mt-0.5 text-xs text-sky-300">
              {place.contactName}
              {place.contactTitle && <span className="text-slate-400"> · {place.contactTitle}</span>}
              {place.phoneStatus === "pending" && <span className="text-slate-500"> · mobile coming</span>}
            </p>
          )}
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? "#94a3b8" }} />
            {place.industry || placeCategory(place)}
          </p>
          {typeof place.googleRating === "number" && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-300">
              <Star className="h-3 w-3 fill-current" /> {place.googleRating.toFixed(1)}
              {typeof place.totalReviewsCount === "number" && (
                <span className="text-slate-500">({place.totalReviewsCount.toLocaleString()} reviews)</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {place.exactAddress && <Row icon={<MapPin className="h-3.5 w-3.5" />}>{place.exactAddress}</Row>}
        {place.locationApproximate && (
          <p className="text-[11px] text-amber-300/80">Approximate pin — no exact address from Apollo.</p>
        )}
        <Row icon={<Mail className="h-3.5 w-3.5" />}>
          {place.email ? (
            <a href={`mailto:${place.email}`} className={linkClass}>
              {place.email}
            </a>
          ) : (
            <span className="text-slate-500">No public email found</span>
          )}
        </Row>
        {place.phone && (
          <Row icon={<Phone className="h-3.5 w-3.5" />}>
            <a href={`tel:${place.phone.replace(/\s+/g, "")}`} className={linkClass}>
              {place.phone}
            </a>
          </Row>
        )}
        {place.companyWebsite && (
          <Row icon={<Globe className="h-3.5 w-3.5" />}>
            <a href={place.companyWebsite} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {place.companyWebsite.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          </Row>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {place.googleMapsLink && (
          <a
            href={place.googleMapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white"
          >
            <ExternalLink className="h-3 w-3" /> Google Maps
          </a>
        )}
        {socials.map((s) => (
          <a
            key={s.label}
            href={s.href as string}
            target="_blank"
            rel="noopener noreferrer"
            title={s.label}
            className="rounded-md border border-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:border-slate-500 hover:text-white"
          >
            {s.short}
          </a>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5 text-[11px]">
        <span className={cn("rounded-full border px-2 py-0.5", status ? `${status.bg} ${status.border} ${status.text}` : "border-slate-700 text-slate-500")}>
          {status ? status.label : "Not saved"}
        </span>
        {place.dbId != null && (
          <Link href={`/leads?lead=${place.dbId}`} className={linkClass}>
            Open in Leads Hub →
          </Link>
        )}
      </div>
    </div>
  );
}
