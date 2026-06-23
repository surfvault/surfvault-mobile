import * as ImagePicker from 'expo-image-picker';

// EXIF stores the fractional part of capture time in a separate tag as a digit
// string — the digits after the decimal point ("5" = .5s, "047" = .047s). We
// read it as 0.<digits> seconds → ms. Returns 0 when absent/unparseable so it
// can always be added unconditionally.
function subsecToMs(raw: unknown): number {
  const digits =
    typeof raw === 'string' || typeof raw === 'number'
      ? String(raw).match(/^\d+/)?.[0]
      : undefined;
  if (!digits) return 0;
  const ms = Math.round(Number(`0.${digits}`) * 1000);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Pulls a photo's real capture time out of an image-picker asset's EXIF.
 *
 * EXIF `DateTimeOriginal` is "YYYY:MM:DD HH:MM:SS" (whole seconds, no timezone),
 * with the fractional part in a paired `SubsecTimeOriginal` tag. We combine them
 * so a burst of frames shot in the same second still gets distinct, ordered
 * times. We only need *relative* ordering within an upload batch, so reading the
 * date components as local time is fine — every photo is read the same way.
 * Returns epoch ms, or null when the asset has no usable capture time
 * (screenshots, edited copies, and messaged/downloaded images often have none).
 *
 * iOS usually exposes tags flat; some payloads nest them under `{Exif}` and some
 * spell it "SubSec…". We check the likely spots in priority order, then bail.
 */
export function parseExifTakenAt(asset: ImagePicker.ImagePickerAsset): number | null {
  // Wrapped so a malformed EXIF payload can never throw into the upload flow —
  // any failure just means "no capture time" and the caller falls back.
  try {
    const exif = asset.exif as Record<string, any> | null | undefined;
    if (!exif) return null;
    const nested = exif['{Exif}'] as Record<string, any> | undefined;

    // Pair each whole-second date tag with its matching sub-second tag.
    const candidates: Array<[unknown, unknown]> = [
      [exif.DateTimeOriginal, exif.SubsecTimeOriginal ?? exif.SubSecTimeOriginal],
      [exif.DateTimeDigitized, exif.SubsecTimeDigitized ?? exif.SubSecTimeDigitized],
      [nested?.DateTimeOriginal, nested?.SubsecTimeOriginal ?? nested?.SubSecTimeOriginal],
      [nested?.DateTimeDigitized, nested?.SubsecTimeDigitized ?? nested?.SubSecTimeDigitized],
      [exif.DateTime, exif.SubsecTime ?? exif.SubSecTime],
    ];

    for (const [rawDate, rawSubsec] of candidates) {
      if (typeof rawDate !== 'string') continue;
      const m = rawDate.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (!m) continue;
      const [, y, mo, d, h, mi, s] = m;
      const sec = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
      if (!Number.isFinite(sec)) continue;
      return sec + subsecToMs(rawSubsec);
    }
    return null;
  } catch {
    return null;
  }
}

export interface OrderableFile {
  name: string;
  takenAt?: number | null;
}

/** Local YYYY-MM-DD key for an epoch ms (local timezone, not UTC). */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface PhotoDateSummary {
  datedCount: number;
  undatedCount: number;
  uniqueDateKeys: string[];
  mixed: boolean;
  singleDateKey: string | null;
  minKey: string | null;
  maxKey: string | null;
}

/**
 * Rolls up capture dates across selected files so the create-session UI can warn
 * on mixed dates and suggest a single shared date. `takenAt` may be a number
 * (EXIF time), null (no EXIF — e.g. screenshots, videos), or undefined.
 */
export function summarizePhotoDates(files: Array<{ takenAt?: number | null }>): PhotoDateSummary {
  let datedCount = 0;
  let undatedCount = 0;
  const keyCounts = new Map<string, number>();
  for (const f of files || []) {
    const ms = f?.takenAt;
    if (typeof ms === 'number' && Number.isFinite(ms)) {
      datedCount += 1;
      const key = localDateKey(ms);
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    } else if (ms === null) {
      undatedCount += 1;
    }
  }
  const keys = [...keyCounts.keys()].sort();
  return {
    datedCount,
    undatedCount,
    uniqueDateKeys: keys,
    mixed: keys.length > 1,
    singleDateKey: keys.length === 1 ? keys[0] : null,
    minKey: keys[0] ?? null,
    maxKey: keys[keys.length - 1] ?? null,
  };
}

/** Render a YYYY-MM-DD key (parsed as LOCAL midnight) as a human label. */
export function formatDateKey(key: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!key) return '';
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString('en-US', opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Local Date at midnight for a YYYY-MM-DD key — for seeding the date picker. */
export function dateKeyToLocalDate(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/**
 * Human range between two YYYY-MM-DD keys (min first). Shows the year on BOTH
 * ends when they differ in year — otherwise "Aug 8 2017 – Mar 30 2018" collapses
 * to "Aug 8 – Mar 30, 2018", which reads backwards because the 2017 is hidden.
 * Same year → year once at the end ("Mar 30 – Aug 8, 2018").
 */
export function formatDateRange(minKey: string | null, maxKey: string | null): string {
  if (!minKey || !maxKey) return formatDateKey(minKey || maxKey);
  if (minKey === maxKey) return formatDateKey(minKey);
  const sameYear = minKey.slice(0, 4) === maxKey.slice(0, 4);
  const minLabel = sameYear ? formatDateKey(minKey, { month: 'short', day: 'numeric' }) : formatDateKey(minKey);
  return `${minLabel} – ${formatDateKey(maxKey)}`;
}

/**
 * Produces a strictly-increasing `lastModified` (epoch ms) per file so the
 * server gallery — which sorts by `photo_taken_at, file_name, id` — reproduces
 * capture order. Mobile previously sent `Date.now()` for every file, collapsing
 * the primary sort key and leaving the gallery to fall back to filename/UUID.
 *
 * Real EXIF time wins when present. Same-second bursts and EXIF-less photos are
 * nudged just past the previous photo, ordered by the same (capture time, then
 * filename) key the gallery uses — so the synthetic nudge never overrides a
 * valid capture time, it only fills ties and gaps.
 *
 * Returns timestamps aligned to the input array's indices.
 */
export function bakeOrderedTimestamps(files: OrderableFile[]): number[] {
  // Wrapped so ordering can never break an upload: any failure falls back to
  // the previous behavior (every file stamped "now"), which still uploads —
  // just unordered. Better a successful upload than a failed one.
  try {
    const order = files.map((f, i) => ({ f, i }));
    order.sort((a, b) => {
      const ta = a.f.takenAt ?? Number.POSITIVE_INFINITY;
      const tb = b.f.takenAt ?? Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      if (a.f.name !== b.f.name) return a.f.name < b.f.name ? -1 : 1;
      return a.i - b.i;
    });

    const out = new Array<number>(files.length);
    const base = Date.now();
    let prev = Number.NEGATIVE_INFINITY;
    for (const { f, i } of order) {
      let t = f.takenAt ?? (prev === Number.NEGATIVE_INFINITY ? base : prev + 1);
      if (t <= prev) t = prev + 1;
      out[i] = t;
      prev = t;
    }
    return out;
  } catch {
    const now = Date.now();
    return files.map(() => now);
  }
}
