"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { X, Mail, Briefcase, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/geo";
import type { DiscoveryLead } from "@/lib/types";

const statusTailwind: Record<string, string> = {
  PENDING: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  SCRAPED: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  PERSONALIZED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  SYNCED: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

function hasCoords(l: DiscoveryLead): boolean {
  return (
    typeof l.latitude === "number" &&
    typeof l.longitude === "number" &&
    Number.isFinite(l.latitude) &&
    Number.isFinite(l.longitude)
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-start justify-between gap-3 border-b border-slate-800/60 py-1 text-sm last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-all text-right text-slate-200">{value || "N/A"}</span>
    </p>
  );
}

export function MapView({
  leads,
  focusId,
  loading = false,
  error = null,
}: {
  leads: DiscoveryLead[];
  focusId?: string | null;
  loading?: boolean;
  error?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<DiscoveryLead | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([0, 0]);

  // Markers are rendered ONLY for leads with real coordinates returned by the
  // backend — no fabricated positions. Leads without coordinates stay in the
  // result list with "Location unavailable".
  const pins = useMemo(
    () =>
      leads
        .filter(hasCoords)
        .map((lead) => ({ lead, lat: lead.latitude as number, lng: lead.longitude as number })),
    [leads]
  );

  useEffect(() => {
    if (!focusId) return;
    const pin = pins.find((p) => p.lead.id === focusId);
    if (pin) {
      setCenter([pin.lng, pin.lat]);
      setZoom(4);
    }
  }, [focusId, pins]);

  const resetView = () => {
    setZoom(1);
    setCenter([0, 0]);
  };

  const selectedSpot = selected ? pins.find((p) => p.lead.id === selected.id) : null;

  return (
    <div className="relative h-full min-h-[288px] overflow-hidden rounded-lg border border-slate-800 bg-[#0b1120]">
      <ComposableMap
        projectionConfig={{ scale: 140 }}
        className="h-full w-full"
        style={{ background: "#0b1120" }}
      >
        <ZoomableGroup zoom={zoom} center={center}>
          <Geographies geography="/world.json">
            {({ geographies }: { geographies: unknown[] }) =>
              geographies.map((geo, i) => (
                <Geography
                  key={i}
                  geography={geo}
                  fill="#16203a"
                  stroke="#243050"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#1d2a4d", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>
          {pins.map(({ lead, lat, lng }) => (
            <Marker
              key={lead.id}
              coordinates={[lng, lat]}
              onClick={() => setSelected(lead)}
              style={{
                default: { cursor: "pointer" },
                hover: { cursor: "pointer" },
                pressed: { cursor: "pointer" },
              }}
            >
              <circle r={6} fill={STATUS_COLORS[lead.state] ?? "#64748b"} stroke="#0b1120" strokeWidth={1.5} />
              <circle
                r={focusId === lead.id ? 15 : 11}
                fill={STATUS_COLORS[lead.state] ?? "#64748b"}
                opacity={0.25}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Legend */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-slate-800 bg-slate-950/90 p-3 text-xs backdrop-blur">
        <p className="mb-2 font-semibold text-slate-200">Pipeline State</p>
        <ul className="space-y-1">
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <li key={k} className="flex items-center gap-2 text-slate-300">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: STATUS_COLORS[k] }}
              />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
          className="h-8 w-8 rounded-md border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
          className="h-8 w-8 rounded-md border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white"
        >
          −
        </button>
        <button
          onClick={resetView}
          title="Reset view"
          className="h-8 w-8 rounded-md border border-slate-700 bg-slate-900/90 text-slate-400 hover:text-white"
        >
          ⌖
        </button>
      </div>

      {/* Loading state overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <p className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/90 px-4 py-2 text-sm text-slate-300">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
            Loading map data...
          </p>
        </div>
      )}

      {/* Error state overlay */}
      {!loading && error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <p className="flex max-w-sm items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-center text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        </div>
      )}

      {/* Empty state — no fabricated positions, ever */}
      {!loading && !error && pins.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-4">
          <p className="rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-1.5 text-center text-xs text-slate-400">
            No leads with map coordinates — markers appear only when the backend returns latitude/longitude.
          </p>
        </div>
      )}

      {/* Lead popup — only real, backend-returned fields (N/A otherwise) */}
      {selected && (
        <div className="absolute bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-950/95 p-5 shadow-2xl backdrop-blur">
          <button
            onClick={() => setSelected(null)}
            className="absolute right-3 top-3 text-slate-500 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="text-lg font-semibold text-white">
            {selected.companyName || selected.fullName || "N/A"}
          </h3>
          <p className="mt-0.5 text-sm text-slate-400">
            {selected.jobTitle || "N/A"}
            {selectedSpot
              ? ` · ${selected.location || `Lat ${selectedSpot.lat.toFixed(2)}, Lng ${selectedSpot.lng.toFixed(2)}`}`
              : " · Location unavailable"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Pipeline State:</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                statusTailwind[selected.state] ?? "border-slate-700 text-slate-400"
              }`}
            >
              {STATUS_LABELS[selected.state] ?? (selected.state === "NEW" ? "Discovered" : selected.state)}
            </span>
          </div>

          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Briefcase className="h-3.5 w-3.5 text-sky-400" /> Lead Details
            </p>
            <div className="mt-1 rounded-lg bg-slate-900 p-2.5">
              <InfoRow label="Company" value={selected.companyName} />
              <InfoRow label="Business Type / Industry" value={selected.industry} />
              <InfoRow label="Contact Name" value={selected.fullName} />
              <InfoRow label="Job Title" value={selected.jobTitle} />
              <InfoRow label="Email" value={selected.email} />
              <InfoRow label="Phone" value={selected.phone} />
              <InfoRow label="Location" value={selected.location || "Location unavailable"} />
              <InfoRow label="Lead Score" value="N/A" />
              <InfoRow label="Provider" value={selected.source} />
              <InfoRow label="Website" value={selected.companyWebsite} />
            </div>
          </div>

          {selected.email && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Mail className="h-3.5 w-3.5" /> {selected.email}
            </p>
          )}

          {selected.dbId !== null && (
            <Button
              variant="secondary"
              className="mt-3 w-full !py-1.5 text-xs"
              onClick={() => router.push(`/leads?lead=${selected.dbId}`)}
            >
              View Lead
            </Button>
          )}
        </div>
      )}

      <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-600">
        Markers rendered only from backend-returned coordinates · CartoDB Dark Matter style
      </p>
    </div>
  );
}