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

    const quota = await adminRest("rpc/repunit_claim_push_slot", {
      method: "POST",
      body: JSON.stringify({
        _user_id: notification.user_id,
        _kind: typeof notification.kind === "string" ? notification.kind : "general",
      }),
    });
    if (!quota.ok) return json({ error: "Push delivery is temporarily unavailable." }, 503);
    const maySend = await quota.json();
    if (maySend !== true) return json({ sent: 0, skipped: true });

    const result = await adminRest(
      `push_subscriptions?user_id=eq.${encodeURIComponent(notification.user_id)}&select=id,endpoint,p256dh,auth`,
    );
    if (!result.ok) return json({ error: "Could not load push subscriptions." }, 500);
    const subscriptions = await result.json();
    if (!subscriptions?.length) return json({ sent: 0 });

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
    return json({ sent: results.filter(Boolean).length, total: subscriptions.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Push delivery failed." }, 500);
  }
});
