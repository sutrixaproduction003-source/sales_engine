"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Database, ExternalLink, FileSpreadsheet, Sheet, Upload } from "lucide-react";
import { Badge, Button, Card, Input, Label, cn } from "@/components/ui";
import { apiCall } from "@/lib/api";

type Store = "excel" | "sheets";
type Msg = { ok: boolean; text: string } | null;

interface StorageInfo {
  active: Store | "none";
  connected?: boolean;
  excelAvailable?: boolean;
  message?: string | null;
  sheetUrl: string | null;
  serviceAccountEmail: string | null;
}

const saveSettings = (values: Record<string, string>) =>
  apiCall("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });

const storage = <T,>(body: object) =>
  apiCall<T>("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function Choice({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 rounded-xl border p-3 text-left transition",
        active ? "border-sky-500/60 bg-sky-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-white">
        {icon} {title} {active && <CheckCircle2 className="ml-auto h-4 w-4 text-sky-400" />}
      </p>
      <p className="mt-1 text-xs text-slate-400">{text}</p>
    </button>
  );
}

/** Settings → Lead storage: Excel file or Google Sheets. */
export function StorageSettings() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [sheetLink, setSheetLink] = useState("");
  const [keyJson, setKeyJson] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(() => {
    apiCall<StorageInfo>("/api/storage").then((i) => {
      setInfo(i);
      setSheetLink(i.sheetUrl ?? "");
    });
  }, []);
  useEffect(load, [load]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const saveSheetSetup = () =>
    run("save", async () => {
      const values: Record<string, string> = {};
      if (sheetLink.trim()) values.GOOGLE_SHEET_ID = sheetLink.trim();
      if (keyJson.trim()) values.GOOGLE_SERVICE_ACCOUNT = keyJson.trim();
      await saveSettings(values);
      setKeyJson("");
      return "Google Sheets setup saved. Share the sheet with the service account, then Test connection.";
    });

  const test = () =>
    run("test", async () => {
      const res = await storage<{ leads: number }>({ action: "test", store: "sheets" });
      return `Connected — the sheet has ${res.leads} leads.`;
    });

  const switchTo = (store: Store) =>
    run("switch", async () => {
      await saveSettings({ LEAD_STORE: store });
      return store === "sheets" ? "Now saving leads to Google Sheets." : "Now saving leads to the Excel file.";
    });

  const copyExcelToSheets = () =>
    run("copy", async () => {
      try {
        const res = await storage<{ copied: number }>({ action: "copy", from: "excel", to: "sheets" });
        return `Copied ${res.copied} leads from Excel into the Google Sheet.`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/confirm to overwrite/.test(message) || !window.confirm(`${message}\n\nReplace the sheet's leads with the Excel leads?`)) throw err;
        const res = await storage<{ copied: number }>({ action: "copy", from: "excel", to: "sheets", overwrite: true });
        return `Copied ${res.copied} leads from Excel into the Google Sheet.`;
      }
    });

  const onKeyFile = async (file: File | undefined) => {
    if (file) setKeyJson(await file.text());
  };

  const sheetsReady = Boolean(info?.sheetUrl && info?.serviceAccountEmail);

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
          <Database className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">Lead storage</h2>
          <p className="text-sm text-slate-400">Where leads are kept. Switch at any time.</p>
        </div>
      </div>

      {info && info.connected === false && info.message && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{info.message}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {info?.excelAvailable !== false && (
          <Choice
            active={info?.active === "excel"}
            onClick={() => info?.active !== "excel" && switchTo("excel")}
            icon={<FileSpreadsheet className="h-4 w-4 text-emerald-400" />}
            title="Excel file"
            text="data/leads.xlsx on this computer. Simple; only works where the app runs locally."
          />
        )}
        <Choice
          active={info?.active === "sheets"}
          onClick={() => {
            if (info?.active === "sheets") return;
            if (!sheetsReady) {
              setMsg({ ok: false, text: "Set up Google Sheets below first, then choose it." });
              return;
            }
            switchTo("sheets");
          }}
          icon={<Sheet className="h-4 w-4 text-sky-400" />}
          title="Google Sheets"
          text="Shared, editable in the browser, works when deployed. Needs a one-time setup."
        />
      </div>

      <details className="rounded-lg border border-slate-800 bg-slate-900/40 p-3" open={info?.active === "sheets" || !sheetsReady ? undefined : false}>
        <summary className="cursor-pointer text-sm font-medium text-slate-200">Google Sheets setup</summary>
        <div className="mt-3 space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-400">
            <li>
              In{" "}
              <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                Google Cloud Console
              </a>
              , create a project, enable the <strong className="text-slate-300">Google Sheets API</strong>, then create a{" "}
              <strong className="text-slate-300">service account</strong> and download a JSON key.
            </li>
            <li>Create a Google Sheet (any name) and paste its link below.</li>
            <li>Share the sheet with the service account&apos;s email as an Editor (shown after saving the key).</li>
          </ol>

          <div>
            <Label>Sheet link</Label>
            <Input value={sheetLink} onChange={(e) => setSheetLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </div>
          <div>
            <Label>
              Service account key (JSON){" "}
              {info?.serviceAccountEmail && <span className="text-emerald-400">· saved</span>}
            </Label>
            <textarea
              rows={3}
              value={keyJson}
              onChange={(e) => setKeyJson(e.target.value)}
              placeholder={info?.serviceAccountEmail ? "Saved — paste a new key to replace it" : '{"type": "service_account", …}'}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-sky-400 hover:underline">
              <Upload className="h-3 w-3" /> or choose the key file
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => onKeyFile(e.target.files?.[0])} />
            </label>
          </div>

          {info?.serviceAccountEmail && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300">
              Share the sheet with:
              <code className="text-sky-300">{info.serviceAccountEmail}</code>
              <button
                onClick={() => navigator.clipboard?.writeText(info.serviceAccountEmail as string)}
                className="text-slate-400 hover:text-white"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveSheetSetup} loading={busy === "save"} disabled={busy !== null || (!sheetLink.trim() && !keyJson.trim())}>
              Save setup
            </Button>
            <Button variant="secondary" onClick={test} loading={busy === "test"} disabled={busy !== null || !sheetsReady}>
              Test connection
            </Button>
            {info?.excelAvailable !== false && (
            <Button variant="secondary" onClick={copyExcelToSheets} loading={busy === "copy"} disabled={busy !== null || !sheetsReady}>
              Copy my Excel leads into the sheet
            </Button>
            )}
            {info?.sheetUrl && (
              <a href={info.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-center text-xs text-sky-400 hover:underline">
                Open sheet <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </details>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Active:</span>
        {info?.active === "none" ? (
          <Badge color="amber">Not connected</Badge>
        ) : (
          <Badge color={info?.active === "sheets" ? "sky" : "emerald"}>{info?.active === "sheets" ? "Google Sheets" : "Excel file"}</Badge>
        )}
        {msg && <span className={msg.ok ? "text-emerald-400" : "text-rose-400"}>{msg.text}</span>}
      </div>
    </Card>
  );
}
