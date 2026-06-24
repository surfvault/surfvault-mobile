import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Alert, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTrackedPush } from '../../context/NavigationContext';
import UserAvatar from '../UserAvatar';
import AutoplayVideo from '../AutoplayVideo';
import { boardPhotoDisplay } from '../../helpers/mediaUrl';
import { ytThumb, ytThumbFallback } from '../../helpers/youtubeThumb';
import { filmPlaceLabel, filmRegionForContext } from '../../helpers/filmLocation';
import { formatSessionDate } from '../../helpers/dateTime';
import { pickThumbnailPhoto } from '../ShaperBoardsGrid';
import { useRecordAdImpressionMutation } from '../../store';
import { buildAdClickUrl, currentDevice } from '../../helpers/adTracking';
import type { BreakDateGroup } from '../BreakDateCard';
import type { BoardroomShaper, Film } from '../../store';

/**
 * Compact horizontal-rail tiles for the SurfVault (nearby) landing — mirrors
 * web's `home/NearbyCard.jsx` shell: a portrait 4:5 media tile with ALL chrome
 * overlaid (no footer below). Top corners carry small chips (date / count /
 * "Sponsored"); a bottom gradient scrim carries avatar + title + subtitle. This
 * keeps each tile to just the image height — no extra vertical space.
 */

export const RAIL_TILE_WIDTH = 168;
const tileHeight = (w: number) => Math.round((w * 5) / 4); // 4:5 portrait

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(dateStr).split('T')[0]);
  if (!m) return '';
  const label = MONTHS_SHORT[+m[2] - 1];
  if (!label) return '';
  const cy = new Date().getFullYear();
  return +m[1] === cy ? `${label} ${+m[3]}` : `${label} ${+m[3]}, ${m[1]}`;
};

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
};

// Bottom darkening gradient so the white footer text stays legible on any image.
function BottomScrim({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={[styles.scrim, { height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="railScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.55" stopColor="#000000" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.92} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#railScrim)" />
      </Svg>
    </View>
  );
}

// Shared tile shell — everything overlaid on the 4:5 hero. When `stackCount`
// > 1 it peeks 1–2 muted card edges behind the tile (a "there's more here"
// depth cue for multi-session day groups — mirrors web's NearbySessionCard).
function RailTile({
  onPress,
  heroUri,
  heroFallbackUri,
  fallbackIcon,
  fallbackColor,
  topLeft,
  topRight,
  centerOverlay,
  avatar,
  title,
  subtitle,
  stackCount = 0,
  width = RAIL_TILE_WIDTH,
  style,
  videoUri,
  active = false,
}: {
  onPress: () => void;
  heroUri?: string | null;
  // Swapped in when `heroUri` errors (e.g. YouTube maxres 404 → mqdefault).
  heroFallbackUri?: string | null;
  fallbackIcon: React.ReactNode;
  fallbackColor: string;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  // Absolutely-centered, non-interactive overlay (e.g. a red play badge).
  centerOverlay?: React.ReactNode;
  avatar?: React.ReactNode;
  // Optional: omitted entirely (no empty line) when falsy — e.g. break-page
  // session tiles whose session has no name show just the subtitle.
  title?: string;
  subtitle?: string | null;
  stackCount?: number;
  width?: number;
  style?: any;
  // When the tile holds a clip and is on-screen, autoplay it over the poster.
  // Player is mounted ONLY while active so a grid never holds many live players.
  videoUri?: string | null;
  active?: boolean;
}) {
  const isDark = useColorScheme() === 'dark';
  const h = tileHeight(width);
  const scrimH = Math.round(h * 0.55);
  // Swap to the fallback hero once the primary 404s (maxres → mqdefault).
  const [heroErrored, setHeroErrored] = useState(false);
  const resolvedHero = heroErrored && heroFallbackUri ? heroFallbackUri : heroUri;
  return (
    <Pressable onPress={onPress} style={[styles.tile, { width }, stackCount > 1 && styles.tileStacked, style]}>
      {/* Depth peeks — far edge first (only for 3+), then the near edge. */}
      {stackCount > 2 && (
        <View
          pointerEvents="none"
          style={[styles.peek, styles.peekFar, { width, height: h, backgroundColor: isDark ? '#1f2937' : '#e2e8f0' }]}
        />
      )}
      {stackCount > 1 && (
        <View
          pointerEvents="none"
          style={[styles.peek, styles.peekNear, { width, height: h, backgroundColor: isDark ? '#374151' : '#cbd5e1' }]}
        />
      )}
      <View style={[styles.hero, { width, height: h, backgroundColor: fallbackColor }]}>
        {resolvedHero ? (
          <Image
            source={{ uri: resolvedHero }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            onError={() => setHeroErrored(true)}
          />
        ) : (
          <View style={styles.heroFallback}>{fallbackIcon}</View>
        )}

        {/* Autoplaying clip over the poster — mounted only while on-screen. */}
        {videoUri && active ? (
          <AutoplayVideo uri={videoUri} poster={resolvedHero ?? undefined} active style={StyleSheet.absoluteFill} />
        ) : null}

        {topLeft ? <View style={styles.topLeft}>{topLeft}</View> : null}
        {topRight ? <View style={styles.topRight}>{topRight}</View> : null}
        {centerOverlay ? (
          <View pointerEvents="none" style={styles.centerOverlay}>
            {centerOverlay}
          </View>
        ) : null}

        <BottomScrim width={width} height={scrimH} />
        <View style={styles.footer}>
          {avatar ? <View style={{ marginRight: 7 }}>{avatar}</View> : null}
          <View style={{ flex: 1 }}>
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// Small frosted chip used in the top corners (date / count / Sponsored).
function Chip({ children }: { children: React.ReactNode }) {
  return <View style={styles.chip}>{children}</View>;
}

// ─────────────────────────── Nearby Sessions ───────────────────────────
export function SessionTile({
  group,
  width,
  style,
  noStack = false,
  hideBreakName = false,
  onNavigate,
  isViewable = false,
}: {
  group: BreakDateGroup;
  width?: number;
  style?: any;
  // Grid mode disables the depth-peek stack (it would overflow the cell).
  noStack?: boolean;
  // Drop the break-name title from the footer — used when the tile already
  // sits under a break-named header (e.g. Favorites rails), so the footer shows
  // just the photographer avatar + @handle subtitle.
  hideBreakName?: boolean;
  // When set (e.g. inside the Explore overlay), used instead of trackedPush so
  // the caller can close the overlay before navigating.
  onNavigate?: (path: string) => void;
  // On-screen → autoplay the lead session's clip (when it's a video).
  isViewable?: boolean;
}) {
  const trackedPush = useTrackedPush();
  const sessions = group?.sessions ?? [];
  const lead = useMemo(() => sessions.find((s) => s.thumbnail) || sessions[0], [sessions]);

  // Distinct photographers in session order (lead floated to the front) —
  // drives the avatar stack + the "@lead +N more" subtitle.
  const photographers = useMemo(() => {
    const seen = new Set<string>();
    const out: { handle: string; picture?: string; name?: string }[] = [];
    for (const s of sessions) {
      const h = (s as any).user_handle as string | undefined;
      if (h && !seen.has(h)) {
        seen.add(h);
        out.push({ handle: h, picture: (s as any).user_picture, name: (s as any).user_name });
      }
    }
    return out;
  }, [sessions]);

  // Hidden-location groups have no break to open — show a soft area label
  // (US → state/region, elsewhere → country) and tap through to the session.
  const showBreakInfo = !group?.hide_location && !!(group?.surf_break_name || group?.surf_break_identifier);
  const titleCaseLabel = (s?: string | null) =>
    s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  const hiddenLabel =
    group?.surf_break_country === 'US'
      ? titleCaseLabel(group?.surf_break_region)
      : titleCaseLabel(group?.surf_break_country_name);
  const breakName = showBreakInfo
    ? group?.surf_break_name || group?.surf_break_identifier?.replace(/_/g, ' ') || 'Surf break'
    : hiddenLabel || 'Hidden location';

  const goToBreakOnDate = () => {
    if (!group?.surf_break_country || !group?.surf_break_identifier) return;
    const region = group.surf_break_region || '0';
    const date = group.session_date ? `?date=${String(group.session_date).split('T')[0]}` : '';
    const path = `/break/${group.surf_break_country}/${region}/${group.surf_break_identifier}${date}`;
    (onNavigate ?? trackedPush)(path as any);
  };
  const goToSession = () => {
    const sid = (lead as any)?.session_id;
    if (sid) (onNavigate ?? trackedPush)(`/session/${sid}` as any);
  };
  // Single session → open it directly. Multi-session day → open the break on
  // that date (the full day's feed). Hidden-location days have no break to
  // open, so always fall back to the lead session.
  const onPress = sessions.length > 1 && showBreakInfo ? goToBreakOnDate : goToSession;

  if (!lead) return null;

  const lead0 = lead as any;
  const sessionCount = sessions.length;
  const isMultiSession = sessionCount > 1;
  const ordered = lead0.user_handle
    ? [
        { handle: lead0.user_handle, picture: lead0.user_picture, name: lead0.user_name },
        ...photographers.filter((p) => p.handle !== lead0.user_handle),
      ]
    : photographers;
  const isMultiPhotographer = ordered.length > 1;
  const others = ordered.length - 1;
  const subtitle = !lead0.user_handle
    ? `${sessionCount} session${sessionCount === 1 ? '' : 's'}`
    : others === 0
    ? `@${lead0.user_handle}`
    : `@${lead0.user_handle} +${others} more`;

  const vids = lead0.video_count ?? 0;
  const photos = Math.max(0, (lead0.photo_count ?? 0) - vids);
  const videoUri =
    lead0.thumbnail_media_type === 'video' && lead0.thumbnail_preview_video_url
      ? lead0.thumbnail_preview_video_url
      : null;

  // Multi-session → a stack pill (session count). Single → the lead's media count.
  const topRight = isMultiSession ? (
    <Chip>
      <Ionicons name="albums-outline" size={10} color="#fff" />
      <Text style={styles.chipText}>{sessionCount}</Text>
    </Chip>
  ) : photos > 0 || vids > 0 ? (
    <Chip>
      {photos > 0 && (
        <>
          <Ionicons name="images-outline" size={10} color="#fff" />
          <Text style={styles.chipText}>{formatCount(photos)}</Text>
        </>
      )}
      {photos > 0 && vids > 0 && <Text style={styles.chipText}> </Text>}
      {vids > 0 && (
        <>
          <Ionicons name="videocam-outline" size={10} color="#fff" />
          <Text style={styles.chipText}>{formatCount(vids)}</Text>
        </>
      )}
    </Chip>
  ) : null;

  // Multi-photographer → lead avatar + a single "+N" pill (the count is also
  // spelled out in the subtitle). Kept to two elements so the break-name title
  // keeps its width on the narrow rail tile instead of being squeezed by a
  // 3-deep stack. Single → one avatar with its type badge.
  const avatar = isMultiPhotographer ? (
    <View style={styles.avatarStack}>
      {/* +N sits BEHIND the lead avatar (avatar on top via zIndex) so it peeks
          out to the right rather than covering the avatar. */}
      <View style={[styles.avatarRing, { zIndex: 2 }]}>
        <UserAvatar uri={ordered[0].picture} name={ordered[0].name ?? ordered[0].handle} size={26} />
      </View>
      <View style={[styles.avatarMore, { marginLeft: -10, zIndex: 1 }]}>
        <Text style={styles.avatarMoreText}>+{ordered.length - 1}</Text>
      </View>
    </View>
  ) : (
    // No type badge — the tile is already a session, so the photographer's
    // camera badge is redundant and crowds the small avatar.
    <UserAvatar uri={lead0.user_picture} name={lead0.user_name ?? lead0.user_handle} size={26} />
  );

  return (
    <RailTile
      onPress={onPress}
      heroUri={lead0.thumbnail}
      fallbackColor="#0c4a6e"
      fallbackIcon={<Ionicons name="images-outline" size={28} color="#38bdf8" />}
      topLeft={group.session_date ? <Text style={styles.dateText}>{formatDate(group.session_date)}</Text> : null}
      topRight={topRight}
      avatar={avatar}
      title={hideBreakName ? undefined : breakName}
      subtitle={subtitle}
      stackCount={!noStack && isMultiSession ? sessionCount : 0}
      width={width}
      style={style}
      videoUri={videoUri}
      active={isViewable}
    />
  );
}

// ──────────────── Break page: recent-session day tile ────────────────
// Same-day sessions at this break are stacked into ONE tile (like home's
// SessionTile), so a busy day reads as a single card with a depth-peek + an
// albums count rather than N near-identical tiles. Title is the lead session's
// NAME (blank when unset — the date is the top-left chip). Multi-session day →
// tap opens that date in feed mode (`onOpenDate`); single session → opens it.
export function BreakSessionTile({
  sessions,
  width,
  style,
  onOpenDate,
  isViewable = false,
}: {
  sessions: any[];
  width?: number;
  style?: any;
  onOpenDate?: (sessionDate: string) => void;
  isViewable?: boolean;
}) {
  const trackedPush = useTrackedPush();
  const lead = useMemo(() => sessions.find((s) => s?.thumbnail) || sessions[0], [sessions]);

  // Distinct photographers, lead floated to the front — drives the avatar
  // stack + the "@lead +N more" subtitle.
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const out: { handle: string; picture?: string; name?: string }[] = [];
    const leadHandle = lead?.user_handle;
    if (leadHandle) {
      seen.add(leadHandle);
      out.push({ handle: leadHandle, picture: lead?.user_picture, name: lead?.user_name });
    }
    for (const s of sessions) {
      const h = s?.user_handle;
      if (h && !seen.has(h)) {
        seen.add(h);
        out.push({ handle: h, picture: s?.user_picture, name: s?.user_name });
      }
    }
    return out;
  }, [sessions, lead]);

  if (!lead) return null;

  const sessionCount = sessions.length;
  const isMultiSession = sessionCount > 1;
  const isMultiPhotographer = ordered.length > 1;
  const others = ordered.length - 1;
  const subtitle = !lead.user_handle
    ? null
    : others === 0
    ? `@${lead.user_handle}`
    : `@${lead.user_handle} +${others} more`;

  const vids = lead.video_count ?? 0;
  const photos = Math.max(0, (lead.photo_count ?? 0) - vids);
  const videoUri =
    lead.thumbnail_media_type === 'video' && lead.thumbnail_preview_video_url
      ? lead.thumbnail_preview_video_url
      : null;

  // Multi-session → session-count pill. Single → the lead's media count.
  const topRight = isMultiSession ? (
    <Chip>
      <Ionicons name="albums-outline" size={10} color="#fff" />
      <Text style={styles.chipText}>{sessionCount}</Text>
    </Chip>
  ) : photos > 0 || vids > 0 ? (
    <Chip>
      {photos > 0 && (
        <>
          <Ionicons name="images-outline" size={10} color="#fff" />
          <Text style={styles.chipText}>{formatCount(photos)}</Text>
        </>
      )}
      {photos > 0 && vids > 0 && <Text style={styles.chipText}> </Text>}
      {vids > 0 && (
        <>
          <Ionicons name="videocam-outline" size={10} color="#fff" />
          <Text style={styles.chipText}>{formatCount(vids)}</Text>
        </>
      )}
    </Chip>
  ) : null;

  // Multi-photographer → lead avatar + a single "+N" pill. Single → one avatar
  // (no type badge — the tile is already a session).
  const avatar = isMultiPhotographer ? (
    <View style={styles.avatarStack}>
      {/* +N sits BEHIND the lead avatar (avatar on top via zIndex) so it peeks
          out to the right rather than covering the avatar. */}
      <View style={[styles.avatarRing, { zIndex: 2 }]}>
        <UserAvatar uri={ordered[0].picture} name={ordered[0].name ?? ordered[0].handle} size={26} />
      </View>
      <View style={[styles.avatarMore, { marginLeft: -10, zIndex: 1 }]}>
        <Text style={styles.avatarMoreText}>+{ordered.length - 1}</Text>
      </View>
    </View>
  ) : (
    <UserAvatar uri={lead.user_picture} name={lead.user_name ?? lead.user_handle} size={26} />
  );

  const onPress = () => {
    if (isMultiSession && onOpenDate && lead.session_date) {
      onOpenDate(String(lead.session_date).split('T')[0]);
    } else {
      const sid = lead.session_id ?? lead.id;
      if (sid) trackedPush(`/session/${sid}` as any);
    }
  };

  return (
    <RailTile
      onPress={onPress}
      heroUri={lead.thumbnail}
      videoUri={videoUri}
      active={isViewable}
      fallbackColor="#0c4a6e"
      fallbackIcon={<Ionicons name="images-outline" size={28} color="#38bdf8" />}
      topLeft={lead.session_date ? <Text style={styles.dateText}>{formatDate(lead.session_date)}</Text> : null}
      topRight={topRight}
      avatar={avatar}
      title={lead.session_name ?? ''}
      subtitle={subtitle}
      stackCount={isMultiSession ? sessionCount : 0}
      width={width}
      style={style}
    />
  );
}

// ─────────────────────────── Nearby Shapers ───────────────────────────
export function ShaperTile({
  shaper,
  width,
  style,
  onNavigate,
  isViewable = false,
}: {
  shaper: BoardroomShaper;
  width?: number;
  style?: any;
  onNavigate?: (path: string) => void;
  isViewable?: boolean;
}) {
  const trackedPush = useTrackedPush();
  const boards = shaper?.featured_boards ?? [];
  const firstBoard = boards[0];
  const disp = firstBoard ? boardPhotoDisplay(pickThumbnailPhoto(firstBoard)) : null;
  const subtitle =
    shaper?.surf_break_name || (boards.length ? `${boards.length} board${boards.length === 1 ? '' : 's'}` : null);

  return (
    <RailTile
      onPress={() => (onNavigate ?? trackedPush)(`/user/${shaper.handle}` as any)}
      heroUri={disp?.posterUrl}
      videoUri={disp?.isVideo ? disp.videoUrl : null}
      active={isViewable}
      fallbackColor="#3a2a08"
      fallbackIcon={<MaterialCommunityIcons name="surfing" size={30} color="#f59e0b" />}
      avatar={
        <UserAvatar
          uri={shaper.picture}
          name={shaper.name ?? shaper.handle}
          size={26}
          // Only badge verified shapers — unverified ones show a plain avatar
          // (mirrors the Nearby Photographers rail's verified-only gating).
          userType={shaper.verified ? 'shaper' : undefined}
          verified={!!shaper.verified}
        />
      }
      title={shaper.name ?? `@${shaper.handle}`}
      subtitle={subtitle}
      width={width}
      style={style}
    />
  );
}

// ─────────────────────────── Surf Films ───────────────────────────
// External YouTube records. Poster fills the tile with a play badge; tapping
// opens the film detail page (embed). Subtitle prefers a revealed break name,
// else region, else the creator.
export function FilmTile({
  film,
  width,
  style,
  onNavigate,
  subtitle: subtitleOverride,
  contextBreakId,
  contextCountryCode,
  contextRegion,
  showCredit = false,
  showDate = false,
}: {
  film: Film;
  width?: number;
  style?: any;
  onNavigate?: (path: string) => void;
  // Explicit subtitle (e.g. Explore grid shows the creator handle).
  subtitle?: string | null;
  // Location context (nearby rail / break page) — drives the region-vs-break
  // subtitle exactly like web NearbyFilmCard.
  contextBreakId?: string | null;
  contextCountryCode?: string | null;
  contextRegion?: string | null;
  // Credit mode (surf-break page): show verification/creator instead of location.
  showCredit?: boolean;
  // Show the film's publish date as a top-left badge (nearby/break rails) —
  // mirrors web NearbyFilmCard so films read chronologically.
  showDate?: boolean;
}) {
  const trackedPush = useTrackedPush();
  // Explore-grid creator credit — prefer @handle, then the cataloguer-entered
  // name (mirror of web filmCreatorSubtitle). May be null → no subtitle line.
  const creatorSubtitle = film.creator_handle ? `@${film.creator_handle}` : film.creator_name || null;

  // Credit subtitle: verified → creator's @handle; unverified → nothing.
  const creditSubtitle = film.creator_verified && film.creator_handle ? `@${film.creator_handle}` : null;

  // Subtitle rule (mirror of web NearbyFilmCard):
  //  - On a surf-break surface (contextBreakId set): that break's name only if
  //    REVEALED on the film (film.breaks holds revealed exact breaks); else the
  //    context region label.
  //  - On the nearby rail (country/region context, no break id): always the
  //    region label, viewer-context-aware.
  //  - Explore grid (no context): the creator credit.
  const hasLocationContext = !!(contextCountryCode || contextRegion || contextBreakId);
  const revealedSelected = contextBreakId ? (film.breaks ?? []).find((b) => b.id === contextBreakId) : null;
  const contextRegionObj = hasLocationContext
    ? filmRegionForContext(film.regions, { countryCode: contextCountryCode, region: contextRegion })
    : null;
  const subtitle = showCredit
    ? creditSubtitle
    : subtitleOverride ||
      (revealedSelected?.name ? revealedSelected.name.replaceAll('_', ' ') : null) ||
      (hasLocationContext ? filmPlaceLabel(contextRegionObj) : null) ||
      creatorSubtitle;

  return (
    <RailTile
      onPress={() => (onNavigate ?? trackedPush)(`/film/${film.id}` as any)}
      heroUri={ytThumb(film.youtube_video_id, film.poster_url)}
      heroFallbackUri={ytThumbFallback(film.youtube_video_id, film.poster_url)}
      fallbackColor="#0c4a6e"
      fallbackIcon={<Ionicons name="film-outline" size={28} color="#38bdf8" />}
      topLeft={
        showDate ? (
          film.film_date ? (
            <Chip>
              <Text style={styles.chipText}>{formatSessionDate(film.film_date)}</Text>
            </Chip>
          ) : undefined
        ) : film.creator_verified ? undefined : (
          // Explore grid: flag only UNVERIFIED films — verified ones carry the
          // creator @handle in the subtitle (mirror of web FilmTile).
          <View style={[styles.verifyPill, styles.verifyPillOff]}>
            <Text style={styles.verifyPillText}>Unverified</Text>
          </View>
        )
      }
      centerOverlay={
        <View style={styles.playBadge}>
          <Ionicons name="play" size={12} color="#fff" style={{ marginLeft: 1 }} />
        </View>
      }
      title={film.title || 'Surf film'}
      subtitle={subtitle}
      width={width}
      style={style}
    />
  );
}

// ─────────────────────────── Shaper Boards ───────────────────────────
// An individual board (from the unified Explore feed). Cover fills the tile
// (autoplaying its clip on-screen); footer carries the shaper avatar + board
// name + shaper. Tapping opens the board detail page.
export function BoardTile({
  board,
  width,
  style,
  onNavigate,
  isViewable = false,
}: {
  board: any; // { id, name, photos, thumbnail_photo_id, shaper:{handle,name,picture,verified} }
  width?: number;
  style?: any;
  onNavigate?: (path: string) => void;
  isViewable?: boolean;
}) {
  const trackedPush = useTrackedPush();
  const shaper = board?.shaper ?? {};
  const disp = boardPhotoDisplay(pickThumbnailPhoto(board));
  return (
    <RailTile
      onPress={() => (onNavigate ?? trackedPush)(`/board/${board.id}` as any)}
      heroUri={disp?.posterUrl}
      videoUri={disp?.isVideo ? disp.videoUrl : null}
      active={isViewable}
      fallbackColor="#3a2a08"
      fallbackIcon={<MaterialCommunityIcons name="surfing" size={28} color="#f59e0b" />}
      avatar={
        <UserAvatar
          uri={shaper.picture}
          name={shaper.name ?? shaper.handle}
          size={26}
          userType={shaper.verified ? 'shaper' : undefined}
          verified={!!shaper.verified}
        />
      }
      title={board.name || 'Board'}
      subtitle={shaper.name ?? (shaper.handle ? `@${shaper.handle}` : null)}
      width={width}
      style={style}
    />
  );
}

// ─────────────────────────── Nearby Business (ads) ───────────────────────────
export function BusinessTile({
  ad,
  surfBreakId,
  isViewable = false,
  width,
  style,
}: {
  ad: any;
  surfBreakId?: string;
  isViewable?: boolean;
  // Grid usage (Explore) passes a computed cell width + style; the Nearby
  // Business rail omits them and keeps the default rail tile footprint.
  width?: number;
  style?: any;
}) {
  const [recordImpression] = useRecordAdImpressionMutation();
  const firedRef = useRef(false);

  // Fire one impression on mount. Daily cap is keyed (user, ad, day) server-side,
  // so an off-screen rail tile that mounts can't over-count.
  useEffect(() => {
    if (!ad?.id || firedRef.current) return;
    firedRef.current = true;
    recordImpression({ adId: ad.id, surfBreakId, placement: 'content', device: currentDevice() }).catch(
      () => {}
    );
  }, [ad?.id, surfBreakId, recordImpression]);

  // Poster (still) + clip (mp4) from the ad's first media slide. A video slide's
  // s3_key IS the transcoded mp4; play it muted over the poster when in view.
  const { heroUri, videoUri } = useMemo(() => {
    const media = Array.isArray(ad?.media) ? [...ad.media] : [];
    media.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const first = media[0];
    if (first) {
      if (first.type === 'video') {
        // Only playable once the poster exists (transcode finished).
        return { heroUri: first.poster_s3_key || null, videoUri: first.poster_s3_key ? first.s3_key : null };
      }
      return { heroUri: first.landscape_s3_key || first.s3_key || null, videoUri: null };
    }
    return { heroUri: ad?.media_url || null, videoUri: null };
  }, [ad]);

  const openClick = () => {
    if (!ad?.id) return;
    const trackUrl = buildAdClickUrl(ad.id, { placement: 'content', surfBreakId, device: currentDevice() });
    if (ad.cta_type === 'tel' && ad.click_url) {
      const number = String(ad.click_url).replace(/^tel:/i, '').trim();
      Alert.alert(ad.company_name || 'Call', number, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            fetch(trackUrl).catch(() => {});
            Linking.openURL(`tel:${number}`).catch(() => {});
          },
        },
      ]);
      return;
    }
    Linking.openURL(trackUrl).catch(() => {});
  };

  if (!ad) return null;

  return (
    <RailTile
      onPress={openClick}
      heroUri={heroUri}
      videoUri={videoUri}
      active={isViewable}
      fallbackColor="#1f2937"
      fallbackIcon={<Ionicons name="business-outline" size={28} color="#9ca3af" />}
      topLeft={<Chip><Text style={styles.chipTextUpper}>Sponsored</Text></Chip>}
      avatar={
        <View style={styles.adAvatar}>
          {ad.advertiser_picture || ad.partner_logo_url ? (
            <Image source={{ uri: ad.advertiser_picture || ad.partner_logo_url }} style={styles.adAvatarImg} contentFit="cover" />
          ) : (
            <Ionicons name="business" size={13} color="#fff" />
          )}
        </View>
      }
      title={ad.company_name || 'Local business'}
      subtitle={ad.headline || null}
      width={width}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  // Width is set inline (rail = RAIL_TILE_WIDTH, grid = computed cell width).
  tile: { marginRight: 12 },
  // Extra right margin so the peeking edges don't collide with the next tile.
  tileStacked: { marginRight: 22 },
  peek: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 16,
  },
  peekNear: { transform: [{ translateX: 8 }, { translateY: 8 }] },
  peekFar: { transform: [{ translateX: 15 }, { translateY: 13 }] },
  hero: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  topLeft: { position: 'absolute', top: 8, left: 8 },
  topRight: { position: 'absolute', top: 8, right: 8 },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // Film verification pill (Explore grid) — mirror of web NearbyPill.
  verifyPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  verifyPillOff: { backgroundColor: 'rgba(0,0,0,0.55)' },
  verifyPillText: { color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  // YouTube-style red play badge — matches web FilmTile (h-10 w-[58px] rounded-2xl).
  playBadge: {
    width: 38,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 11, marginTop: 1, color: 'rgba(255,255,255,0.78)' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(17,24,39,0.85)',
  },
  avatarMore: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderWidth: 1.5,
    borderColor: 'rgba(17,24,39,0.85)',
  },
  avatarMoreText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chipTextUpper: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#fff' },
  adAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  adAvatarImg: { width: '100%', height: '100%' },
});
