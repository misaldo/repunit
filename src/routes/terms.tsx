import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-shell";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — REPUNIT" }, { name: "description", content: "REPUNIT terms of use (draft)." }, { property: "og:title", content: "Terms — REPUNIT" }, { property: "og:description", content: "Terms of use." }] }),
  component: () => (
    <PageShell>
      <h1 className="text-4xl font-bold">Terms of use</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Draft — requires legal review before launch. Be respectful, submit only your own lifts, and don't upload content you don't have rights to. We may remove abusive content or accounts.</p>
    </PageShell>
  ),
});
