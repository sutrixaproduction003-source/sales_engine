"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button, Card, Label, Select, cn } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { apolloConfigured, findContacts } from "@/lib/apolloClient";
import { getHubSpotStatus, syncToHubSpot, type HubSpotStatus } from "@/lib/hubspotClient";
import { pollPlacesSearch, type PlacesRun, type ScrapedPlace } from "@/lib/places";
import { PROJECTS } from "@/lib/projects";
import { parseSalesNavigatorText, splitLocation, type SalesNavLead } from "@/lib/salesNavigatorImport";

type ImportedLead = { key: string; id: number; created: boolean };
type Step = "idle" | "saving" | "lookup" | "apollo" | "drafting" | "crm" | "done" | "error";

interface Summary {
  created: number;
  updated: number;
  companies?: number;
  companiesFound?: number;
  withEmail?: number;
  apolloLooked?: number;
  apolloEmails?: number;
  apolloPhones?: number;
  apolloPending?: number;
  apolloError?: string;
  drafted?: number;
  draftFailed?: number;
  hubspotSynced?: number;
  hubspotFailed?: number;
  hubspotError?: string;
}

const POLL_MS = 4000;
/** The backend looks up at most this many companies per run. */
const LOOKUP_BATCH = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Import from LinkedIn Sales Navigator: paste a copied lead list page, check
 * the parsed leads, and import them into the CRM — optionally looking up each
 * company (website, public email, location) and drafting emails for review.
 */
export default function SalesNavigatorImportPage() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<SalesNavLead[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState(PROJECTS[0]?.id ?? "");
  const [lookupCompanies, setLookupCompanies] = useState(true);
  const [draftEmails, setDraftEmails] = useState(true);
  const [apolloReady, setApolloReady] = useState<boolean | null>(null);
  const [apolloEmails, setApolloEmails] = useState(true);
  const [apolloPhones, setApolloPhones] = useState(false);
  const [hubspot, setHubspot] = useState<HubSpotStatus | null>(null);
  const [addToHubSpot, setAddToHubSpot] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    apolloConfigured().then(setApolloReady);
  }, []);

  useEffect(() => {
    getHubSpotStatus()
      .then((status) => {
        setHubspot(status);
        setAddToHubSpot(status.connected);
      })
      .catch(() => setHubspot(null));
  }, []);

  const parsedPreview = useMemo(() => parseSalesNavigatorText(text), [text]);
  const selected = rows.filter((r) => !excluded.has(r.key));
  const busy = step === "saving" || step === "lookup" || step === "apollo" || step === "drafting" || step === "crm";

  const addPaste = () => {
    const known = new Set(rows.map((r) => r.key));
    setRows((current) => [...current, ...parsedPreview.filter((r) => !known.has(r.key))]);
    setText("");
  };

  const toggle = (key: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const runImport = async () => {
    setError(null);
    setSummary(null);
    try {
      // 1. Save the leads.
      setStep("saving");
      setProgress(`Importing ${selected.length} leads…`);
      const saved = await apiCall<{ imported: ImportedLead[]; created: number; updated: number }>(
        "/api/sales-navigator/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: projectId, leads: selected }),
        }
      );
      const idByKey = new Map(saved.imported.map((l) => [l.key, l.id]));
      const result: Summary = { created: saved.created, updated: saved.updated };
      let draftable = saved.imported.map((l) => l.id);

      // 2. Look up each company once (one Google Maps run for all of them).
      if (lookupCompanies) {
        const byQuery = new Map<string, { company: string; leadIds: number[] }>();
        for (const lead of selected) {
          if (!lead.company) continue;
          const city = splitLocation(lead.location).city ?? "";
          const query = [lead.company, city].filter(Boolean).join(", ");
          const entry = byQuery.get(query) ?? { company: lead.company, leadIds: [] };
          const id = idByKey.get(lead.key);
          if (id) entry.leadIds.push(id);
          byQuery.set(query, entry);
        }
        result.companies = byQuery.size;

        if (byQuery.size > 0) {
          setStep("lookup");
          const began = Date.now();
          const queries = Array.from(byQuery.keys());
          const placeByQuery = new Map<string, ScrapedPlace>();
          // One run per batch of companies, so large imports are looked up in full.
          for (let from = 0; from < queries.length; from += LOOKUP_BATCH) {
            const batch = queries.slice(from, from + LOOKUP_BATCH);
            const label = queries.length > LOOKUP_BATCH ? ` (batch ${from / LOOKUP_BATCH + 1} of ${Math.ceil(queries.length / LOOKUP_BATCH)})` : "";
            setProgress(`Looking up ${byQuery.size} companies${label}…`);
            let run = await apiCall<PlacesRun>("/api/places/lookup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ queries: batch }),
            });
            while (!run.done) {
              await sleep(POLL_MS);
              run = await pollPlacesSearch(run.runId, projectId, { save: false });
              setProgress(`Looking up ${byQuery.size} companies${label} · ${Math.round((Date.now() - began) / 1000)}s`);
            }
            for (const place of run.places) if (place.searchTerm) placeByQuery.set(place.searchTerm, place);
          }
          const matches = Array.from(byQuery.entries()).map(([query, entry]) => ({
            ...entry,
            place: placeByQuery.get(query) ?? null,
          }));
          const enriched = await apiCall<{ enriched: number; withEmail: number; skipped: string[] }>(
            "/api/sales-navigator/enrich",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matches }) }
          );
          result.companiesFound = byQuery.size - enriched.skipped.length;
          result.withEmail = enriched.withEmail;
        }
      }

      // 3. Work emails and mobile numbers from Apollo (Sales Navigator shows neither).
      if (apolloReady && (apolloEmails || apolloPhones)) {
        setStep("apollo");
        const ids = saved.imported.map((l) => l.id);
        const found = await findContacts(ids, { phone: apolloPhones }, setProgress);
        result.apolloLooked = ids.length;
        result.apolloEmails = found.emails;
        result.apolloPhones = apolloPhones ? found.phones : undefined;
        result.apolloPending = found.pending;
        result.apolloError = found.error;
      }

      // 4. Draft emails (only leads that now have an email can be drafted).
      if (draftEmails) {
        setStep("drafting");
        let drafted = 0;
        let failed = 0;
        const leads = await apiCall<{ leads: { id: number; email: string | null; status: string }[] }>("/api/leads");
        const ids = new Set(draftable);
        draftable = leads.leads.filter((l) => ids.has(l.id) && l.email && l.status === "PENDING").map((l) => l.id);
        for (let i = 0; i < draftable.length; i++) {
          const id = draftable[i];
          setProgress(`Drafting emails · ${i + 1}/${draftable.length}`);
          const response = await fetch(`/api/leads/${id}/draft`, { method: "POST" });
          if (response.ok) drafted++;
          else failed++;
        }
        result.drafted = drafted;
        result.draftFailed = failed;
      }

      // 5. Add the imported leads to HubSpot (contacts + companies).
      if (addToHubSpot && hubspot?.connected) {
        setStep("crm");
        setProgress("Adding leads to HubSpot…");
        try {
          const synced = await syncToHubSpot(saved.imported.map((l) => l.id), (done, remaining) =>
            setProgress(`Adding leads to HubSpot · ${done}/${done + remaining}`)
          );
          result.hubspotSynced = synced.synced;
          result.hubspotFailed = synced.failed;
          result.hubspotError = synced.errors[0];
        } catch (err) {
          result.hubspotError = err instanceof Error ? err.message : String(err);
        }
      }

      setSummary(result);
      setStep("done");
      setRows([]);
      setExcluded(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Import from Sales Navigator</h1>
        <p className="text-sm text-slate-400">
          Copy a lead list page in Sales Navigator and paste it here — the leads go straight into your CRM.
        </p>
      </div>

      <Card className="space-y-3">
        <ol className="grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
          <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <span className="font-semibold text-sky-300">1.</span> In Sales Navigator, open your lead list (or a lead search).
          </li>
          <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <span className="font-semibold text-sky-300">2.</span> Click an empty area of the page, press{" "}
            <kbd className="rounded bg-slate-800 px-1">Ctrl</kbd>+<kbd className="rounded bg-slate-800 px-1">A</kbd>, then{" "}
            <kbd className="rounded bg-slate-800 px-1">Ctrl</kbd>+<kbd className="rounded bg-slate-800 px-1">C</kbd>.
          </li>
          <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <span className="font-semibold text-sky-300">3.</span> Paste below and click Add. Repeat for each page (25 leads per
            page).
          </li>
        </ol>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          disabled={busy}
          placeholder="Paste the copied Sales Navigator page here…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={addPaste} disabled={busy || parsedPreview.length === 0}>
            <ClipboardPaste className="h-4 w-4" /> Add {parsedPreview.length || ""} leads
          </Button>
          {text.trim() && parsedPreview.length === 0 && (
            <span className="flex items-center gap-1 text-sm text-amber-300">
              <AlertTriangle className="h-4 w-4" /> No leads recognised — copy the whole page (Ctrl+A) from a lead list.
            </span>
          )}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="space-y-4 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <h2 className="text-base font-semibold text-white">
              {selected.length} of {rows.length} leads selected
            </h2>
            <button onClick={() => setRows([])} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white" disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-5 py-2" />
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Geography</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const off = excluded.has(row.key);
                  return (
                    <tr key={row.key} className={cn("border-t border-slate-800/60", off && "opacity-40")}>
                      <td className="px-5 py-2">
                        <input type="checkbox" checked={!off} onChange={() => toggle(row.key)} disabled={busy} />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-100">
                        {row.name}
                        {row.connection && <span className="ml-1 text-xs text-slate-500">· {row.connection}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{row.jobTitle || "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{row.company || "—"}</td>
                      <td className="px-3 py-2 text-slate-400">{row.location || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 border-t border-slate-800 px-5 py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-48">
                <Label>Project</Label>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!w-full" disabled={busy}>
                  {PROJECTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={lookupCompanies} onChange={(e) => setLookupCompanies(e.target.checked)} disabled={busy} />
                Find each company&apos;s website, email &amp; location
              </label>
              {apolloReady ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-slate-300" title="1 Apollo credit per person">
                    <input type="checkbox" checked={apolloEmails} onChange={(e) => setApolloEmails(e.target.checked)} disabled={busy} />
                    Find work emails (Apollo)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300" title="Up to 8 Apollo credits per mobile found">
                    <input type="checkbox" checked={apolloPhones} onChange={(e) => setApolloPhones(e.target.checked)} disabled={busy} />
                    Find mobile numbers (Apollo)
                  </label>
                </>
              ) : (
                apolloReady === false && (
                  <span className="text-xs text-slate-500">
                    Add your Apollo.io API key in{" "}
                    <Link href="/settings" className="text-sky-300 hover:underline">
                      Settings
                    </Link>{" "}
                    to find work emails and mobile numbers.
                  </span>
                )
              )}
              {hubspot?.connected && (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={addToHubSpot} onChange={(e) => setAddToHubSpot(e.target.checked)} disabled={busy} />
                  Add to HubSpot
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={draftEmails} onChange={(e) => setDraftEmails(e.target.checked)} disabled={busy} />
                Draft emails for review
              </label>
            </div>
            <Button onClick={runImport} loading={busy} disabled={busy || selected.length === 0}>
              <UploadCloud className="h-4 w-4" /> Import {selected.length} leads to CRM
            </Button>
          </div>
        </Card>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-sm text-sky-300">
          <Loader2 className="h-4 w-4 animate-spin" /> {progress}
        </p>
      )}
      {step === "error" && (
        <p className="flex items-center gap-2 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}
      {step === "done" && summary && (
        <Card className="space-y-2 border-emerald-500/30 bg-emerald-500/5">
          <p className="flex items-center gap-2 font-medium text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> Imported {summary.created + summary.updated} leads
            <span className="text-sm font-normal text-slate-400">
              ({summary.created} new{summary.updated ? `, ${summary.updated} updated` : ""})
            </span>
          </p>
          <ul className="space-y-1 text-sm text-slate-300">
            {summary.companies !== undefined && (
              <li>
                Companies found: {summary.companiesFound ?? 0} of {summary.companies} ·{" "}
                {summary.withEmail ?? 0} leads now have an email address
              </li>
            )}
            {summary.apolloLooked !== undefined && (
              <li>
                Apollo: {summary.apolloEmails ?? 0} work emails
                {summary.apolloPhones !== undefined && ` · ${summary.apolloPhones} mobile numbers`} found for{" "}
                {summary.apolloLooked} people
                {summary.apolloPending ? ` · ${summary.apolloPending} mobiles still coming (collected from Leads Hub later)` : ""}
                {summary.apolloError && <span className="text-amber-300"> — {summary.apolloError}</span>}
              </li>
            )}
            {(summary.hubspotSynced !== undefined || summary.hubspotError) && (
              <li>
                HubSpot: {summary.hubspotSynced ?? 0} contacts added or updated
                {summary.hubspotFailed ? ` · ${summary.hubspotFailed} failed` : ""}
                {summary.hubspotError && <span className="text-amber-300"> — {summary.hubspotError}</span>}
              </li>
            )}
            {summary.drafted !== undefined && (
              <li>
                {summary.drafted} email drafts waiting for review
                {summary.draftFailed ? ` · ${summary.draftFailed} failed` : ""}
              </li>
            )}
          </ul>
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
