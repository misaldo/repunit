export const PR_GOAL_TARGET = 2;

export function getPrGoalProgress(totalEvents: number, baselineEvents = 0) {
  const total = Number.isFinite(totalEvents) ? Math.max(0, Math.floor(totalEvents)) : 0;
  const baseline = Number.isFinite(baselineEvents) ? Math.max(0, Math.floor(baselineEvents)) : 0;
  const count = Math.max(0, total - baseline);
  return {
    count: Math.min(count, PR_GOAL_TARGET),
    target: PR_GOAL_TARGET,
    remaining: Math.max(0, PR_GOAL_TARGET - count),
    complete: count >= PR_GOAL_TARGET,
  };
}
