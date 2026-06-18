import Svg, { G, Path } from 'react-native-svg';

/**
 * A surfboard glyph (no font set ships one). Reuses the board outline + stringer
 * from the shaper UserTypeBadge so the "Boards" affordance reads on-brand.
 */
export default function BoardIcon({
  size = 16,
  color = '#000000',
  style,
}: {
  size?: number;
  color?: string;
  style?: any;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <G transform="rotate(35 12 12)">
        <Path
          d="M12 4.2C13.8 5.8 15.1 8.6 15.1 12C15.1 14.8 14.4 17 13.2 18.3C12.5 19 11.5 19 10.8 18.3C9.6 17 8.9 14.8 8.9 12C8.9 8.6 10.2 5.8 12 4.2Z"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <Path d="M12 5.5V17.5" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
        <Path d="M12 17.3Q9 16.9 8 18Q9 19.3 12 18.7Z" fill={color} />
      </G>
    </Svg>
  );
}
