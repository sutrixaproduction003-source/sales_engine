/**
 * "Find the person" — business name + location → the business and the
 * people who work there. Shared types and browser helpers; the server side
 * lives in app/api/people.
 */

import { apiCall } from "@/lib/api";
import type { ScrapedPlace } from "@/lib/places";

export interface FoundPerson {
  id: string;
  name: string;
  jobTitle: string;
  company: string;
  linkedinUrl: string;
  /** Google result text the person was found in. */
  snippet: string;
  /** Personal email when a provider (Apollo) returned one. */
  email: string;
  source: "linkedin_search" | "apollo";
  apolloId?: string;
  hasEmail?: boolean;
  /** The profile mentions the searched business. */
  worksThere: boolean;
  /** The profile suggests a past role there. */
  possiblyFormer: boolean;
  /** Which of the searched roles the title matches, if any. */
  matchedRole: string | null;
}

export interface PeopleSearchResult {
  jobId: string;
  done: boolean;
  progress?: { business: string; people: string };
  business?: ScrapedPlace | null;
  people?: FoundPerson[];
  apolloConfigured?: boolean;
  warnings?: string[];
}

export interface PeopleSearchParams {
  business: string;
  location: string;
  roles: string[];
}

export function startPeopleSearch(params: PeopleSearchParams): Promise<PeopleSearchResult> {
  return apiCall<PeopleSearchResult>("/api/people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export function pollPeopleSearch(jobId: string, params: PeopleSearchParams): Promise<PeopleSearchResult> {
  const query = new URLSearchParams({ business: params.business, roles: params.roles.join(",") });
  return apiCall<PeopleSearchResult>(`/api/people/search/${encodeURIComponent(jobId)}?${query}`);
}

export interface SavePersonResult {
  lead: { id: number; status: string; email: string | null };
  created: boolean;
  /** "personal" when the person's own email is used, "business" for the business inbox. */
  emailKind: "personal" | "business" | "none";
}

export function savePerson(person: FoundPerson, business: ScrapedPlace | null, project: string): Promise<SavePersonResult> {
  return apiCall<SavePersonResult>("/api/people/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person, business, project }),
  });
}
