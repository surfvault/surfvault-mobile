import type { UserTypeBadgeType } from "../components/UserTypeBadge";

interface VerifiableUser {
  user_type?: UserTypeBadgeType | string | null;
  type?: string | null;
  verified?: boolean | null;
  subscription_tier?: string | null;
}

export function isUserVerified(user?: VerifiableUser | null): boolean {
  if (!user) return false;
  return !!user.verified;
}

export function getUserType(
  user?: VerifiableUser | null,
): UserTypeBadgeType | undefined {
  if (!user) return undefined;
  const t = (user.user_type ?? user.type) as string | null | undefined;
  if (t === "surfer" || t === "photographer" || t === "shaper") return t;
  return undefined;
}
