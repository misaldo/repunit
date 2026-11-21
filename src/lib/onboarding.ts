const DEFAULT_ONBOARDING_WINDOW_MS = 15 * 60 * 1000;

/**
 * OAuth providers such as Google don't receive REPUNIT's email sign-up metadata.
 * Treat an auth user created moments ago as a first-run account until the
 * onboarding_completed profile flag has been saved.
 */
export function isRecentlyCreatedAccount(
  createdAt: string | null | undefined,
  now = Date.now(),
  windowMs = DEFAULT_ONBOARDING_WINDOW_MS,
): boolean {
  if (!createdAt) return false;
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs)
    && createdAtMs <= now
    && now - createdAtMs < windowMs;
}
