/**
 * Clean 16:9 YouTube thumbnail (no black bars). Mirror of web
 * src/helpers/youtubeThumb.js.
 *
 * The stored `poster_url` is usually oEmbed's `hqdefault` — a 4:3 frame with
 * letterbox bars baked in. Deriving from the video id gives `maxresdefault`
 * (crisp 1280×720, 16:9) which `contentFit="cover"` crops cleanly with no bars.
 * Some videos lack maxres → fall back to `mqdefault` (always present, also
 * bar-free 16:9). Pair these via RailTile's `heroFallbackUri`.
 */
export const ytThumb = (videoId?: string | null, posterFallback: string | null = null): string | null =>
  videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : posterFallback || null;

// Always-available bar-free 16:9 thumbnail — used when maxres 404s.
export const ytThumbFallback = (videoId?: string | null, posterFallback: string | null = null): string | null =>
  videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : posterFallback || null;
