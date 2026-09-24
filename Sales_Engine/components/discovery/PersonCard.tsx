"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mail, Search, Sparkles, UserRound } from "lucide-react";
import { Badge, Button, cn } from "@/components/ui";
import { savePerson, type FoundPerson } from "@/lib/people";
import type { ScrapedPlace } from "@/lib/places";
import { buildSalesNavigatorSearchUrl } from "@/lib/salesNavigator";

type SaveState =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "saved"; leadId: number; drafted: boolean; note: string }
  | { kind: "error"; message: string };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function PersonCard({
  person,
  business,
  project,
  apolloConfigured,
  onEmailFound,
}: {
  person: FoundPerson;
  business: ScrapedPlace | null;
  project: string;
  apolloConfigured: boolean;
  onEmailFound: (id: string, email: string) => void;
}) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const businessEmail = business?.email || "";
  const sendTo = person.email || businessEmail;

  /** Save the person as a lead, then draft their email (goes to the Review Queue). */
  const saveAndDraft = async () => {
    try {
      setState({ kind: "busy", label: "Saving…" });
      const saved = await savePerson(person, business, project);
      if (saved.emailKind === "none") {
        setState({ kind: "saved", leadId: saved.lead.id, drafted: false, note: "Saved — no email to draft for." });
        return;
      }
      setState({ kind: "busy", label: "Drafting email…" });
      const response = await fetch(`/api/leads/${saved.lead.id}/draft`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Drafting failed.");
      setState({
        kind: "saved",
        leadId: saved.lead.id,
        drafted: true,
        note: saved.emailKind === "personal" ? `Draft to ${saved.lead.email}` : `Draft to the business inbox, addressed to ${person.name.split(" ")[0]}`,
      });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  /** Apollo enrichment reveals a personal work email (uses Apollo credits). */
  const findEmail = async () => {
    try {
      setState({ kind: "busy", label: "Looking up email…" });
      const response = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "apollo", project, lead: { id: person.apolloId, linkedinUrl: person.linkedinUrl } }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; lead?: { email?: string }; data?: { lead?: { email?: string } } };
      if (!response.ok) throw new Error(body.error || "Email lookup failed.");
      const email = body.lead?.email || body.data?.lead?.email;
      if (!email) throw new Error("Apollo has no email for this person.");
      onEmailFound(person.id, email);
      setState({ kind: "idle" });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const salesNavUrl = buildSalesNavigatorSearchUrl({ keywords: person.name, company: business?.companyName || person.company });
  const busy = state.kind === "busy";

  return (
    <div className={cn("rounded-xl border bg-slate-900/60 p-4", person.worksThere ? "border-slate-800" : "border-slate-800/60 opacity-80")}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
          {initials(person.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-white">{person.name}</p>
            {person.matchedRole && <Badge color="emerald">Decision maker</Badge>}
            {person.possiblyFormer && <Badge color="amber">May have left</Badge>}
            {!person.worksThere && <Badge color="slate">Employer unconfirmed</Badge>}
          </div>
          <p className="text-sm text-slate-300">{person.jobTitle || "Role not listed"}</p>
          <p className="text-xs text-slate-500">
            {person.company || business?.companyName} · {person.source === "apollo" ? "Apollo" : "public LinkedIn profile via Google"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {person.linkedinUrl && (
              <a href={person.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sky-300 hover:underline">
                <UserRound className="h-3.5 w-3.5" /> LinkedIn profile
              </a>
            )}
            <a href={salesNavUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sky-300 hover:underline">
              <Search className="h-3.5 w-3.5" /> Sales Navigator
            </a>
            <span className={cn("flex items-center gap-1", person.email ? "text-emerald-300" : "text-slate-500")}>
              <Mail className="h-3.5 w-3.5" />
              {person.email || (businessEmail ? `No personal email — business inbox ${businessEmail}` : "No email found")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {state.kind === "error" && (
          <span className="mr-auto flex items-center gap-1 text-xs text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {state.message}
          </span>
        )}
        {state.kind === "saved" ? (
          <span className="mr-auto flex items-center gap-1.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> {state.note}
            {state.drafted && (
              <Link href="/review" className="ml-1 text-sky-300 hover:underline">
                Review →
              </Link>
            )}
          </span>
        ) : (
          <>
            {apolloConfigured && person.apolloId && !person.email && (
              <Button variant="ghost" onClick={findEmail} disabled={busy}>
                <Mail className="h-4 w-4" /> Find email (Apollo)
              </Button>
            )}
            <Button onClick={saveAndDraft} disabled={busy} title={sendTo ? `Draft an email to ${sendTo}` : "Save the person as a lead"}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? state.label : sendTo ? "Save & draft email" : "Save lead"}
            </Button>
          </>
        )}
        {state.kind === "saved" && (
          <Link href={`/leads?lead=${state.leadId}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" /> Lead
          </Link>
        )}
      </div>
    </div>
  );
}
