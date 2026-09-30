"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { StorageNotice } from "@/components/StorageNotice";

/** Sidebar + top bar around every page except the sign-in page. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the phone menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  if (pathname === "/login") return <main className="p-4">{children}</main>;
  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <StorageNotice />
        <main className="min-w-0 flex-1 overflow-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
