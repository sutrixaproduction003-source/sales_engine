"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

/** Sidebar + top bar around every page except the sign-in page. */
export function AppShell({ children }: { children: React.ReactNode }) {
  if (usePathname() === "/login") return <main className="p-4">{children}</main>;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
