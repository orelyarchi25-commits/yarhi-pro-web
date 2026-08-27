import { NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase/server";
import { appUrl, getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "missing_price" }, { status: 500 });
  }

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: profile?.stripe_customer_id || undefined,
    customer_email: profile?.stripe_customer_id ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl()}/app?upgraded=1`,
    cancel_url: `${appUrl()}/app?upgrade=cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
