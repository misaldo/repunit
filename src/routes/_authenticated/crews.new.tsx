import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/crews/new")({
  head: () => ({ meta: [{ title: "Create crew — REPUNIT" }, { name: "description", content: "Start a new crew." }] }),
  component: NewCrew,
});

function NewCrew() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data, error } = await supabase.from("crews").insert({
      name: String(f.get("name")).trim().slice(0, 40), description: String(f.get("description") || "").slice(0, 280) || null, owner_id: user.id,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/crews/$id", params: { id: data.id } });
  }
  return (
    <PageShell>
      <h1 className="font-stat text-6xl uppercase">Create crew</h1>
      <form onSubmit={submit} className="mt-6 max-w-md space-y-4">
        <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" minLength={2} maxLength={40} required /></div>
        <div className="space-y-1.5"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" maxLength={280} /></div>
        <Button variant="hero" className="h-12 w-full">Create</Button>
      </form>
    </PageShell>
  );
}
