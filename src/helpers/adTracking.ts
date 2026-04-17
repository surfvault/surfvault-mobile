import Constants from 'expo-constants';
import { Platform } from 'react-native';

const apiBaseUrl =
    (Constants.expoConfig as any)?.extra?.apiBaseUrl ?? 'https://dev-api.surf-vault.com';

/**
 * Build a click-tracker URL. Opening this URL hits the API, which logs the
 * click event in ad_events and 302-redirects to the advertiser's destination.
 */
export function buildAdClickUrl(
    adId: string,
    opts: { placement?: string; surfBreakId?: string; device?: 'ios' | 'android' } = {}
): string {
    const device = opts.device ?? (Platform.OS === 'ios' ? 'ios' : 'android');
    const params = new URLSearchParams();
    if (opts.placement) params.set('placement_key', opts.placement);
    if (opts.surfBreakId) params.set('surf_break_id', opts.surfBreakId);
    params.set('device', device);
    return `${apiBaseUrl}/ads/${adId}/click?${params.toString()}`;
}

export function currentDevice(): 'ios' | 'android' {
    return Platform.OS === 'ios' ? 'ios' : 'android';
}
