/**
 * OpenStreetMap business search — the free, keyless fallback for Google Maps
 * scraping (used when Apify is not configured, out of credit, or failing).
 *
 *   location → Nominatim (geocode) → bounding box
 *   search term → OSM tags (hotels → tourism=hotel …) or a name match
 *   → Overpass API → businesses with coordinates, and address / phone /
 *     website / email where OSM contributors recorded them.
 *
 * Data © OpenStreetMap contributors (ODbL) — attribution is shown in the UI.
 * Nominatim's usage policy: at most 1 request/second, identifying User-Agent,
 * cache results. No ratings/reviews (OSM has none).
 */

const axios = require('axios');
const { createError } = require('../utils/errors');

const USER_AGENT = 'SalesEngine/1.0 (lead discovery; https://github.com/sutrixaproduction003-source/sales_engine)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
/** Keep queries city-sized: larger areas are shrunk around their centre. */
const MAX_SPAN_DEGREES = 1.2;

/** Search term → OSM tags. First matching rule wins; unmatched terms search by name. */
const TAG_RULES = [
  { match: /resort/i, label: 'Resort', tags: [['leisure', 'resort'], ['tourism', 'hotel']] },
  {
    match: /hotel|lodg|stay|inn\b|motel|guest ?house|homestay|hostel|accommodation/i,
    label: 'Hotel',
    tags: [['tourism', 'hotel'], ['tourism', 'guest_house'], ['tourism', 'motel'], ['tourism', 'hostel'], ['tourism', 'apartment']],
  },
  { match: /restaurant|dining|eatery|food/i, label: 'Restaurant', tags: [['amenity', 'restaurant'], ['amenity', 'fast_food']] },
  { match: /cafe|coffee/i, label: 'Cafe', tags: [['amenity', 'cafe']] },
  { match: /\bbar\b|pub|brewery/i, label: 'Bar', tags: [['amenity', 'bar'], ['amenity', 'pub']] },
  { match: /hospital/i, label: 'Hospital', tags: [['amenity', 'hospital']] },
  { match: /clinic|doctor|medical|dental|dentist/i, label: 'Clinic', tags: [['amenity', 'clinic'], ['amenity', 'doctors'], ['amenity', 'dentist']] },
  { match: /pharmac|chemist/i, label: 'Pharmacy', tags: [['amenity', 'pharmacy']] },
  { match: /school|college|universit|institute|academy/i, label: 'Education', tags: [['amenity', 'school'], ['amenity', 'college'], ['amenity', 'university']] },
  { match: /gym|fitness/i, label: 'Gym', tags: [['leisure', 'fitness_centre']] },
  { match: /\bspa\b|salon|beauty|wellness/i, label: 'Spa / salon', tags: [['leisure', 'spa'], ['amenity', 'spa'], ['shop', 'beauty']] },
  { match: /factor|manufactur|plant\b|industr|works/i, label: 'Factory', tags: [['man_made', 'works'], ['industrial', null]] },
  { match: /bank/i, label: 'Bank', tags: [['amenity', 'bank']] },
  { match: /office|agency|consult|property|real estate|company|firm/i, label: 'Office', tags: [['office', null]] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? '').trim();

// ---------- Nominatim (geocoding) — throttled + cached ----------

const geocodeCache = new Map();
let nextNominatimSlot = 0;

/** One Nominatim lookup, at most one per second (their usage policy). */
async function nominatim(query) {
  const wait = nextNominatimSlot - Date.now();
  nextNominatimSlot = Math.max(Date.now(), nextNominatimSlot) + 1100;
  if (wait > 0) await sleep(wait);

  const response = await axios.request({
    method: 'get',
    url: NOMINATIM,
    params: { q: query, format: 'jsonv2', limit: 1, addressdetails: 1 },
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    timeout: 20000,
  });
  return Array.isArray(response.data) ? response.data[0] || null : null;
}

const pointCache = new Map();

/** Coordinates of a street address, or null. Never throws. */
async function geocodePoint(address) {
  const key = clean(address).toLowerCase();
  if (!key) return null;
  if (pointCache.has(key)) return pointCache.get(key);
  let point = null;
  try {
    const hit = await nominatim(address);
    if (hit) point = { latitude: Number(hit.lat), longitude: Number(hit.lon) };
  } catch {
    // Geocoding is best effort.
  }
  pointCache.set(key, point);
  return point;
}

async function geocode(location) {
  const key = clean(location).toLowerCase();
  if (!key) throw createError('Location is required.', 'INVALID_PLACES_INPUT', 400);
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const hit = await nominatim(location);
  if (!hit) throw createError(`Could not find "${location}" on the map.`, 'LOCATION_NOT_FOUND', 404);

  let [south, north, west, east] = hit.boundingbox.map(Number);
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  const half = MAX_SPAN_DEGREES / 2;
  if (north - south > MAX_SPAN_DEGREES) [south, north] = [lat - half, lat + half];
  if (east - west > MAX_SPAN_DEGREES) [west, east] = [lon - half, lon + half];

  const address = hit.address || {};
  const place = {
    bbox: [south, west, north, east],
    center: { latitude: lat, longitude: lon },
    city: address.city || address.town || address.village || address.county || clean(location).split(',')[0],
    state: address.state || null,
    country: address.country_code ? address.country_code.toUpperCase() : null,
  };
  geocodeCache.set(key, place);
  return place;
}

// ---------- Overpass ----------

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
}

/** Overpass QL selectors for a search term within a bounding box. */
function selectorsFor(term, bbox) {
  const box = `(${bbox.join(',')})`;
  const rule = TAG_RULES.find((r) => r.match.test(term));
  if (rule) {
    return {
      label: rule.label,
      selectors: rule.tags.map(([k, v]) => `nwr["${k}"${v ? `="${v}"` : ''}]["name"]${box};`),
    };
  }
  // Anything else ("Taj Exotica", "Lucas TVS"): match business names.
  return { label: null, selectors: [`nwr["name"~"${escapeRegex(term)}",i]${box};`] };
}

async function overpass(query) {
  let lastError;
  for (const endpoint of OVERPASS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await axios.request({
          method: 'post',
          url: endpoint,
          data: `data=${encodeURIComponent(query)}`,
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 45000,
        });
        return Array.isArray(response.data?.elements) ? response.data.elements : [];
      } catch (error) {
        lastError = error;
        if (error.response?.status === 429 || error.response?.status === 504) await sleep(2000 * (attempt + 1));
        else break;
      }
    }
  }
  throw createError(`OpenStreetMap search failed: ${lastError?.message || 'unavailable'}`, 'OSM_FAILED', 502);
}

// ---------- normalization ----------

const firstOf = (...values) => values.map(clean).find(Boolean) || '';

function prettyTag(tags) {
  const value = tags.tourism || tags.amenity || tags.leisure || tags.office || tags.shop || tags.man_made || tags.industrial || '';
  return value ? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '';
}

/** Map an OSM element to the same shape as a Google Maps place. */
function normalizeElement(element, { searchTerm, label, area }) {
  const tags = element.tags || {};
  const name = clean(tags.name || tags['name:en']);
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const city = firstOf(tags['addr:city'], area.city) || null;
  const state = firstOf(tags['addr:state'], area.state) || null;
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const address = [street, tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ');
  const emails = [tags.email, tags['contact:email']].map(clean).filter(Boolean);

  return {
    id: `osm-${element.type}-${element.id}`,
    placeId: `osm:${element.type}/${element.id}`,
    companyName: name,
    hotelName: name,
    fullName: '',
    industry: prettyTag(tags) || label || '',
    categories: [prettyTag(tags)].filter(Boolean),
    searchTerm,
    rawEmails: emails,
    phone: firstOf(tags.phone, tags['contact:phone'], tags['contact:mobile']),
    companyWebsite: firstOf(tags.website, tags['contact:website'], tags.url),
    exactAddress: address,
    location: [city, state, area.country].filter(Boolean).join(', '),
    city,
    state,
    country: area.country,
    latitude,
    longitude,
    googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    googleRating: null,
    totalReviewsCount: null,
    instagramLink: null,
    facebookLink: firstOf(tags['contact:facebook']) || null,
    linkedinUrl: '',
    imageUrl: null,
    source: 'openstreetmap',
  };
}

const CONTACT_TAGS = ['website', 'contact:website', 'phone', 'contact:phone', 'email', 'contact:email'];
const contactScore = (element) => CONTACT_TAGS.filter((tag) => element.tags?.[tag]).length;

// ---------- public API ----------

/**
 * Businesses matching each search term in a location. `emailPicker` turns
 * the raw email list into { email, emails } (same rules as Google results).
 */
async function searchOsm({ location, searchTerms, perTerm = 20 }, emailPicker) {
  const area = await geocode(location);
  const seen = new Set();
  const places = [];

  for (const term of searchTerms) {
    const { label, selectors } = selectorsFor(term, area.bbox);
    const elements = await overpass(`[out:json][timeout:40];(${selectors.join('')});out center tags ${perTerm * 5};`);
    let added = 0;
    // Businesses with contact details first — they make usable leads.
    for (const element of elements.sort((a, b) => contactScore(b) - contactScore(a))) {
      if (added >= perTerm) break;
      const place = normalizeElement(element, { searchTerm: term, label, area });
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      places.push(emailPicker(place));
      added++;
    }
  }
  return places;
}

/**
 * Look up specific businesses ("Lucas TVS Ltd, Chennai"): one best match per
 * query, searched by name in the query's location. `searchTerm` is the query.
 */
async function lookupOsm(queries, emailPicker) {
  const places = [];
  for (const query of queries) {
    const comma = query.lastIndexOf(',');
    const name = clean(comma > 0 ? query.slice(0, comma) : query);
    const location = clean(comma > 0 ? query.slice(comma + 1) : '');
    if (!location) continue;
    try {
      const area = await geocode(location);
      // Distinctive words only ("Lucas TVS Ltd" → "Lucas TVS"): OSM names rarely carry "Ltd".
      const words = name.split(/\s+/).filter((w) => !/^(ltd|limited|pvt|private|inc|llp|co|the|and|&)\.?$/i.test(w));
      const pattern = escapeRegex(words.slice(0, 3).join(' ')) || escapeRegex(name);
      const elements = await overpass(`[out:json][timeout:30];nwr["name"~"${pattern}",i](${area.bbox.join(',')});out center tags 5;`);
      const place = elements.map((el) => normalizeElement(el, { searchTerm: query, label: null, area })).find(Boolean);
      if (place) places.push(emailPicker(place));
    } catch (error) {
      if (error.code !== 'LOCATION_NOT_FOUND') throw error;
    }
  }
  return places;
}

module.exports = { searchOsm, lookupOsm, geocode, geocodePoint, selectorsFor, normalizeElement, TAG_RULES };
