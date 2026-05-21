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
