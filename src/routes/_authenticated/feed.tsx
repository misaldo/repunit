import { createFileRoute, redirect } from "@tanstack/react-router";

// Feed has been removed from REPUNIT. Keep the old URL working by sending
// existing bookmarks directly to the Top / global rankings page.
export const Route = createFileRoute("/_authenticated/feed")({
  beforeLoad: () => {
    throw redirect({ to: "/leaderboards", replace: true });
  },
});
