"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Globe2,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

type Channel = "linkedin" | "facebook" | "instagram" | "makemytrip";
type ScraperChannel = "facebook" | "instagram" | "makemytripReviews";

type ScheduledPost = {
  id: number;
  day: string;
  channel: Channel;
  title: string;
  body: string;
};

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const channelLabels: Record<Channel, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  makemytrip: "MakeMyTrip",
};

const starterPosts: ScheduledPost[] = [
  {
    id: 1,
    day: "MON",
    channel: "linkedin",
    title: "Week 1 · Pain Point",
    body: "Turn a recurring guest-service problem into a practical product story for hospitality operators.",
  },
  {
    id: 2,
    day: "TUE",
    channel: "facebook",
    title: "Week 1 · Social Proof",
    body: "Share a customer outcome and invite operators to compare notes on the workflow behind it.",
  },
  {
    id: 3,
    day: "WED",
    channel: "instagram",
    title: "Week 1 · Feature Spotlight",
    body: "Show one product workflow in a short, visual post with a clear next step.",
  },
];

function channelColor(channel: Channel) {
  if (channel === "linkedin") return "sky";
  if (channel === "facebook") return "indigo";
  if (channel === "instagram") return "orange";
  return "teal";
}

function sourceField(channel: ScraperChannel) {
  if (channel === "instagram") return "username";
  if (channel === "facebook") return "pageUrl";
  return "hotelUrl";
}

export default function SocialStudioPage() {
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [scraperChannel, setScraperChannel] = useState<ScraperChannel>("facebook");
  const [product, setProduct] = useState("Sales Engine");
  const [valueProp, setValueProp] = useState("Turn public business signals into timely, relevant outreach.");
  const [source, setSource] = useState("");
  const [comment, setComment] = useState("");
  const [context, setContext] = useState("");
  const [posts, setPosts] = useState(starterPosts);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const postsByDay = useMemo(
    () => days.reduce<Record<string, ScheduledPost[]>>((all, day) => {
      all[day] = posts.filter((post) => post.day === day);
      return all;
    }, {}),
    [posts]
  );

  const fetchContext = async () => {
    if (!source.trim()) {
      setMessage("Add a profile, page, or hotel URL first.");
      return;
    }
    setFetching(true);
    setMessage(null);
    try {
      const response = await fetch("/api/scrapers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: scraperChannel,
          [sourceField(scraperChannel)]: source.trim(),
          maxPosts: 10,
          maxReviews: 10,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || data?.error || "Scraper request failed.");
      const items = Array.isArray(data.items) ? data.items : [];
      const summary = items.slice(0, 3).map((item: Record<string, unknown>) => JSON.stringify(item)).join("\n");
      setContext(summary || "The scraper returned no public records.");
      setMessage(`Fetched ${items.length} public record${items.length === 1 ? "" : "s"} from ${channelLabels[scraperChannel === "makemytripReviews" ? "makemytrip" : scraperChannel]}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not fetch channel context.");
    } finally {
      setFetching(false);
    }
  };

  const draftComment = () => {
    const signal = context.replace(/\s+/g, " ").trim().slice(0, 180);
    setComment(
      signal
        ? `${product} helps teams act on signals like these without losing the human follow-up: ${signal}`
        : `${product} helps teams turn public business signals into timely, relevant conversations. ${valueProp}`
    );
  };

  const queuePost = () => {
    if (!comment.trim()) {
      setMessage("Draft a product comment before queueing the post.");
      return;
    }
    const day = days.find((candidate) => !postsByDay[candidate].length) || "THU";
    setPosts((current) => [...current, { id: Date.now(), day, channel, title: "New product comment", body: comment.trim() }]);
    setMessage(`Queued for ${day}.`);
    setComment("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <Share2 className="h-3.5 w-3.5 text-cyan-400" /> Social publishing engine
          </div>
          <h1 className="text-2xl font-semibold text-white">Social Studio</h1>
          <p className="mt-1 text-sm text-slate-400">Plan channel content, pull public context, and turn product signals into publish-ready comments.</p>
        </div>
        <Badge color="emerald"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" /> Engine ready</Badge>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <CalendarDays className="h-4 w-4 text-cyan-400" />
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Weekly publishing map</p>
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-7">
          {days.map((day) => (
            <div key={day} className="min-h-24 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] font-semibold tracking-widest text-slate-500">{day}</p>
              <div className="mt-3 space-y-2">
                {postsByDay[day].map((post) => (
                  <div key={post.id} className="rounded-md border border-slate-800 bg-slate-900 p-2">
                    <Badge color={channelColor(post.channel)}>{channelLabels[post.channel]}</Badge>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-300">{post.body}</p>
                  </div>
                ))}
                {!postsByDay[day].length && <p className="text-[11px] text-slate-600">Open slot</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400"><Sparkles className="h-5 w-5" /></div>
            <div><h2 className="font-medium text-white">Product comment composer</h2><p className="text-sm text-slate-400">Build one useful, channel-aware comment at a time.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Publish channel</Label><Select value={channel} onChange={(event) => setChannel(event.target.value as Channel)} className="w-full"><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="makemytrip">MakeMyTrip</option></Select></div>
            <div><Label>Product</Label><Input value={product} onChange={(event) => setProduct(event.target.value)} /></div>
          </div>
          <div><Label>Core value proposition</Label><Input value={valueProp} onChange={(event) => setValueProp(event.target.value)} /></div>
          <div><Label>Product comment</Label><Textarea rows={5} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a useful comment that connects the product to a real operator problem..." /></div>
          <div className="flex flex-wrap gap-2"><Button onClick={draftComment}><MessageCircle className="h-4 w-4" /> Draft comment</Button><Button variant="success" onClick={queuePost}><Send className="h-4 w-4" /> Queue post</Button></div>
          {message && <p className="text-sm text-slate-400">{message}</p>}
        </Card>

        <Card className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400"><RefreshCw className="h-5 w-5" /></div>
            <div><h2 className="font-medium text-white">Live channel context</h2><p className="text-sm text-slate-400">Use your existing social and travel scrapers to ground the comment.</p></div>
          </div>
          <div><Label>Source</Label><Select value={scraperChannel} onChange={(event) => { setScraperChannel(event.target.value as ScraperChannel); setSource(""); }} className="w-full"><option value="facebook">Facebook page</option><option value="instagram">Instagram profile</option><option value="makemytripReviews">MakeMyTrip reviews</option></Select></div>
          <div><Label>{scraperChannel === "instagram" ? "Username" : scraperChannel === "facebook" ? "Page URL" : "Hotel URL"}</Label><Input value={source} onChange={(event) => setSource(event.target.value)} placeholder={scraperChannel === "instagram" ? "hotel_account" : "https://..."} /></div>
          <Button variant="secondary" loading={fetching} onClick={fetchContext}><RefreshCw className="h-4 w-4" /> Fetch public context</Button>
          <div className="min-h-32 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-400">
            {context || "Fetched channel context will appear here. It is used only to ground the product comment."}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Context stays behind the Sales Engine API.</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <Globe2 className="h-4 w-4 text-indigo-400" /> Facebook
        <Share2 className="h-4 w-4 text-orange-400" /> Instagram
        <CalendarDays className="h-4 w-4 text-teal-400" /> MakeMyTrip context
      </div>
    </div>
  );
}
