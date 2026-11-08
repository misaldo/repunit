import webpush from "npm:web-push@3.6.7";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

async function adminRest(path: string, init: RequestInit = {}) {
  const url = required("SUPABASE_URL").replace(/\/+$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  return await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}

type PushLimits = {
  quiet_hours_enabled?: boolean;
  quiet_start?: number;
  quiet_end?: number;
  timezone?: string;
  daily_push_cap?: number;
};

// True when the user's local time falls inside their quiet hours.
function isQuietNow(limits: PushLimits | null | undefined): boolean {
  if (!limits?.quiet_hours_enabled) return false;
  let hour = new Date().getUTCHours();
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: limits.timezone || "UTC",
    }).format(new Date());
    hour = Number(formatted) % 24;
  } catch {
    // Invalid time zone: fall back to UTC.
  }
  const start = Number(limits.quiet_start ?? 22);
  const end = Number(limits.quiet_end ?? 8);
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const expectedSecret = required("PUSH_WEBHOOK_SECRET");
  if (request.headers.get("x-repunit-webhook-secret") !== expectedSecret) {
    return json({ error: "Unauthorized webhook." }, 401);
  }

  try {
    const payload = await request.json();
    const notification = payload?.record;
    if (payload?.type !== "INSERT" || payload?.table !== "notifications" || !notification?.user_id) {
      return json({ ignored: true });
    }

    const result = await adminRest(
      `push_subscriptions?user_id=eq.${encodeURIComponent(notification.user_id)}&select=id,endpoint,p256dh,auth`,
    );
    if (!result.ok) return json({ error: "Could not load push subscriptions." }, 500);
    const subscriptions = await result.json();
    if (!subscriptions?.length) return json({ sent: 0 });

    // Respect the user's quiet hours and daily push cap. The in-app
    // notification is already stored, so skipping a push loses nothing.
    const userFilter = encodeURIComponent(notification.user_id);
    const limitsResult = await adminRest(
      `notification_preferences?user_id=eq.${userFilter}&select=quiet_hours_enabled,quiet_start,quiet_end,timezone,daily_push_cap`,
    );
    const limits: PushLimits | null = limitsResult.ok ? ((await limitsResult.json())?.[0] ?? null) : null;
    if (isQuietNow(limits)) return json({ sent: 0, skipped: "quiet_hours" });

    const cap = Math.min(20, Math.max(1, Number(limits?.daily_push_cap ?? 3)));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await adminRest(
      `push_deliveries?user_id=eq.${userFilter}&sent_at=gte.${encodeURIComponent(since)}&select=id&limit=${cap}`,
    );
    if (recent.ok && ((await recent.json()) as unknown[]).length >= cap) {
      return json({ sent: 0, skipped: "daily_cap" });
    }

    webpush.setVapidDetails(
      required("VAPID_SUBJECT"),
      required("VAPID_PUBLIC_KEY"),
      required("VAPID_PRIVATE_KEY"),
    );

    const message = JSON.stringify({
      title: notification.title || "REPUNIT",
      body: notification.body || "New activity from your training crew.",
      url: typeof notification.href === "string" && notification.href.startsWith("/") ? notification.href : "/leaderboards",
      tag: notification.id,
    });

    const results = await Promise.all(subscriptions.map(async (subscription: any) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, message);
        return true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminRest(`push_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, { method: "DELETE" });
        }
        return false;
      }
    }));
    const delivered = results.filter(Boolean).length;
    if (delivered > 0) {
      // One row per notification (not per device) counts toward the daily cap.
      await adminRest("push_deliveries", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: notification.user_id }),
      });
    }
    return json({ sent: delivered, total: subscriptions.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Push delivery failed." }, 500);
  }
});
