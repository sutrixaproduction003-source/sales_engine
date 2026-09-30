"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Button, Card, SectionHeader, cn } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { timeAgo } from "@/lib/format";

type Status = "ok" | "fail" | "not_configured" | "warn";
interface Check {
  id: string;
  name: string;
  status: Status;
  detail: string;
  fix?: string;
}

const LOOK: Record<Status, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  ok: { icon: CheckCircle2, tone: "text-emerald-300", label: "Working" },
  warn: { icon: AlertTriangle, tone: "text-amber-300", label: "Check" },
  fail: { icon: XCircle, tone: "text-rose-300", label: "Failing" },
  not_configured: { icon: CircleDashed, tone: "text-slate-500", label: "Not set up" },
};

/**
 * "Run live checks": tests every connected service with the real, configured
 * credentials — without sending, writing or spending anything.
 */
export function LiveChecks() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runChecks = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiCall<{ checks: Check[]; checkedAt: string }>("/api/system-check");
      setChecks(res.checks);
      setCheckedAt(res.checkedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const failing = checks?.filter((c) => c.status === "fail").length ?? 0;

  return (
    <Card>
      <SectionHeader
        title="Live checks"
        description="Tests each service with your real settings. Nothing is sent, written or charged: Gmail only signs in, Apollo runs a free search, Google Sheets is only read."
        actions={
          <Button onClick={runChecks} loading={running}>
            <PlayCircle className="h-4 w-4" /> {checks ? "Run again" : "Run live checks"}
          </Button>
        }
      />
      {running && !checks && (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking every service… (up to 30 seconds)
        </p>
      )}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {checks && (
        <>
          <p className={cn("mb-3 text-sm", failing ? "text-rose-300" : "text-emerald-300")}>
            {failing ? `${failing} failing` : "Nothing failing"} · checked {timeAgo(checkedAt)}
          </p>
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
            {checks.map((check) => {
              const look = LOOK[check.status];
              return (
                <li key={check.id} className="flex items-start gap-3 px-3 py-2.5">
                  <look.icon className={cn("mt-0.5 h-4 w-4 shrink-0", look.tone)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium text-slate-100">{check.name}</span>
                      <span className={cn("text-xs", look.tone)}>{look.label}</span>
                    </p>
                    <p className="break-words text-[13px] text-slate-400">{check.detail}</p>
                    {check.fix && (check.status === "fail" || check.status === "warn") && (
                      <p className="mt-0.5 text-xs text-slate-500">Fix: {check.fix}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
