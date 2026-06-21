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
  participant_count: number;
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
}

export interface FilmDetailResult {
  film: Film;
  participants: FilmParticipant[];
  boards: FilmBoardTag[];
  sessions: FilmSessionTag[];
  suggestedBreaks: Array<FilmBreak & { is_public: boolean; suggested_by: string | null }>;
  viewerCanEdit: boolean;
}

/**
 * Film record endpoints (TS mirror of the web `films.js`). Films point to an
 * EXTERNAL YouTube video — we embed, never host. Reads public/optional-auth;
 * writes require auth.
 */
const filmsApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getLatestFilms: builder.query<{ results: { films: Film[] } }, { limit?: number } | void>({
      providesTags: [ApiTag.Film],
      query: (args) => ({ url: `/films/latest?limit=${args?.limit ?? 30}`, method: 'GET' }),
    }),
    getFilmsNear: builder.query<
      { results: { films: Film[] } },
      { lat?: number | null; lon?: number | null; limit?: number }
    >({
      providesTags: [ApiTag.Film],
      query: ({ lat, lon, limit = 30 }) => {
        const params = new URLSearchParams();
        if (lat != null) params.set('lat', String(lat));
        if (lon != null) params.set('lon', String(lon));
        params.set('limit', String(limit));
        return { url: `/films/near?${params.toString()}`, method: 'GET' };
      },
    }),
    getFilmsForSurfBreak: builder.query<
      { results: { films: Film[] } },
      { breakId: string; limit?: number }
    >({
      providesTags: [ApiTag.Film],
      query: ({ breakId, limit = 20 }) => ({
        url: `/surf-breaks/${breakId}/films?limit=${limit}`,
        method: 'GET',
      }),
    }),
    getFilmsForUser: builder.query<
      { results: { films: Film[] } },
      { handle: string; limit?: number }
    >({
      providesTags: [ApiTag.Film],
      query: ({ handle, limit = 30 }) => ({
        url: `/users/${handle}/films?limit=${limit}`,
        method: 'GET',
      }),
    }),
    getFilm: builder.query<{ results: FilmDetailResult }, { filmId: string }>({
      providesTags: (_r, _e, { filmId }) => [{ type: ApiTag.Film, id: filmId }, ApiTag.Film],
      query: ({ filmId }) => ({ url: `/films/${filmId}`, method: 'GET' }),
    }),

    // ---- Writes ----
    createFilm: builder.mutation<
      { results: { filmId: string } },
      { youtube_video_id?: string; youtube_url?: string; title: string; description?: string; poster_url?: string | null; creator_name?: string | null }
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
      { results: { success: boolean } },
      { filmId: string; surfBreakId: string; action?: 'add' | 'remove' }
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
  useGetFilmsForUserQuery,
  useGetFilmQuery,
  useCreateFilmMutation,
  useUpdateFilmMutation,
  useDeleteFilmMutation,
  useTagFilmParticipantMutation,
  useConfirmFilmParticipantMutation,
  useTagFilmSurfBreakMutation,
  useTagFilmBoardMutation,
  useTagFilmSessionMutation,
  useReportFilmMutation,
} = filmsApi;
export { filmsApi };
