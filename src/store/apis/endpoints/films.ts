import { ApiTag, rootApi } from '../rootApi';

/** A revealed exact surf break on a film. */
export interface FilmBreak {
  id: string;
  name: string;
  region: string;
  country: string;
  country_code: string;
  surf_break_identifier: string;
}

/** Region-level location (exact break hidden). */
export interface FilmRegion {
  region: string | null;
  country: string | null;
  country_code: string | null;
}

/** Per-film feed/detail row. `breaks` are REVEALED exact breaks only; `regions`
 * give region-level discovery without exposing a hidden spot. */
export interface Film {
  id: string;
  provider: string;
  youtube_video_id: string;
  title: string;
  description: string;
  poster_url: string | null;
  creator_user_id: string | null;
  creator_name: string | null;
  creator_verified: boolean;
  creator_handle: string | null;
  creator_display_name: string | null;
  creator_picture: string | null;
  location_locked: boolean;
  breaks: FilmBreak[];
  regions: FilmRegion[];
  // Regions that contain a HIDDEN break (region-level, no spot named). Detail only.
  hidden_regions?: FilmRegion[];
  participant_count: number;
  // YouTube publish date (UTC), drives chronological feeds. Nullable.
  film_date: string | null;
  // All-time view count (feeds/detail that select it).
  views?: number;
  // Following feed only: which followed users surfaced this film.
  following_connections?: Array<{ handle: string; name: string | null; picture: string | null; verified?: boolean }>;
  distance_km?: number | null;
  created_at: string;
  updated_at: string;
}

export interface FilmParticipant {
  id: string;
  handle: string;
  name: string | null;
  picture: string | null;
  confirmed: boolean;
}

export interface FilmBoardTag {
  id: string;
  name: string;
  board_type: string | null;
  thumbnail_photo_id: string | null;
  shaper_handle: string;
  shaper_name: string | null;
}

export interface FilmSessionTag {
  id: string;
  session_name: string | null;
  session_date: string | null;
  hide_location: boolean;
  surf_break_name: string | null;
  surf_break_identifier: string | null;
  country_code: string | null;
  region: string | null;
  country: string | null;
  owner_handle: string;
  owner_name: string | null;
  thumbnail: string | null;
  confirmed?: boolean;
}

export interface FilmDetailResult {
  film: Film;
  participants: FilmParticipant[];
  boards: FilmBoardTag[];
  sessions: FilmSessionTag[];
  suggestedBreaks: Array<FilmBreak & { is_public: boolean; suggested_by: string | null }>;
  viewerCanEdit: boolean;
  viewerCanLinkSessions?: boolean;
  viewerCanVerify?: boolean;
  viewerCanReveal?: boolean;
  creditsVisible?: boolean;
}

/**
 * Film record endpoints (TS mirror of the web `films.js`). Films point to an
 * EXTERNAL YouTube video — we embed, never host. Reads public/optional-auth;
 * writes require auth.
 */
const filmsApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getLatestFilms: builder.query<
      { results: { films: Film[]; continuationToken?: string | null } },
      { limit?: number; sort?: 'popular'; continuationToken?: string | null } | void
    >({
      providesTags: [ApiTag.Film],
      query: (args) => ({
        url: `/films/latest?limit=${args?.limit ?? 30}${args?.sort ? `&sort=${args.sort}` : ''}${args?.continuationToken ? `&continuationToken=${encodeURIComponent(args.continuationToken)}` : ''}`,
        method: 'GET',
      }),
    }),
    getFilmsNear: builder.query<
      { results: { films: Film[] } },
      { lat?: number | null; lon?: number | null; limit?: number; month?: number; day?: number; radiusKm?: number }
    >({
      providesTags: [ApiTag.Film],
      // `month`/`day` (caller's LOCAL date) engage the "On This Day" filter: only
      // films whose film_date falls on that month-day across all years.
      query: ({ lat, lon, limit = 30, month, day, radiusKm }) => {
        const params = new URLSearchParams();
        if (lat != null) params.set('lat', String(lat));
        if (lon != null) params.set('lon', String(lon));
        params.set('limit', String(limit));
        if (month != null) params.set('month', String(month));
        if (day != null) params.set('day', String(day));
        // Bounds the proximity search so nothing far away leaks in.
        if (radiusKm != null) params.set('radiusKm', String(radiusKm));
        return { url: `/films/near?${params.toString()}`, method: 'GET' };
      },
    }),
    getFilmsForSurfBreak: builder.query<
      { results: { films: Film[] } },
      { breakId: string; limit?: number; verifiedOnly?: boolean }
    >({
      providesTags: [ApiTag.Film],
      query: ({ breakId, limit = 20, verifiedOnly = false }) => ({
        url: `/surf-breaks/${breakId}/films?limit=${limit}${verifiedOnly ? '&verifiedOnly=true' : ''}`,
        method: 'GET',
      }),
    }),
    // Auth: films tied to people you follow (confirmed participant / verified or
    // self-listed creator). Drives the Following films.
    getFilmsFromFollowing: builder.query<{ results: { films: Film[] } }, { limit?: number } | void>({
      providesTags: [ApiTag.Film, ApiTag.Follow],
      query: (args) => ({ url: `/films/from-following?limit=${args?.limit ?? 30}`, method: 'GET' }),
    }),
    getFilmsForUser: builder.query<
      { results: { films: Film[]; continuationToken?: string | null } },
      // scope (self-only): 'mine' = created/catalogued incl. unverified;
      // 'tagged' = confirmed-participant. Omit for earned-only (default).
      { handle: string; limit?: number; scope?: 'mine' | 'tagged'; continuationToken?: string | null }
    >({
      providesTags: [ApiTag.Film],
      query: ({ handle, limit = 30, scope, continuationToken }) => ({
        url: `/users/${handle}/films?limit=${limit}${scope ? `&scope=${scope}` : ''}${continuationToken ? `&continuationToken=${encodeURIComponent(continuationToken)}` : ''}`,
        method: 'GET',
      }),
    }),
    getFilm: builder.query<{ results: FilmDetailResult }, { filmId: string }>({
      providesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId }) => ({ url: `/films/${filmId}`, method: 'GET' }),
    }),
    // Dedupe pre-check for Add-a-film: resolves the canonical record for a video
    // id without creating. { exists, filmId, title }.
    checkFilmByVideoId: builder.query<
      { results: { exists: boolean; filmId: string | null; title?: string } },
      { videoId: string }
    >({
      query: ({ videoId }) => ({ url: `/films/by-video?videoId=${encodeURIComponent(videoId)}`, method: 'GET' }),
    }),
    // Link-a-session picker source: sessions at the film's tagged breaks owned by
    // the film's CONFIRMED participants — not a blind self-list. Mirror of web.
    getFilmCandidateSessions: builder.query<{ results: { sessions: FilmSessionTag[] } }, { filmId: string }>({
      providesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }],
      query: ({ filmId }) => ({ url: `/films/${filmId}/candidate-sessions`, method: 'GET' }),
    }),
    // "Keep watching" rails for the film detail screen. One round trip →
    // { fromCreator, nearby, nearbyScope }: other films by the same filmer +
    // films near this film's breaks (server-side proximity, no coords leaked;
    // nearbyScope='local'|'latest' picks the rail title). Public.
    getRelatedFilms: builder.query<
      { results: { fromCreator: Film[]; nearby: Film[]; nearbyScope: 'local' | 'latest' } },
      { filmId: string; limit?: number }
    >({
      providesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, limit = 12 }) => ({ url: `/films/${filmId}/related?limit=${limit}`, method: 'GET' }),
    }),

    // ---- Writes ----
    createFilm: builder.mutation<
      { results: { filmId: string } },
      { youtube_video_id?: string; youtube_url?: string; title: string; description?: string; poster_url?: string | null; creator_name?: string | null; film_date?: string; channel_id?: string | null; channel_name?: string | null; channel_url?: string | null }
    >({
      invalidatesTags: [ApiTag.Film],
      query: (payload) => ({ url: `/films`, method: 'POST', body: payload }),
    }),
    updateFilm: builder.mutation<
      { results: { filmId: string } },
      { filmId: string; payload: Record<string, any> }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, payload }) => ({ url: `/films/${filmId}`, method: 'PATCH', body: payload }),
    }),
    deleteFilm: builder.mutation<{ results: { success: boolean } }, { filmId: string }>({
      invalidatesTags: [ApiTag.Film],
      query: ({ filmId }) => ({ url: `/films/${filmId}`, method: 'DELETE' }),
    }),
    tagFilmParticipant: builder.mutation<
      { results: { success: boolean } },
      { filmId: string; userId: string; action?: 'add' | 'remove' }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, userId, action }) => ({
        url: `/films/${filmId}/participants`,
        method: 'POST',
        body: { userId, action: action ?? 'add' },
      }),
    }),
    confirmFilmParticipant: builder.mutation<
      { results: { success: boolean; confirmed: boolean } },
      { filmId: string; action?: 'confirm' | 'reject' }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, action }) => ({
        url: `/films/${filmId}/participants/confirm`,
        method: 'POST',
        body: { action: action ?? 'confirm' },
      }),
    }),
    tagFilmSurfBreak: builder.mutation<
      { results: { success: boolean; is_public?: boolean } },
      { filmId: string; surfBreakId: string; action?: 'add' | 'remove' | 'reveal' | 'hide' }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, surfBreakId, action }) => ({
        url: `/films/${filmId}/surf-breaks`,
        method: 'POST',
        body: { surfBreakId, action: action ?? 'add' },
      }),
    }),
    tagFilmBoard: builder.mutation<
      { results: { success: boolean } },
      { filmId: string; boardId: string; action?: 'add' | 'remove' }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, boardId, action }) => ({
        url: `/films/${filmId}/boards`,
        method: 'POST',
        body: { boardId, action: action ?? 'add' },
      }),
    }),
    tagFilmSession: builder.mutation<
      { results: { success: boolean } },
      { filmId: string; sessionId: string; action?: 'add' | 'remove' }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, sessionId, action }) => ({
        url: `/films/${filmId}/sessions`,
        method: 'POST',
        body: { sessionId, action: action ?? 'add' },
      }),
    }),
    // Session owner approves/rejects a pending editor-linked session.
    confirmFilmSession: builder.mutation<
      { results: { success: boolean } },
      { filmId: string; sessionId: string; action?: 'confirm' | 'reject' }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film, ApiTag.Notification],
      query: ({ filmId, sessionId, action }) => ({
        url: `/films/${filmId}/sessions/${sessionId}/confirm`,
        method: 'POST',
        body: { action: action ?? 'confirm' },
      }),
    }),
    // ---- Creator verification (description-code) ----
    claimFilmCreator: builder.mutation<
      { results: { code: string; token: string } },
      { filmId: string }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId }) => ({ url: `/films/${filmId}/claim`, method: 'POST' }),
    }),
    verifyFilmCheck: builder.mutation<
      { results: { matched: boolean; resultToken?: string } },
      { filmId: string; token: string }
    >({
      query: ({ filmId, token }) => ({ url: `/films/${filmId}/verify-check`, method: 'POST', body: { token } }),
    }),
    verifyFilmApply: builder.mutation<
      { results: { filmId: string; verified: boolean } },
      { filmId: string; resultToken: string }
    >({
      invalidatesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId, resultToken }) => ({ url: `/films/${filmId}/verify-apply`, method: 'POST', body: { resultToken } }),
    }),
    reportFilm: builder.mutation<
      { message: string },
      { filmId: string; reason: string; details?: string }
    >({
      query: ({ filmId, reason, details }) => ({
        url: `/films/${filmId}/report`,
        method: 'POST',
        body: { reason, details: details ?? '' },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLatestFilmsQuery,
  useGetFilmsNearQuery,
  useGetFilmsForSurfBreakQuery,
  useGetFilmsFromFollowingQuery,
  useGetFilmsForUserQuery,
  useGetFilmQuery,
  useGetFilmCandidateSessionsQuery,
  useGetRelatedFilmsQuery,
  useLazyCheckFilmByVideoIdQuery,
  useCreateFilmMutation,
  useUpdateFilmMutation,
  useDeleteFilmMutation,
  useTagFilmParticipantMutation,
  useConfirmFilmParticipantMutation,
  useTagFilmSurfBreakMutation,
  useTagFilmBoardMutation,
  useTagFilmSessionMutation,
  useConfirmFilmSessionMutation,
  useClaimFilmCreatorMutation,
  useVerifyFilmCheckMutation,
  useVerifyFilmApplyMutation,
  useReportFilmMutation,
} = filmsApi;
export { filmsApi };
