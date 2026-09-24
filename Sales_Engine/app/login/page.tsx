"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Zap } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";

function LoginForm() {
  const next = useSearchParams().get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      // Only same-site paths, never an external redirect.
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      return;
    }
    setError(((await response.json().catch(() => ({}))) as { error?: string }).error || "Sign-in failed.");
    setBusy(false);
  };

  return (
    <Card className="w-full max-w-sm space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white">
          <Zap className="h-4 w-4" />
        </span>
        <h1 className="text-base font-semibold text-white">Sales Engine</h1>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <Button type="submit" loading={busy} disabled={!password} className="w-full justify-center">
          <Lock className="h-4 w-4" /> Sign in
        </Button>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
