import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useDispatch, useSelector } from 'react-redux';
import { setCoordinates } from '../store/slices/location';

// Module-level flag so we don't re-ask within a single JS runtime.
let didPromptOnce = false;

interface UserCoordsState {
    lat: number | null;
    lon: number | null;
    hasCoords: boolean;
}

/**
 * Reads the user's coordinates from the Redux location slice. If coords haven't
 * been populated yet (user hasn't opened the map tab), politely requests
 * foreground permission once per JS session and writes the result back to Redux
 * so other screens benefit too.
 *
 * Denial or permission errors are swallowed — callers treat `hasCoords=false`
 * as "no geo signal" and fall back to non-targeted ads.
 */
export function useUserCoords(): UserCoordsState {
    const dispatch = useDispatch();
    const coords = useSelector((state: any) => state.location?.coordinates) as
        | { lat: number; lon: number }
        | undefined;

    const hasCoords = !!(coords && (coords.lat !== 0 || coords.lon !== 0));

    useEffect(() => {
        if (hasCoords || didPromptOnce) return;
        didPromptOnce = true;
        (async () => {
            try {
                const existing = await Location.getForegroundPermissionsAsync();
                let status = existing.status;
                if (status !== 'granted' && existing.canAskAgain) {
                    const req = await Location.requestForegroundPermissionsAsync();
                    status = req.status;
                }
                if (status !== 'granted') return;
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                dispatch(
                    setCoordinates({ lat: loc.coords.latitude, lon: loc.coords.longitude })
                );
            } catch {
                /* Permission denied or location unavailable — fall back silently. */
            }
        })();
    }, [hasCoords, dispatch]);

    return {
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        hasCoords,
    };
}
