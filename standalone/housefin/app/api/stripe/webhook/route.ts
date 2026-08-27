import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function upsertSubscription(
  userId: string,
  customerId: string | null,
  sub: Stripe.Subscription | null
) {
  const admin = createAdminClient();
  if (customerId) {
    await admin.from("profiles").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("id", userId);
  }
  await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: sub?.id || null,
    stripe_price_id: sub?.items.data[0]?.price.id || null,
    status: sub?.status || "none",
    current_period_end: sub?.items.data[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing_webhook_secret" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;
    if (!userId) return NextResponse.json({ received: true });
    const stripe = getStripe();
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    const sub = subId ? await stripe.subscriptions.retrieve(subId) : null;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
    await upsertSubscription(userId, customerId, sub);
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null;

    if (userId) {
      await upsertSubscription(userId, customerId, event.type === "customer.subscription.deleted" ? { ...sub, status: "canceled" } : sub);
    } else if (customerId) {
      const admin = createAdminClient();
      const { data: profile } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
      if (profile?.id) {
        await upsertSubscription(
          profile.id,
          customerId,
          event.type === "customer.subscription.deleted" ? { ...sub, status: "canceled" } : sub
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
