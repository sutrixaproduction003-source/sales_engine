"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  UsersRound,
  X,
} from "lucide-react";
import { Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { PersonCard } from "@/components/discovery/PersonCard";
import { PROJECTS, getProject, getProjectRoles } from "@/lib/projects";
import type { FoundPerson } from "@/lib/people";
import { buildSalesNavigatorSearchUrl } from "@/lib/salesNavigator";
import { usePeopleSearch } from "@/lib/usePeopleSearch";

const LeadMap = dynamic(() => import("@/components/map/LeadMap"), {
  ssr: false,
  loading: () => <div className="h-full rounded-xl border border-slate-800 bg-[#0b1120]" />,
});

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Discovery — find the person: a business name + location → the business
 * (Google Maps) and the people who work there (public LinkedIn profiles via
 * Google, plus Apollo when configured). Saved people get a drafted email that
 * waits in the Review Queue.
 */
export default function DiscoveryPage() {
  const [business, setBusiness] = useState("");
  const [location, setLocation] = useState("");
  const [projectId, setProjectId] = useState(PROJECTS[0]?.id ?? "");
  const [roles, setRoles] = useState<string[]>(() => getProjectRoles(PROJECTS[0]));
  const [newRole, setNewRole] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [pinSelected, setPinSelected] = useState<string | null>(null);

  const { status, result, error, elapsed, search, cancel } = usePeopleSearch();
  const searching = status === "searching";

  useEffect(() => setRoles(getProjectRoles(getProject(projectId))), [projectId]);

  const place = result?.done ? result.business ?? null : null;
  const people: FoundPerson[] = useMemo(
    () => (result?.people ?? []).map((p) => (emails[p.id] ? { ...p, email: emails[p.id] } : p)),
    [result, emails]
  );
  const atBusiness = people.filter((p) => p.worksThere);
  const shown = showAll ? people : atBusiness;
  const salesNavUrl = buildSalesNavigatorSearchUrl({
    company: place?.companyName || business,
    jobTitle: roles.join(", "),
  });

  const canSearch = business.trim().length > 0 && !searching;
  const run = () => {
    if (!canSearch) return;
    setEmails({});
    setShowAll(false);
    search({ business: business.trim(), location: location.trim(), roles });
  };

  const addRole = () => {
    const role = newRole.trim();
    if (role && !roles.includes(role)) setRoles((r) => [...r, role]);
    setNewRole("");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Discovery — find the person</h1>
        <p className="text-sm text-slate-400">
          Enter a business and its location to find who works there — general managers, owners, sales heads — and reach
          out to them by name.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[2fr_1.5fr_1fr_auto] md:items-end">
          <div>
            <Label>Business</Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="e.g. Taj Exotica Resort & Spa, Apollo Hospital"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label>Location</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="e.g. Goa, India"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label>Project</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!w-full">
              {PROJECTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {searching ? (
            <Button variant="secondary" onClick={cancel}>
              <X className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button onClick={run} disabled={!canSearch}>
              <Search className="h-4 w-4" /> Find people
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-500">Roles to look for:</span>
          {roles.map((role) => (
            <span
              key={role}
              className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs text-sky-200"
            >
              {role}
              <button
                onClick={() => setRoles((r) => r.filter((x) => x !== role))}
                title="Remove"
                className="text-sky-300/70 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <Input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRole()}
              placeholder="Add role…"
              className="!h-7 !w-32 !py-0 text-xs"
            />
            <button onClick={addRole} className="text-slate-400 hover:text-white" title="Add role">
              <Plus className="h-4 w-4" />
            </button>
          </span>
        </div>

        {searching && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-sky-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding {business || "the business"} on Google Maps and searching public profiles · {formatElapsed(elapsed)}
            <span className="text-xs text-slate-500">
              ({result?.progress?.people === "SUCCEEDED" ? "people found, locating the business…" : "usually 1–2 minutes"})
            </span>
          </p>
        )}
        {status === "error" && (
          <p className="flex items-center gap-2 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}
      </Card>

      {status === "done" && result && (
        <>
          {result.warnings?.map((w) => (
            <p key={w} className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {w}
            </p>
          ))}

          {/* The business */}
          <Card className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            {place ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Business</p>
                <h2 className="text-lg font-semibold text-white">{place.companyName}</h2>
                <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                  {place.industry}
                  {typeof place.googleRating === "number" && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" /> {place.googleRating.toFixed(1)}
                      <span className="text-slate-500">({place.totalReviewsCount?.toLocaleString() ?? 0} reviews)</span>
                    </span>
                  )}
                </p>
                <div className="space-y-1.5 pt-1 text-sm text-slate-300">
                  {place.exactAddress && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> {place.exactAddress}
                    </p>
                  )}
                  {place.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-500" /> {place.phone}
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-500" />
                    {place.email || <span className="text-slate-500">No public email found</span>}
                  </p>
                  {place.companyWebsite && (
                    <a
                      href={place.companyWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sky-300 hover:underline"
                    >
                      <Globe className="h-4 w-4 text-slate-500" />
                      {hostname(place.companyWebsite)}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                The business wasn&apos;t found on Google Maps — try adding the city or the full business name. People
                found by name are still listed below.
              </p>
            )}
            <LeadMap
              places={place ? [place] : []}
              selectedId={pinSelected}
              onSelect={setPinSelected}
              fitKey={place ? 1 : 0}
              className="h-64"
            />
          </Card>

          {/* The people */}
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-sky-400" />
                <h2 className="text-base font-semibold text-white">
                  {atBusiness.length} {atBusiness.length === 1 ? "person" : "people"} at {place?.companyName || business}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {people.length > atBusiness.length && (
                  <button onClick={() => setShowAll((s) => !s)} className="text-slate-400 hover:text-white">
                    {showAll ? "Hide" : "Show"} {people.length - atBusiness.length} unconfirmed
                  </button>
                )}
                <a
                  href={salesNavUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-medium text-sky-300 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Search in Sales Navigator
                </a>
              </div>
            </div>

            {!result.apolloConfigured && (
              <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                Personal emails aren&apos;t public — drafts go to the business inbox addressed to the person by name. Add
                your Apollo.io API key in Settings to look up verified work emails.
              </p>
            )}

            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No public profiles found for these roles. Try fewer or broader roles, or open the search in Sales
                Navigator.
              </p>
            ) : (
              <div className={cn("grid gap-3", shown.length > 1 && "xl:grid-cols-2")}>
                {shown.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    business={place}
                    project={projectId}
                    apolloConfigured={Boolean(result.apolloConfigured)}
                    onEmailFound={(id, email) => setEmails((e) => ({ ...e, [id]: email }))}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
