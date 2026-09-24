/**
 * Apollo company search as a lead source for the map — the fallback used when
 * Google Maps scraping (Apify) is unavailable, before OpenStreetMap.
 *
 *   location + search term → Apollo companies (HQ in that location, tagged
 *   with the term) → businesses with website, phone and LinkedIn.
 *
 * Apollo has no map coordinates: companies with an address are geocoded on
 * OpenStreetMap; the rest are pinned near the city centre (marked approximate).
 * Costs 1 Apollo credit per search term (one page of results).
 */

const providerFactory = require('./providerFactory');
const { geocode, geocodePoint } = require('./osmPlaces');

/** Addresses geocoded per search (Nominatim allows one lookup per second). */
const MAX_GEOCODES = 25;

const clean = (value) => String(value ?? '').trim();
const apollo = () => providerFactory.getProvider('apollo');

const apolloAvailable = () => apollo().isConfigured();

/** "hotels" → ["hotels", "hotel"]: Apollo's keyword tags use both forms. */
const keywordTags = (term) => [...new Set([clean(term).toLowerCase(), clean(term).toLowerCase().replace(/s$/, '')])].filter(Boolean);

/** A stable pseudo-random offset (±~800 m) so approximate pins don't stack. */
function jitter(id, [south, west, north, east], center) {
  let hash = 0;
  for (const c of String(id)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const dx = ((hash % 1000) / 1000 - 0.5) * 0.015;
  const dy = (((hash >>> 10) % 1000) / 1000 - 0.5) * 0.015;
  return {
    latitude: Math.min(north, Math.max(south, center.latitude + dy)),
    longitude: Math.min(east, Math.max(west, center.longitude + dx)),
  };
}

function address(org) {
  return (
    clean(org.raw_address) ||
    [org.street_address, org.city, org.state, org.postal_code].map(clean).filter(Boolean).join(', ')
  );
}

/** Map an Apollo organization to the same shape as a Google Maps place. */
function normalizeOrganization(org, { searchTerm, area }) {
  const name = clean(org.name);
  if (!name) return null;
  const phone = clean(org.sanitized_phone || org.phone || org.primary_phone?.sanitized_number || org.primary_phone?.number);
  const website = clean(org.website_url || (org.primary_domain ? `https://${org.primary_domain}` : ''));
  const city = clean(org.city) || area?.city || null;
  const state = clean(org.state) || area?.state || null;
  const industry = clean(org.industry);

  return {
    id: `apollo-${org.id || name}`,
    placeId: org.id ? `apollo:${org.id}` : null,
    companyName: name,
    hotelName: name,
    fullName: '',
    industry: industry ? industry.replace(/\b\w/g, (c) => c.toUpperCase()) : '',
    categories: industry ? [industry] : [],
    searchTerm,
    rawEmails: [],
    phone,
    companyWebsite: website,
    exactAddress: address(org),
    location: [city, state, clean(org.country) || area?.country].filter(Boolean).join(', '),
    city,
    state,
    country: clean(org.country) || area?.country || null,
    latitude: null,
    longitude: null,
    locationApproximate: false,
    googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, city].filter(Boolean).join(' '))}`,
    googleRating: null,
    totalReviewsCount: null,
    instagramLink: null,
    facebookLink: clean(org.facebook_url) || null,
    linkedinUrl: clean(org.linkedin_url),
    imageUrl: clean(org.logo_url) || null,
    source: 'apollo',
  };
}

/** Put places on the map: geocode real addresses, else near the city centre. */
async function locate(places, area) {
  let geocoded = 0;
  for (const place of places) {
    if (place.exactAddress && /\d|road|street|st\b|marg|nagar|lane/i.test(place.exactAddress) && geocoded < MAX_GEOCODES) {
      geocoded++;
      const point = await geocodePoint(`${place.companyName}, ${place.exactAddress}`) || (await geocodePoint(place.exactAddress));
      if (point) {
        Object.assign(place, point);
        continue;
      }
    }
    if (area) Object.assign(place, jitter(place.id, area.bbox, area.center), { locationApproximate: true });
  }
  return places;
}

async function areaOf(location) {
  try {
    return await geocode(location);
  } catch {
    return null;
  }
}

/** Businesses for each search term in a location. */
async function searchApollo({ location, searchTerms, perTerm = 20 }, emailPicker) {
  const area = await areaOf(location);
  const seen = new Set();
  const places = [];
  for (const term of searchTerms) {
    const orgs = await apollo().searchOrganizations({ locations: [location], keywordTags: keywordTags(term), perPage: perTerm });
    for (const org of orgs) {
      const place = normalizeOrganization(org, { searchTerm: term, area });
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      places.push(place);
    }
  }
  return (await locate(places, area)).map(emailPicker);
}

/**
 * Specific businesses ("Lucas TVS Ltd, Chennai"): best name match per query
 * in its location. Returns { places, missing } — queries Apollo didn't find.
 */
async function lookupApollo(queries, emailPicker) {
  const places = [];
  const missing = [];
  for (const query of queries) {
    const comma = query.lastIndexOf(',');
    const name = clean(comma > 0 ? query.slice(0, comma) : query);
    const location = clean(comma > 0 ? query.slice(comma + 1) : '');
    const orgs = await apollo().searchOrganizations({ name, locations: location ? [location] : [], perPage: 1 });
    const area = location ? await areaOf(location) : null;
    const place = orgs.length ? normalizeOrganization(orgs[0], { searchTerm: query, area }) : null;
    if (place) places.push(...(await locate([place], area)));
    else missing.push(query);
  }
  return { places: places.map(emailPicker), missing };
}

module.exports = { apolloAvailable, searchApollo, lookupApollo, normalizeOrganization, keywordTags };
