import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("חסר STRIPE_SECRET_KEY");
  if (!stripe) {
    stripe = new Stripe(key);
  }
  return stripe;
}

export const PREMIUM_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isPremiumStatus(status?: string | null) {
  return PREMIUM_STATUSES.has(status || "");
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");
}
