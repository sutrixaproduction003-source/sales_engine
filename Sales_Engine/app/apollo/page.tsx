"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Loader2, Mail, MapPin, Phone, Search, UserPlus } from "lucide-react";
import { Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { apiCall } from "@/lib/api";
import type { ApolloPerson } from "@/lib/apollo";
import { apolloConfigured, waitForPhones } from "@/lib/apolloClient";
import { PROJECTS, getProject, getProjectRoles } from "@/lib/projects";

type Step = "idle" | "searching" | "saving" | "phones" | "drafting" | "done" | "error";

interface SavedLead {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  phoneStatus: string | null;
}

interface Summary {
  saved: number;
  created: number;
  withEmail: number;
  phones?: number;
  phonesPending?: number;
  drafted?: number;
  failed: number;
  lastError?: string;
}

/** "Hospitals" → "hospital": a keyword that matches people's companies and profiles. */
const keywordFor = (projectId: string) => (getProject(projectId)?.requirements.categories?.[0] ?? "").toLowerCase().replace(/s$/, "");

/**
 * Apollo lead search: decision-makers by location + project from Apollo's
 * database. Searching is free; saving a person reveals their full name, work
 * email and LinkedIn (1 credit) and optionally their mobile number.
 */
export default function ApolloSearchPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [location, setLocation] = useState("");
  const [projectId, setProjectId] = useState(PROJECTS[0]?.id ?? "");
  const [titles, setTitles] = useState(() => getProjectRoles(getProject(PROJECTS[0]?.id)).join(", "));
  const [keywords, setKeywords] = useState(() => keywordFor(PROJECTS[0]?.id ?? ""));
  const [people, setPeople] = useState<ApolloPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [withPhones, setWithPhones] = useState(false);
  const [draft, setDraft] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    apolloConfigured().then(setReady);
  }, []);

  const chooseProject = (id: string) => {
    setProjectId(id);
    setTitles(getProjectRoles(getProject(id)).join(", "));
    setKeywords(keywordFor(id));
  };

  const busy = step === "searching" || step === "saving" || step === "phones" || step === "drafting";
  const selected = useMemo(() => people.filter((p) => p.id && chosen.has(p.id)), [people, chosen]);

  const search = async (toPage = 1) => {
    if (!location.trim()) return;
    setStep("searching");
    setError(null);
    setSummary(null);
    try {
      const res = await apiCall<{ people: ApolloPerson[]; total: number; page: number }>("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: projectId,
          location,
          titles: titles.split(",").map((t) => t.trim()).filter(Boolean),
          keywords,
          page: toPage,
        }),
      });
      setPeople(res.people);
      setTotal(res.total);
      setPage(res.page);
      setSearched(true);
      setChosen(new Set(res.people.filter((p) => p.id && !savedIds.has(p.id)).map((p) => p.id as string)));
      setStep("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setError(null);
    setSummary(null);
    const result: Summary = { saved: 0, created: 0, withEmail: 0, failed: 0 };
    const saved: SavedLead[] = [];
    try {
      setStep("saving");
      for (let i = 0; i < selected.length; i++) {
        setProgress(`Revealing & saving · ${i + 1}/${selected.length}`);
        try {
          const res = await apiCall<{ lead: SavedLead; created: boolean }>("/api/apollo/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ person: selected[i], project: projectId, phone: withPhones }),
          });
          saved.push(res.lead);
          result.saved++;
          if (res.created) result.created++;
          if (res.lead.email) result.withEmail++;
          setSavedIds((s) => new Set(s).add(selected[i].id as string));
        } catch (err) {
          result.failed++;
          result.lastError = err instanceof Error ? err.message : String(err);
          if (/API key|credits|insufficient|401|403|not configured/i.test(result.lastError)) break;
        }
      }

      if (withPhones) {
        const pending = saved.filter((l) => l.phoneStatus === "pending").map((l) => l.id);
        let phones = saved.filter((l) => l.phoneStatus === "found").length;
        let stillPending = 0;
        if (pending.length) {
          setStep("phones");
          const waited = await waitForPhones(pending, (left, found) =>
            setProgress(`Waiting for Apollo to deliver mobile numbers · ${left} pending · ${phones + found} found`)
          );
          phones += waited.phones;
          stillPending = waited.pending;
        }
        result.phones = phones;
        result.phonesPending = stillPending;
      }

      const draftable = saved.filter((l) => l.email);
      if (draft && draftable.length) {
        setStep("drafting");
        let drafted = 0;
        for (let i = 0; i < draftable.length; i++) {
          setProgress(`Drafting emails · ${i + 1}/${draftable.length}`);
          const response = await fetch(`/api/leads/${draftable[i].id}/draft`, { method: "POST" });
          if (response.ok) drafted++;
        }
        result.drafted = drafted;
      }

      setSummary(result);
      setChosen(new Set());
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  // Apollo serves at most 500 pages of results.
  const pages = Math.min(500, Math.max(1, Math.ceil(total / 25)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Apollo lead search</h1>
        <p className="text-sm text-slate-400">
          Find decision-makers in a location from Apollo&apos;s contact database. Searching is free; saving a lead
          reveals their full name, work email and LinkedIn (1 Apollo credit), and optionally their mobile number.
        </p>
      </div>

      {ready === false && (
        <Card className="flex items-center gap-3 border-amber-500/30 bg-amber-500/5 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Apollo isn&apos;t connected. Add your Apollo.io API key in{" "}
            <Link href="/settings" className="text-sky-300 hover:underline">
              Settings → API keys
            </Link>{" "}
            (a master key: Apollo → Settings → Integrations → API).
          </span>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto] md:items-end">
          <div>
            <Label>Location</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="e.g. Chennai, India"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label>Project</Label>
            <Select value={projectId} onChange={(e) => chooseProject(e.target.value)} className="!w-full">
              {PROJECTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => search()} loading={step === "searching"} disabled={busy || !ready || !location.trim()}>
            <Search className="h-4 w-4" /> Search Apollo
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div>
            <Label>Job titles (comma-separated; similar titles included)</Label>
            <Input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="e.g. Medical Director, CEO" />
          </div>
          <div>
            <Label>Keyword (optional)</Label>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. hospital" />
          </div>
        </div>
      </Card>

      {step === "error" && (
        <p className="flex items-center gap-2 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      {people.length > 0 && (
        <Card className="!p-0">
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm text-slate-300">
            <span>
              {total.toLocaleString()} people match · page {page} of {pages.toLocaleString()}
            </span>
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" className="!px-2.5 !py-1 text-xs" disabled={busy || page <= 1} onClick={() => search(page - 1)}>
                Previous
              </Button>
              <Button variant="secondary" className="!px-2.5 !py-1 text-xs" disabled={busy || page >= pages} onClick={() => search(page + 1)}>
                Next
              </Button>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-y border-slate-800 text-xs uppercase text-slate-400">
                  <th className="px-5 py-2">
                    <input
                      type="checkbox"
                      checked={selected.length > 0 && selected.length === people.filter((p) => p.id && !savedIds.has(p.id)).length}
                      onChange={(e) =>
                        setChosen(e.target.checked ? new Set(people.filter((p) => p.id && !savedIds.has(p.id)).map((p) => p.id as string)) : new Set())
                      }
                      disabled={busy}
                    />
                  </th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Apollo has</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const id = person.id as string;
                  const done = savedIds.has(id);
                  return (
                    <tr key={id} className={cn("border-t border-slate-800/60", done && "opacity-50")}>
                      <td className="px-5 py-2">
                        <input type="checkbox" checked={chosen.has(id)} onChange={() => toggle(id)} disabled={busy || done} />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-100">
                        {[person.firstName, person.lastName].filter(Boolean).join(" ")}
                        {done && <span className="ml-2 text-xs text-emerald-400">saved</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        <BriefcaseBusiness className="mr-1 inline h-3.5 w-3.5 text-slate-500" />
                        {person.jobTitle || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{person.companyName || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        <span className={cn("mr-3 inline-flex items-center gap-1", person.has_email ? "text-emerald-300" : "text-slate-600")}>
                          <Mail className="h-3.5 w-3.5" /> email
                        </span>
                        <span className={cn("inline-flex items-center gap-1", person.has_phone ? "text-emerald-300" : "text-slate-600")}>
                          <Phone className="h-3.5 w-3.5" /> phone
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-slate-800 px-5 py-4">
            <label className="flex items-center gap-2 text-sm text-slate-300" title="Up to 8 Apollo credits per mobile found">
              <input type="checkbox" checked={withPhones} onChange={(e) => setWithPhones(e.target.checked)} disabled={busy} />
              Also find mobile numbers
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} disabled={busy} />
              Draft emails for review
            </label>
            <Button onClick={save} loading={step === "saving" || step === "phones" || step === "drafting"} disabled={busy || selected.length === 0}>
              <UserPlus className="h-4 w-4" /> Save {selected.length} leads
              <span className="text-xs font-normal opacity-80">
                ({selected.length} credit{selected.length === 1 ? "" : "s"}
                {withPhones ? " + up to 8 per mobile" : ""})
              </span>
            </Button>
          </div>
        </Card>
      )}

      {step === "idle" && searched && people.length === 0 && (
        <p className="text-sm text-slate-500">
          No one matches — try a broader location (e.g. the state or country), fewer job titles, or no keyword.
        </p>
      )}

      {busy && step !== "searching" && (
        <p className="flex items-center gap-2 text-sm text-sky-300">
          <Loader2 className="h-4 w-4 animate-spin" /> {progress}
        </p>
      )}

      {step === "done" && summary && (
        <Card className="space-y-2 border-emerald-500/30 bg-emerald-500/5">
          <p className="flex items-center gap-2 font-medium text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> Saved {summary.saved} leads
            <span className="text-sm font-normal text-slate-400">
              ({summary.created} new) · {summary.withEmail} with a work email
              {summary.phones !== undefined && ` · ${summary.phones} with a mobile number`}
            </span>
          </p>
          {summary.phonesPending ? (
            <p className="text-sm text-slate-300">
              {summary.phonesPending} mobile numbers are still coming — collect them from Leads Hub in a few minutes.
            </p>
          ) : null}
          {summary.drafted !== undefined && <p className="text-sm text-slate-300">{summary.drafted} email drafts waiting for review.</p>}
          {summary.failed > 0 && (
            <p className="text-sm text-amber-300">
              {summary.failed} could not be saved{summary.lastError ? ` — ${summary.lastError}` : ""}
            </p>
          )}
          <div className="flex gap-4 pt-1 text-sm">
            <Link href="/leads" className="text-sky-300 hover:underline">
              Open Leads Hub →
            </Link>
            {summary.drafted ? (
              <Link href="/review" className="text-sky-300 hover:underline">
                Open Review Queue →
              </Link>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
