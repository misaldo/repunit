export const PR_GOAL_TARGET = 2;

export function getPrGoalProgress(value: number) {
  const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return {
    count: Math.min(count, PR_GOAL_TARGET),
    target: PR_GOAL_TARGET,
    remaining: Math.max(0, PR_GOAL_TARGET - count),
    complete: count >= PR_GOAL_TARGET,
  };
}
