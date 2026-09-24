/**
 * Choosing which of a company's public emails to write to for a person.
 * Company websites list a mix of addresses: role inboxes (info@, sales@),
 * named staff (nitin.vishnoi@) and HR/careers inboxes. Writing "Hi Sandeep"
 * to someone else's personal address — or to recruiting — is worse than not
 * writing, so only the person's own address or a general inbox is used.
 */

const GENERAL_INBOX =
  /^(info|contact|contactus|enquiry|enquiries|inquiry|inquiries|sales|marketing|business|bd|biz|hello|office|admin|mail|support|customercare|care|corporate|reservations?|bookings?|partnerships?)[\d._-]*@/i;

const NOT_FOR_SALES = /^(hr|hrd|careers?|jobs?|recruit(ment|ing)?|talent|resume|cv|hiring|noreply|no-reply|donotreply|privacy|legal|abuse|webmaster|grievance)[\d._-]*@/i;

/** Free-mail providers small businesses often use as their main inbox. */
const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|rediffmail|icloud|proton|protonmail|zoho)\.[a-z.]+$/i;

function siteDomain(website: string): string {
  try {
    return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The address belongs to the business: same domain as its website (either
 * way round for subdomains), or a free-mail inbox. Websites also list
 * partners' addresses (registrars, agencies) — those are not the business.
 */
function belongsToBusiness(email: string, website: string): boolean {
  const site = siteDomain(website);
  if (!site) return true;
  const domain = email.split("@")[1] ?? "";
  return domain === site || domain.endsWith(`.${site}`) || site.endsWith(`.${domain}`) || FREE_MAIL.test(email);
}

const nameParts = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2);

/**
 * The best address to reach `personName` at, from a company's public emails:
 * their own address if listed, else a general inbox, else null.
 */
export function pickContactEmail(emails: string[], personName = "", website = ""): string | null {
  const clean = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && belongsToBusiness(e, website))
    )
  );
  const parts = nameParts(personName);

  const own = clean.find((email) => {
    const local = email.split("@")[0];
    return parts.some((part) => local.includes(part));
  });
  if (own) return own;

  return clean.find((email) => GENERAL_INBOX.test(email) && !NOT_FOR_SALES.test(email)) ?? null;
}
