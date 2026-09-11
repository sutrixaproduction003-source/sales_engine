"use client";

import { Suspense } from "react";
import { LeadsHub } from "@/components/leads/hub";

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsHub />
    </Suspense>
  );
}