const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

async function stripeRequest(path: string, params: URLSearchParams) {
  const secret = required("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message ?? "Stripe request failed.";
    throw new Error(message);
  }
  return payload;
}

function safeAppUrl() {
  const configured = required("APP_URL");
  return configured.replace(/\/+$/, "");
}

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in to continue.");
  const url = required("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = required("SUPABASE_ANON_KEY");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Your session is invalid or has expired. Sign in again.");
  return await response.json() as { id: string; email?: string };
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

function equalHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = required("STRIPE_WEBHOOK_SECRET");
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => equalHex(signature, expected));
}

async function handleWebhook(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyWebhook(rawBody, request.headers.get("Stripe-Signature")))) {
    return json({ error: "Invalid Stripe signature." }, 400);
  }

  const event = JSON.parse(rawBody);
  const object = event?.data?.object;
  if (!object) return json({ received: true });

  if (event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted") {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    let userId = object.metadata?.supabase_user_id as string | undefined;

    if (!userId && customerId) {
      const lookup = await adminRest(`user_subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id`);
      if (lookup.ok) {
        const rows = await lookup.json();
        userId = rows?.[0]?.user_id;
      }
    }
    if (!userId) return json({ received: true, ignored: "No REPUNIT user metadata found." });

    const item = object.items?.data?.[0];
    const row = {
      user_id: userId,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: object.id ?? null,
      status: event.type === "customer.subscription.deleted" ? "canceled" : (object.status ?? "inactive"),
      price_id: item?.price?.id ?? null,
      current_period_end: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(object.cancel_at_period_end),
      updated_at: new Date().toISOString(),
    };
    const saved = await adminRest("user_subscriptions?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    if (!saved.ok) return json({ error: "Could not update REPUNIT subscription state." }, 500);
  }
  return json({ received: true });
}

async function handleUserAction(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = await request.json().catch(() => ({})) as { action?: string; plan?: string };
  const appUrl = safeAppUrl();
  const existingResponse = await adminRest(`user_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=status,stripe_customer_id`);
  if (!existingResponse.ok) throw new Error("Could not read subscription status. Apply migration 0018 first.");
  const existingRows = await existingResponse.json();
  const existing = existingRows?.[0];

  if (body.action === "portal") {
    if (!existing?.stripe_customer_id) throw new Error("No Stripe customer is linked to this account yet.");
    const params = new URLSearchParams({ customer: existing.stripe_customer_id, return_url: `${appUrl}/pricing` });
    const session = await stripeRequest("billing_portal/sessions", params);
    return json({ url: session.url });
  }

  if (body.action !== "checkout" || !["monthly", "yearly"].includes(body.plan ?? "")) {
    return json({ error: "Choose a valid subscription plan." }, 400);
  }
  if (["active", "trialing"].includes(existing?.status)) {
    return json({ error: "You already have REPUNIT PRO. Use Manage subscription instead." }, 409);
  }

  const priceId = required(body.plan === "yearly" ? "STRIPE_PRICE_YEARLY" : "STRIPE_PRICE_MONTHLY");
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${appUrl}/pricing?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,
    client_reference_id: user.id,
    "metadata[supabase_user_id]": user.id,
    "subscription_data[metadata][supabase_user_id]": user.id,
    allow_promotion_codes: "true",
  });
  if (existing?.stripe_customer_id) params.set("customer", existing.stripe_customer_id);
  else if (user.email) params.set("customer_email", user.email);

  const session = await stripeRequest("checkout/sessions", params);
  return json({ url: session.url });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    if (request.headers.has("Stripe-Signature")) return await handleWebhook(request);
    return await handleUserAction(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Stripe error.";
    return json({ error: message }, 400);
  }
});
