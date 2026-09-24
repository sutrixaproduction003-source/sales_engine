"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * A banner while leads have nowhere to be saved (deployed without Google
 * Sheets). Everything else keeps working; saving explains the same.
 */
export function StorageNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/storage")
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { connected?: boolean; message?: string | null } | null) =>
        setMessage(info && info.connected === false ? info.message ?? null : null)
      )
      .catch(() => setMessage(null));
  }, []);

  if (!message) return null;
  return (
    <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
