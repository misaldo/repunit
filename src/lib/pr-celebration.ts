export function getPrRankMessage(previousRank: number | null, newRank: number | null): string {
  if (newRank === null || !Number.isFinite(newRank) || newRank < 1) {
    return "Your new PR is on REPUNIT.";
  }
  if (previousRank === null || !Number.isFinite(previousRank) || previousRank < 1) {
    return `You entered the leaderboard at #${newRank}.`;
  }
  if (newRank < previousRank) {
    return `You moved from #${previousRank} to #${newRank}.`;
  }
  if (newRank === previousRank) {
    return `You held your #${newRank} spot.`;
  }
  return `Your current rank is #${newRank}.`;
}
