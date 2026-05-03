import Svg, { Path } from 'react-native-svg';

/**
 * Verified-photographer badge. Pixel-identical to the web SVG at
 * `surfvault-web/src/assets/svgs/verified-photographer.svg` so the visual
 * mark of a verified account stays consistent across platforms.
 */
export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#1DA1F2"
        d="M12 2.25c1.2 0 2 .9 2.7 1.6.7.7 1.5.9 2.4.6.9-.3 1.8 0 2.4.6s.9 1.5.6 2.4c-.3.9-.1 1.7.6 2.4.7.7.9 1.5.6 2.4-.3.9 0 1.7.6 2.4.7.7.9 1.5.6 2.4-.3.9-1 1.5-2 1.6-.9.1-1.6.5-2 1.4-.5.9-1.3 1.2-2.2 1.2-.9 0-1.6.5-2.2 1.2-.5.8-1.3 1.2-2.2 1.2s-1.7-.4-2.2-1.2c-.6-.7-1.3-1.2-2.2-1.2s-1.7-.3-2.2-1.2c-.4-.9-1.1-1.3-2-1.4-1-.1-1.7-.7-2-1.6-.3-.9-.1-1.7.6-2.4.6-.7.9-1.5.6-2.4-.3-.9 0-1.7.6-2.4.7-.7.9-1.5.6-2.4-.3-.9 0-1.7.6-2.4.6-.6 1.5-.9 2.4-.6.9.3 1.7.1 2.4-.6C10 3.15 10.8 2.25 12 2.25z"
      />
      <Path
        d="M7.5 12.5l3 3 6-6"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
