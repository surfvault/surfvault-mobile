import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// One-shot hand-off for "upload here" affordances (e.g. the + on a surf-break
// hero): the source screen stashes the break, the create-session tab consumes
// it on mount/focus and clears it. Only the fields the upload form reads.
export interface PendingUploadBreak {
  id: string;
  name: string;
  region?: string | null;
  country_code?: string | null;
}

interface SurfState {
  uploading: boolean;
  pendingUploadBreak: PendingUploadBreak | null;
}

const initialState: SurfState = {
  uploading: false,
  pendingUploadBreak: null,
};

export const surfSlice = createSlice({
  name: 'surf',
  initialState,
  reducers: {
    setUploading(state, action: PayloadAction<boolean>) {
      state.uploading = action.payload;
    },
    setPendingUploadBreak(state, action: PayloadAction<PendingUploadBreak | null>) {
      state.pendingUploadBreak = action.payload;
    },
  },
});

export const { setUploading, setPendingUploadBreak } = surfSlice.actions;
export const { reducer } = surfSlice;
