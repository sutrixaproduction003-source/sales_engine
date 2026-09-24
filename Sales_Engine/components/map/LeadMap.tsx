"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { Expand, LocateFixed, Shrink } from "lucide-react";
import { cn } from "@/components/ui";
import { buildCategoryColors, hasCoordinates, placeCategory, type ScrapedPlace } from "@/lib/places";
import { PlaceDetailCard } from "./PlaceDetailCard";

/**
 * Street-level lead map (Leaflet). Loaded client-side only — see MapDiscovery.
 * Markers use the exact coordinates Google Maps returned for each business;
 * nothing is estimated.
 */

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/** Key-free basemaps. Each is one or more tile layers (base + optional labels). */
const BASEMAPS: { name: string; layers: { url: string; attribution?: string }[] }[] = [
  {
    name: "Streets",
    layers: [{ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: OSM_ATTRIBUTION }],
  },
  {
    name: "Dark",
    layers: [
      { url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, attribution: "Tiles &copy; Esri" },
      { url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
    ],
  },
  {
    name: "Satellite",
    layers: [
      { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" },
      { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}` },
    ],
  },
];

const WORLD_VIEW: L.LatLngExpression = [20, 78];
/** Width of the selected-business card (PlaceDetailCard, w-80). */
const CARD_WIDTH = 320;
const BASEMAP_STORAGE_KEY = "sales-engine:basemap";

function readStoredBasemap(): string {
  try {
    const stored = window.localStorage.getItem(BASEMAP_STORAGE_KEY);
    return BASEMAPS.some((b) => b.name === stored) ? (stored as string) : BASEMAPS[0].name;
  } catch {
    return BASEMAPS[0].name;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function pinIcon(color: string, highlighted: boolean, selected: boolean) {
  const size = selected ? 34 : highlighted ? 30 : 24;
  return L.divIcon({
    className: "",
    html: `<div class="se-pin${selected ? " se-pin--selected" : ""}" style="--pin:${color};width:${size}px;height:${size}px"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size],
  });
}

function clusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 50 ? 42 : 50;
  return L.divIcon({
    className: "",
    html: `<div class="se-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`,
    iconSize: [size, size],
  });
}

interface MarkerLayerProps {
  places: ScrapedPlace[];
  colors: Map<string, string>;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  fitKey: number;
}

/** Imperative marker-cluster layer: fast for hundreds of markers. */
function MarkerLayer({ places, colors, selectedId, hoveredId, onSelect, fitKey }: MarkerLayerProps) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; color: string }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: clusterIcon,
    });
    map.addLayer(group);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  // (Re)build markers when the visible places change.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    markersRef.current.clear();

    for (const place of places) {
      if (!hasCoordinates(place)) continue;
      const color = colors.get(placeCategory(place)) ?? "#94a3b8";
      const marker = L.marker([place.latitude as number, place.longitude as number], {
        icon: pinIcon(color, false, false),
        riseOnHover: true,
      });
      marker.bindTooltip(escapeHtml(place.companyName), { direction: "top", className: "se-tooltip" });
      marker.on("click", () => onSelectRef.current(place.id));
      group.addLayer(marker);
      markersRef.current.set(place.id, { marker, color });
    }
  }, [places, colors]);

  // Fit the map to the results (new search, or "recenter").
  useEffect(() => {
    const points = places.filter(hasCoordinates).map((p) => [p.latitude, p.longitude] as [number, number]);
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.12), { maxZoom: 16 });
    // Only on explicit refits, not on every filter toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);

  // Highlight hovered/selected markers; bring the selected one into view.
  const previous = useRef<string[]>([]);
  useEffect(() => {
    const ids = new Set([...previous.current, selectedId, hoveredId].filter((id): id is string => Boolean(id)));
    for (const id of Array.from(ids)) {
      const entry = markersRef.current.get(id);
      if (!entry) continue;
      entry.marker.setIcon(pinIcon(entry.color, id === hoveredId, id === selectedId));
      entry.marker.setZIndexOffset(id === selectedId ? 1000 : id === hoveredId ? 500 : 0);
    }
    previous.current = [selectedId, hoveredId].filter((id): id is string => Boolean(id));
  }, [selectedId, hoveredId, places]);

  // Fly to a newly selected business (expanding its cluster if needed).
  useEffect(() => {
    const selected = selectedId ? markersRef.current.get(selectedId) : undefined;
    if (!selected || !groupRef.current) return;
    groupRef.current.zoomToShowLayer(selected.marker, () => {
      // The detail card covers the right side of the map; centre the map to
      // the right of the marker so the pin stays visible next to the card.
      // On narrow maps the card spans the width, so push the pin down instead.
      const zoom = Math.max(map.getZoom(), 16);
      const size = map.getSize();
      const offset: [number, number] = size.x >= 520 ? [CARD_WIDTH / 2 + 12, 0] : [0, -size.y / 4];
      const center = map.unproject(map.project(selected.marker.getLatLng(), zoom).add(offset), zoom);
      map.flyTo(center, zoom, { duration: 0.6 });
    });
  }, [selectedId, map]);

  return null;
}

/** Keep Leaflet's size in sync when the container changes (e.g. full screen). */
function ResizeWatcher({ trigger }: { trigger: unknown }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(timer);
  }, [trigger, map]);
  return null;
}

interface LeadMapProps {
  places: ScrapedPlace[];
  selectedId: string | null;
  hoveredId?: string | null;
  onSelect: (id: string | null) => void;
  /** Increment to refit the map to the current results. */
  fitKey: number;
  className?: string;
}

export default function LeadMap({ places, selectedId, hoveredId = null, onSelect, fitKey, className }: LeadMapProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [refit, setRefit] = useState(0);
  const [basemapName, setBasemapName] = useState(readStoredBasemap);
  const basemap = BASEMAPS.find((b) => b.name === basemapName) ?? BASEMAPS[0];

  const chooseBasemap = (name: string) => {
    setBasemapName(name);
    try {
      window.localStorage.setItem(BASEMAP_STORAGE_KEY, name);
    } catch {
      // Storage unavailable (private mode): the choice just isn't remembered.
    }
  };

  const colors = useMemo(() => buildCategoryColors(places), [places]);
  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const place of places) {
      if (!hasCoordinates(place)) continue;
      const category = placeCategory(place);
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }
    return byCategory;
  }, [places]);

  // A new result set shows every category again.
  useEffect(() => setHidden(new Set()), [places]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const visible = useMemo(() => places.filter((p) => !hidden.has(placeCategory(p))), [places, hidden]);
  const selected = places.find((p) => p.id === selectedId) ?? null;
  const mappedCount = places.filter(hasCoordinates).length;

  const toggleCategory = (category: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-slate-800 bg-[#0b1120]",
        fullscreen ? "fixed inset-0 z-[2000] rounded-none" : "rounded-xl",
        !fullscreen && className
      )}
    >
      <MapContainer center={WORLD_VIEW} zoom={4} minZoom={2} worldCopyJump className="h-full w-full" zoomControl>
        {basemap.layers.map((layer) => (
          <TileLayer key={layer.url} url={layer.url} attribution={layer.attribution} maxZoom={19} />
        ))}
        <MarkerLayer
          places={visible}
          colors={colors}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={onSelect}
          fitKey={fitKey + refit}
        />
        <ResizeWatcher trigger={fullscreen} />
      </MapContainer>

      {/* Legend — click a category to show/hide it */}
      {counts.size > 0 && (
        <div className="absolute bottom-6 left-3 z-[1000] max-w-[60%] rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 text-xs backdrop-blur">
          <p className="mb-1.5 font-semibold text-slate-200">
            {mappedCount} {mappedCount === 1 ? "business" : "businesses"} mapped
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {Array.from(counts.entries()).map(([category, count]) => {
              const off = hidden.has(category);
              return (
                <li key={category}>
                  <button
                    onClick={() => toggleCategory(category)}
                    title={off ? "Show on map" : "Hide from map"}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition",
                      off
                        ? "border-slate-800 text-slate-600 line-through"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: off ? "#334155" : colors.get(category) }} />
                    {category} <span className="text-slate-500">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Basemap switcher */}
      <div className="absolute right-3 top-3 z-[1000] flex overflow-hidden rounded-md border border-slate-700 bg-slate-950/90 text-xs">
        {BASEMAPS.map((b) => (
          <button
            key={b.name}
            onClick={() => chooseBasemap(b.name)}
            className={cn(
              "px-2.5 py-1.5 transition",
              b.name === basemap.name ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-white"
            )}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Map actions */}
      <div className="absolute left-14 top-3 z-[1000] flex gap-1.5">
        <button
          onClick={() => setRefit((n) => n + 1)}
          disabled={mappedCount === 0}
          title="Fit map to all results"
          className="flex h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-950/90 px-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
        >
          <LocateFixed className="h-3.5 w-3.5" /> Fit results
        </button>
        <button
          onClick={() => setFullscreen((f) => !f)}
          title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          className="flex h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-950/90 px-2 text-xs text-slate-300 hover:text-white"
        >
          {fullscreen ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
          {fullscreen ? "Exit" : "Full screen"}
        </button>
      </div>

      {selected && (
        <PlaceDetailCard
          place={selected}
          color={colors.get(placeCategory(selected))}
          onClose={() => onSelect(null)}
          className="absolute right-3 top-14 z-[1000] max-h-[calc(100%-5rem)] overflow-y-auto"
        />
      )}
    </div>
  );
}
