import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Privacy — REPUNIT" }, { name: "description", content: "How REPUNIT handles your data (draft)." }, { property: "og:title", content: "Privacy — REPUNIT" }, { property: "og:description", content: "Privacy policy." }] }),
  component: () => (
    <PageShell>
      <h1 className="text-4xl font-bold">Privacy policy</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Draft — requires legal review for GDPR. We store your email, username, profile and lifts. Lift videos are private and only visible to signed-in users. Only your username, avatar and lifts appear publicly.</p>
    </PageShell>
  ),
});
