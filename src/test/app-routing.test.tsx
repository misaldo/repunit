import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches shared crew invitations with their code", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/invite/abc123");
    expect(matches.at(-1)?.routeId).toBe("/invite/$code");
    expect(matches.at(-1)?.params).toMatchObject({ code: "abc123" });
  });
  it("matches the authenticated social feed route", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/feed");
    expect(matches.at(-1)?.routeId).toBe("/_authenticated/feed");
  });
  it("matches every destination in the five-tab mobile navigation", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const destinations = [
      ["/leaderboards", "/leaderboards"],
      ["/battles", "/_authenticated/battles/"],
      ["/records/new", "/_authenticated/records/new"],
      ["/workouts", "/_authenticated/workouts"],
      ["/u/example", "/u/$username"],
    ] as const;

    for (const [path, expectedRouteId] of destinations) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId, path).toBe(expectedRouteId);
    }
  });

  it("keeps crews, challenges and notifications reachable", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const destinations = [
      ["/crews", "/_authenticated/crews/"],
      ["/challenges", "/_authenticated/challenges"],
      ["/notifications", "/_authenticated/notifications"],
    ] as const;

    for (const [path, expectedRouteId] of destinations) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId, path).toBe(expectedRouteId);
    }
  });

  it("keeps the restored Feed and crew creation routes reachable", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/feed").at(-1)?.routeId).toBe("/_authenticated/feed");
    expect(router.matchRoutes("/crews/new").at(-1)?.routeId).toBe("/_authenticated/crews/new");
  });

  it("keeps settings, pricing and lifter discovery reachable", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/settings").at(-1)?.routeId).toBe("/_authenticated/settings");
    expect(router.matchRoutes("/pricing").at(-1)?.routeId).toBe("/pricing");
    expect(router.matchRoutes("/people").at(-1)?.routeId).toBe("/_authenticated/people");
  });

  it("keeps battle details and lift evidence routes reachable", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/battles/example").at(-1)?.routeId).toBe("/_authenticated/battles/$id");
    expect(router.matchRoutes("/records/example").at(-1)?.routeId).toBe("/_authenticated/records/$id");
  });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
