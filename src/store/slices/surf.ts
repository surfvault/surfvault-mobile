import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SurfState {
  uploading: boolean;
}

const initialState: SurfState = {
  uploading: false,
};

export const surfSlice = createSlice({
  name: 'surf',
  initialState,
  reducers: {
    setUploading(state, action: PayloadAction<boolean>) {
      state.uploading = action.payload;
    },
  },
});

export const { setUploading } = surfSlice.actions;
export const { reducer } = surfSlice;
