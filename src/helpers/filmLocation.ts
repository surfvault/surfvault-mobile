/**
 * Region-level place label for films. Mirror of web src/helpers/filmLocation.js.
 *
 * US spots show the STATE (region) — locally recognizable — while everywhere
 * else shows the COUNTRY, since sub-national regions (e.g. "Rivas", Nicaragua)
 * are obscure to most viewers. Title-cases the result: the DB stores regions
 * UPPER-case and country names lower-case.
 */
import type { FilmRegion } from '../store/apis/endpoints/films';

const titleCase = (s?: string | null): string =>
  (s || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const filmPlaceLabel = (r?: FilmRegion | null): string => {
  if (!r) return '';
  const cc = (r.country_code || '').toUpperCase();
  return cc === 'US' ? titleCase(r.region) || titleCase(r.country) : titleCase(r.country) || titleCase(r.region);
};

/**
 * A film can be tagged in several regions/countries. On a location-anchored
 * surface (nearby rail, break page) pick the region relevant to the VIEWER's
 * context — exact region in the same country, else same country — so a film that
 * spans Florida + Nicaragua reads "Nicaragua" when viewed from a Nicaraguan
 * break. Falls back to the first region with no context.
 */
export const filmRegionForContext = (
  regions?: FilmRegion[] | null,
  ctx?: { countryCode?: string | null; region?: string | null }
): FilmRegion | null => {
  if (!regions?.length) return null;
  const cc = (ctx?.countryCode || '').toUpperCase();
  const region = (ctx?.region || '').toUpperCase();
  if (cc) {
    const exact = regions.find(
      (r) => (r.country_code || '').toUpperCase() === cc && (r.region || '').toUpperCase() === region
    );
    if (exact) return exact;
    const sameCountry = regions.find((r) => (r.country_code || '').toUpperCase() === cc);
    if (sameCountry) return sameCountry;
  }
  return regions[0];
};
