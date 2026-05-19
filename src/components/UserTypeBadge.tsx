import React from "react";
import { useColorScheme } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

export type UserTypeBadgeType = "surfer" | "photographer" | "shaper";

// Note: advertisers are NOT a badge variant — they're surfaced via a
// dedicated "Sponsored" pill next to the handle. The badge is reserved for
// user types that earn a small visual identity glyph; the brand-status
// signal is text-based for clarity.

interface UserTypeBadgeProps {
  userType: UserTypeBadgeType;
  isVerified?: boolean;
  size?: number;
  /** Stroke/fill color for the unverified outline. Defaults to slate-900. Ignored when isVerified=true. */
  color?: string;
}

/**
 * UserTypeBadge — combined type icon + verified badge for surfer / photographer / shaper.
 *
 * Replaces the old VerifiedBadge.tsx + per-platform Ionicons/MaterialCommunityIcons type icons.
 * Each badge sits inside a circle frame for visual consistency across all three types.
 * Verified state fills the circle blue and adds a gold medallion with white check at the bottom-right.
 */
export default function UserTypeBadge({
  userType,
  isVerified = false,
  size = 20,
  color,
}: UserTypeBadgeProps) {
  const isDark = useColorScheme() === "dark";
  // Unverified badge always renders a filled circle for consistency with the
  // avatar-corner variant. Dark mode → white fill + black icon. Light mode →
  // black fill + white icon. `color` (if passed) overrides the icon stroke.
  const fill = isDark ? "#fff" : "#000";
  const stroke = color ?? (isDark ? "#000" : "#fff");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderBadge(userType, isVerified, fill, stroke)}
    </Svg>
  );
}

function renderBadge(
  userType: UserTypeBadgeType,
  isVerified: boolean,
  fill: string,
  stroke: string,
) {
  if (userType === "surfer") {
    return isVerified ? <SurferVerified /> : <SurferOutline fill={fill} stroke={stroke} />;
  }
  if (userType === "photographer") {
    return isVerified ? (
      <PhotographerVerified />
    ) : (
      <PhotographerOutline fill={fill} stroke={stroke} />
    );
  }
  if (userType === "shaper") {
    return isVerified ? <ShaperVerified /> : <ShaperOutline fill={fill} stroke={stroke} />;
  }
  return null;
}

// ============ SURFER (Lucide wave-circle) ============

function SurferOutline({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <>
      <Circle cx="12" cy="12" r="10" fill={fill} />
      <Path
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 20.93a5 5 0 1 1-.6-9 7 7 0 0 0-13.9.6"
      />
    </>
  );
}

function SurferVerified() {
  return (
    <>
      <Circle cx="12" cy="12" r="10" fill="#0ea5e9" />
      <Path
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 20.93a5 5 0 1 1-.6-9 7 7 0 0 0-13.9.6"
      />
      <GoldMedallion />
    </>
  );
}

// ============ PHOTOGRAPHER (camera in circle) ============

function PhotographerOutline({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <>
      <Circle cx="12" cy="12" r="10" fill={fill} />
      <Path
        d="M6.5 10C6.5 9 7.3 8.2 8.3 8.2H9.5L10.1 7.1C10.2 6.9 10.4 6.8 10.7 6.8H13.3C13.6 6.8 13.8 6.9 13.9 7.1L14.5 8.2H15.7C16.7 8.2 17.5 9 17.5 10V16.4C17.5 17.4 16.7 18.2 15.7 18.2H8.3C7.3 18.2 6.5 17.4 6.5 16.4V10Z"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <Circle
        cx="12"
        cy="13.2"
        r="2.4"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
    </>
  );
}

function PhotographerVerified() {
  return (
    <>
      <Circle cx="12" cy="12" r="10" fill="#0ea5e9" />
      <Path
        d="M6.5 10C6.5 9 7.3 8.2 8.3 8.2H9.5L10.1 7.1C10.2 6.9 10.4 6.8 10.7 6.8H13.3C13.6 6.8 13.8 6.9 13.9 7.1L14.5 8.2H15.7C16.7 8.2 17.5 9 17.5 10V16.4C17.5 17.4 16.7 18.2 15.7 18.2H8.3C7.3 18.2 6.5 17.4 6.5 16.4V10Z"
        fill="#fff"
      />
      <Circle cx="12" cy="13.2" r="2.5" fill="#0ea5e9" />
      <GoldMedallion />
    </>
  );
}

// ============ SHAPER (surfboard in circle) ============

function ShaperOutline({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <>
      <Circle cx="12" cy="12" r="10" fill={fill} />
      <G transform="rotate(35 12 12)">
        <Path
          d="M12 4.2C13.8 5.8 15.1 8.6 15.1 12C15.1 14.8 14.4 17 13.2 18.3C12.5 19 11.5 19 10.8 18.3C9.6 17 8.9 14.8 8.9 12C8.9 8.6 10.2 5.8 12 4.2Z"
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <Path
          d="M12 5.5V17.5"
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <Path d="M12 17.3Q9 16.9 8 18Q9 19.3 12 18.7Z" fill={stroke} />
      </G>
    </>
  );
}

function ShaperVerified() {
  return (
    <>
      <Circle cx="12" cy="12" r="10" fill="#0ea5e9" />
      <G transform="rotate(35 12 12)">
        <Path
          d="M12 4.2C13.8 5.8 15.1 8.6 15.1 12C15.1 14.8 14.4 17 13.2 18.3C12.5 19 11.5 19 10.8 18.3C9.6 17 8.9 14.8 8.9 12C8.9 8.6 10.2 5.8 12 4.2Z"
          fill="#fff"
        />
        <Path
          d="M12 5.5V17.5"
          stroke="#0ea5e9"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <Path d="M12 17.3Q9 16.9 8 18Q9 19.3 12 18.7Z" fill="#fff" />
      </G>
      <GoldMedallion />
    </>
  );
}

// ============ Shared gold "verified" medallion (bottom-right) ============

function GoldMedallion() {
  return (
    <>
      <Circle cx="19" cy="19" r="4.5" fill="#fff" />
      <Circle cx="19" cy="19" r="3.7" fill="#f59e0b" />
      <Path
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.1 19L18.4 20.3L20.8 17.7"
      />
    </>
  );
}
