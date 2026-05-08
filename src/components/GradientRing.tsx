import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

export const STORY_STOPS = [
  { offset: '0%', color: '#22d3ee' },
  { offset: '50%', color: '#0ea5e9' },
  { offset: '100%', color: '#6366f1' },
];
export const ACTIVE_STOPS = [
  { offset: '0%', color: '#22c55e' },
  { offset: '100%', color: '#16a34a' },
];
export const NOTE_STOPS = [
  { offset: '0%', color: '#38bdf8' },
  { offset: '100%', color: '#0ea5e9' },
];

interface Props {
  size: number;
  strokeWidth?: number;
  stops?: typeof STORY_STOPS;
}

export default function GradientRing({
  size,
  strokeWidth = 3,
  stops = STORY_STOPS,
}: Props) {
  const reactId = useId();
  const gradId = `gring-${reactId.replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          {stops.map((s, i) => (
            <Stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </LinearGradient>
      </Defs>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={(size - strokeWidth) / 2}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        fill="none"
      />
    </Svg>
  );
}
