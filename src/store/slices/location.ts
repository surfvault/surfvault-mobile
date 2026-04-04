import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Coordinates {
  lat: number;
  lon: number;
}

interface LocationState {
  country: string;
  surfSpot: string;
  coordinates: Coordinates;
}

const initialState: LocationState = {
  country: '',
  surfSpot: '',
  coordinates: {
    lat: 0,
    lon: 0,
  },
};

export const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setCountry(state, action: PayloadAction<string>) {
      state.country = action.payload;
    },
    setSurfSpot(state, action: PayloadAction<string>) {
      state.surfSpot = action.payload;
    },
    setCoordinates(state, action: PayloadAction<Coordinates>) {
      state.coordinates = action.payload;
    },
  },
});

export const { setCountry, setSurfSpot, setCoordinates } = locationSlice.actions;
export const { reducer } = locationSlice;
