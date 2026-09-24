"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Globe,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, Input, cn } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { fetchLeads } from "@/lib/leadService";
import type { PipelineLead } from "@/lib/types";

/**
 * Human Review Queue — the gate between AI drafting and sending. Drafts
 * (status PERSONALIZED) are only emailed when a reviewer clicks
 * "Approve & send"; rejected drafts are never sent.
 */

type MailStatus = { configured: boolean; user: string | null };

interface Draft {
  subject: string;
  body: string;
}

/** "https://www.x.com/a?utm_source=…" → "x.com": long tracking links don't fit on a phone. */
function siteLabel(website: string) {
  try {
    return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  }
}

function ReviewCard({
  lead,
  canSend,
  onDone,
}: {
  lead: PipelineLead;
  canSend: boolean;
  onDone: (lead: PipelineLead, outcome: "sent" | "rejected") => void;
}) {
  const [draft, setDraft] = useState<Draft>({ subject: lead.emailSubject ?? "", body: lead.emailBody ?? "" });
  const [busy, setBusy] = useState<"send" | "reject" | "redraft" | "save" | null>(null);
  const [error, setError] = useState<string | null>(lead.sendError ?? null);
  const [saved, setSaved] = useState(true);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  const run = async (action: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const send = () =>
    run("send", async () => {
      const res = await apiCall<{ lead: PipelineLead }>(`/api/leads/${lead.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      onDone(res.lead, "sent");
    });

  const reject = () =>
    run("reject", async () => {
      const res = await apiCall<{ lead: PipelineLead }>(`/api/leads/${lead.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject" }),
      });
      onDone(res.lead, "rejected");
    });

  const save = () =>
    run("save", async () => {
      await apiCall(`/api/leads/${lead.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setSaved(true);
    });

  const redraft = () =>
    run("redraft", async () => {
      const res = await apiCall<{ lead: PipelineLead; warning: string | null }>(`/api/leads/${lead.id}/draft?force=1`, {
        method: "POST",
      });
      setDraft({ subject: res.lead.emailSubject ?? "", body: res.lead.emailBody ?? "" });
      setSaved(true);
      if (res.warning) setError(res.warning);
    });

  const ready = draft.subject.trim() && draft.body.trim();

  return (
    <Card className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full">
          <p className="font-medium text-white">{lead.company || lead.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="flex min-w-0 max-w-full items-center gap-1">
              <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" /> <span className="truncate">{lead.email}</span>
            </span>
            {lead.website && (
              <a
                href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 max-w-full items-center gap-1 hover:text-sky-300"
                title={lead.website}
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-slate-500" /> <span className="truncate">{siteLabel(lead.website)}</span>
              </a>
            )}
            {typeof lead.googleRating === "number" && (
              <span className="flex items-center gap-1 text-amber-300">
                <Star className="h-3 w-3 fill-current" /> {lead.googleRating.toFixed(1)}
              </span>
            )}
            {lead.city && <span>{lead.city}</span>}
          </p>
        </div>
        <Badge color={lead.draftMethod === "ai" ? "violet" : "slate"}>
          <Sparkles className="mr-1 h-3 w-3" /> {lead.draftMethod === "ai" ? "AI draft" : "Template draft"}
        </Badge>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Subject</label>
          <Input value={draft.subject} onChange={(e) => edit({ subject: e.target.value })} disabled={busy !== null} />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</label>
          <textarea
            value={draft.body}
            onChange={(e) => edit({ body: e.target.value })}
            disabled={busy !== null}
            rows={10}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-slate-100 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
          />
        </div>
        {lead.scrapedContext && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-300">Website text the draft was based on</summary>
            <p className="mt-1 line-clamp-6">{lead.scrapedContext}</p>
          </details>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={redraft} loading={busy === "redraft"} disabled={busy !== null} title="Write a new draft">
            <RefreshCw className="h-4 w-4" /> Redraft
          </Button>
          {!saved && (
            <Button variant="ghost" onClick={save} loading={busy === "save"} disabled={busy !== null || !ready}>
              Save edits
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={reject} loading={busy === "reject"} disabled={busy !== null}>
            <XCircle className="h-4 w-4" /> Reject
          </Button>
          <Button
            variant="success"
            onClick={send}
            loading={busy === "send"}
            disabled={busy !== null || !ready || !canSend}
            title={canSend ? `Send to ${lead.email} now` : "Connect Gmail in Settings to send"}
          >
            <Send className="h-4 w-4" /> Approve &amp; send
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ReviewQueuePageContent() {
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchLeads()
      .then((data) => setLeads((data.leads ?? []).filter((l) => l.status === "PERSONALIZED" && l.email)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load the review queue."));
    apiCall<MailStatus>("/api/mail")
      .then(setMail)
      .catch(() => setMail({ configured: false, user: null }));
  }, []);

  useEffect(load, [load]);

  const onDone = (lead: PipelineLead, outcome: "sent" | "rejected") => {
    setLeads((current) => current?.filter((l) => l.id !== lead.id) ?? null);
    setNotice(outcome === "sent" ? `Sent to ${lead.email}.` : `Rejected — ${lead.company || lead.name} will not be emailed.`);
  };

  const pendingCount = leads?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Human Review Queue</h1>
            <p className="text-sm text-slate-400">
              {pendingCount > 0 ? (
                <>
                  <span className="font-semibold text-orange-400">{pendingCount} drafts</span> waiting — nothing is sent
                  until you approve it.
                </>
              ) : (
                "Queue clear — every draft has been reviewed."
              )}
            </p>
          </div>
        </div>
        <div className="text-xs text-slate-500">Scraped → Drafted → Reviewed by you → Sent via Gmail</div>
      </div>

      {mail && !mail.configured && (
        <Card className="flex flex-wrap items-center gap-3 border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <p className="flex-1 text-sm text-amber-200">Gmail is not connected, so approved drafts can&apos;t be sent yet.</p>
          <Link href="/settings" className="text-sm font-medium text-sky-400 hover:underline">
            Connect Gmail →
          </Link>
        </Card>
      )}
      {mail?.configured && <p className="text-xs text-slate-500">Sending from {mail.user}</p>}

      {notice && (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </p>
      )}

      {error ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-400" />
          <p className="text-sm font-medium text-slate-300">Unable to load the review queue.</p>
          <p className="max-w-sm text-xs text-slate-500">{error}</p>
          <Button variant="secondary" className="mt-2" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : leads === null ? (
        <Card>
          <p className="text-sm text-slate-400">Loading review queue...</p>
        </Card>
      ) : leads.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm font-medium text-slate-300">Nothing to review right now</p>
          <p className="max-w-sm text-xs text-slate-500">
            Find leads on the Overview map — drafts for businesses with an email appear here automatically.
          </p>
        </Card>
      ) : (
        <div className={cn("grid grid-cols-1 gap-4", leads.length > 1 && "xl:grid-cols-2")}>
          {leads.map((lead) => (
            <ReviewCard key={lead.id} lead={lead} canSend={Boolean(mail?.configured)} onDone={onDone} />
          ))}
        </div>
      )}
    </div>
  );
}
