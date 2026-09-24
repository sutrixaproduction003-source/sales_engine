"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, ExternalLink, FileSpreadsheet, Loader2, MailSearch, Sheet } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { refreshLeads } from "@/lib/leadStore";
import type { PipelineLead } from "@/lib/types";

type Msg = { ok: boolean; text: string; link?: string } | null;

/** A person with a full name at a company with a website — enough for a lookup. */
const canLookUp = (lead: PipelineLead) =>
  !lead.email && Boolean(lead.jobTitle) && lead.name.trim().includes(" ") && Boolean(lead.website || lead.linkedinUrl);

/**
 * Leads Hub actions for the leads currently shown: export (Excel / Google
 * Sheets) and bulk email lookup with Apollo.
 */
export function LeadActions({ leads }: { leads: PipelineLead[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [apolloReady, setApolloReady] = useState<boolean | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiCall<{ providers?: { apollo?: { configured?: boolean } } }>("/api/providers/health")
      .then((h) => setApolloReady(Boolean(h.providers?.apollo?.configured)))
      .catch(() => setApolloReady(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const ids = leads.map((l) => l.id);
  const lookUpQueue = leads.filter(canLookUp);

  const exportExcel = async () => {
    setOpen(false);
    setBusy("xlsx");
    setMsg(null);
    try {
      const response = await fetch("/api/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "xlsx", ids }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Export failed.");
      const url = URL.createObjectURL(await response.blob());
      Object.assign(document.createElement("a"), { href: url, download: `leads_${new Date().toISOString().slice(0, 10)}.xlsx` }).click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: `Exported ${ids.length} leads to Excel.` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const exportSheets = async () => {
    setOpen(false);
    setBusy("sheets");
    setMsg(null);
    try {
      const res = await apiCall<{ url: string; exported: number }>("/api/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "sheets", ids }),
      });
      setMsg({ ok: true, text: `Exported ${res.exported} leads to a new tab in your Google Sheet.`, link: res.url });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setMsg({ ok: false, text: /not set up/i.test(text) ? `${text} (Settings → Lead storage → Google Sheets setup)` : text });
    } finally {
      setBusy(null);
    }
  };

  const findEmails = async () => {
    setBusy("emails");
    setMsg(null);
    let found = 0;
    let lastError = "";
    for (let i = 0; i < lookUpQueue.length; i++) {
      setMsg({ ok: true, text: `Looking up emails with Apollo · ${i + 1}/${lookUpQueue.length} · ${found} found` });
      try {
        const res = await apiCall<{ found: boolean }>(`/api/leads/${lookUpQueue[i].id}/find-email`, { method: "POST" });
        if (res.found) found++;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        // Configuration problems affect every lead — stop instead of repeating them.
        if (/not configured|API key|credits|401|403/i.test(lastError)) break;
      }
    }
    await refreshLeads();
    setMsg({
      ok: found > 0 || !lastError,
      text: `Found ${found} of ${lookUpQueue.length} emails.${lastError ? ` Last error: ${lastError}` : ""}`,
    });
    setBusy(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        onClick={findEmails}
        loading={busy === "emails"}
        disabled={busy !== null || !apolloReady || lookUpQueue.length === 0}
        title={
          apolloReady === false
            ? "Add your Apollo.io API key in Settings → API keys to look up work emails"
            : `Look up work emails for ${lookUpQueue.length} people without one (1 Apollo credit each)`
        }
      >
        <MailSearch className="h-4 w-4" /> Find missing emails{lookUpQueue.length ? ` (${lookUpQueue.length})` : ""}
      </Button>

      <div className="relative" ref={menuRef}>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} disabled={busy !== null || ids.length === 0}>
          {busy === "xlsx" || busy === "sheets" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export {ids.length} <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl">
            <button onClick={exportExcel} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Excel (.xlsx)
            </button>
            <button onClick={exportSheets} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
              <Sheet className="h-4 w-4 text-sky-400" /> Google Sheets (new tab)
            </button>
          </div>
        )}
      </div>

      {msg && (
        <span className={cn("basis-full text-sm", msg.ok ? "text-emerald-400" : "text-rose-400")}>
          {msg.text}{" "}
          {msg.link && (
            <a href={msg.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-sky-300 hover:underline">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      )}
      {apolloReady === false && lookUpQueue.length > 0 && !msg && (
        <span className="basis-full text-xs text-slate-500">
          {lookUpQueue.length} people have no email. To look them up, add your Apollo.io API key in Settings → API keys.
        </span>
      )}
    </div>
  );
}
