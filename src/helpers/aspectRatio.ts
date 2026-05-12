export type AspectRatioKey = '4:5' | '1:1' | '5:4' | '16:9';

export interface AspectRatioOption {
  key: AspectRatioKey;
  label: string;
  value: number;
}

// Owner-selectable card aspect ratios for feed surfaces. The card height is
// driven by `aspectRatio: value` so the order here is purely the picker's
// chip order.
export const RATIO_OPTIONS: AspectRatioOption[] = [
  { key: '4:5', label: 'Portrait', value: 4 / 5 },
  { key: '1:1', label: 'Square', value: 1 / 1 },
  { key: '5:4', label: 'Landscape', value: 5 / 4 },
  { key: '16:9', label: 'Wide', value: 16 / 9 },
];

const KEY_TO_VALUE: Record<AspectRatioKey, number> = RATIO_OPTIONS.reduce(
  (acc, o) => {
    acc[o.key] = o.value;
    return acc;
  },
  {} as Record<AspectRatioKey, number>,
);

// Resolve a session's stored `aspect_ratio` string to a numeric ratio for
// React Native's `aspectRatio` style. Falls back to the surface default
// (caller passes `4/5` for feed cards, `5/4` for the profile compact list).
//
// For multi-session swipe groups, callers should pass the FIRST session in
// the group — subsequent slides inherit the card height and center-crop via
// `resizeMode: 'cover'`.
export function resolveAspect(
  session: { aspect_ratio?: string | null } | null | undefined,
  fallback: number,
): number {
  const key = session?.aspect_ratio as AspectRatioKey | undefined | null;
  if (key && KEY_TO_VALUE[key] !== undefined) return KEY_TO_VALUE[key];
  return fallback;
}
