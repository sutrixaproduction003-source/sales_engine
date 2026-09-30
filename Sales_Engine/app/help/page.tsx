"use client";

import Link from "next/link";
import { ArrowRight, ClipboardCheck, Globe, HelpCircle, LayoutDashboard, Send, Settings, UploadCloud, Users } from "lucide-react";
import { Card, PageHeader, SectionHeader } from "@/components/ui";

const STEPS = [
  {
    icon: Settings,
    title: "Connect your accounts",
    text: "Add Gmail (to send), your sender profile, and optionally Apollo, HubSpot and an AI key. Leads are stored in Google Sheets when deployed.",
    href: "/settings",
    cta: "Settings",
  },
  {
    icon: LayoutDashboard,
    title: "Find businesses on the map",
    text: "Enter a location and pick a project. Matching businesses are found (Google Maps, then Apollo or OpenStreetMap if needed) and saved.",
    href: "/",
    cta: "Overview",
  },
  {
    icon: UploadCloud,
    title: "Or import people from Sales Navigator",
    text: "Copy a lead list page, paste it, and import. Apollo can add work emails and mobile numbers.",
    href: "/import",
    cta: "Sales Nav Import",
  },
  {
    icon: Globe,
    title: "Find the person at a business",
    text: "Discovery looks up decision-makers at a specific business so emails go to someone by name.",
    href: "/discovery",
    cta: "Discovery",
  },
  {
    icon: ClipboardCheck,
    title: "Review every draft",
    text: "Emails are drafted automatically. Edit, approve or reject each one; nothing is sent without your approval.",
    href: "/review",
    cta: "Review Queue",
  },
  {
    icon: Send,
    title: "Track what was sent",
    text: "Approved emails go out through your Gmail and appear in Dispatch.",
    href: "/dispatch",
    cta: "Dispatch",
  },
];

const TIPS = [
  ["Search anywhere", "Press / to jump to the search box and find a lead by name, company, email or domain."],
  ["Nothing sends by itself", "Drafts wait in the Review Queue until you click Approve & send."],
  ["Apollo credits", "Revealing a person costs 1 credit; a mobile number up to 8 more. Searching is free."],
  ["Missing leads in the sheet?", "The app writes to the tab called Leads. Use File → Version history in Google Sheets to restore older data."],
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<HelpCircle className="h-[18px] w-[18px]" />}
        title="Help"
        description="How Sales Engine works, from finding leads to sending approved emails."
      />

      <Card>
        <SectionHeader title="The workflow" description="Each step links to the page where it happens." />
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2.5">
                <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-semibold text-indigo-300">
                  {i + 1}
                </span>
                <step.icon className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-3 text-sm font-semibold text-white">{step.title}</p>
              <p className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-400">{step.text}</p>
              <Link
                href={step.href}
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-indigo-300 hover:text-indigo-200"
              >
                {step.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <SectionHeader title="Good to know" />
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {TIPS.map(([title, text]) => (
            <div key={title}>
              <dt className="text-sm font-medium text-slate-200">{title}</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{text}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Users className="h-3.5 w-3.5" /> Leads live in your Leads Hub; open any row to see its details and draft.
      </p>
    </div>
  );
}
