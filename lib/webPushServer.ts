import webpush from "web-push";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:ops@ground.local";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendWebPush(
  subscription: StoredSubscription,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; statusCode?: number; body?: string }> {
  if (!ensureConfigured()) {
    return { ok: false, body: "vapid_not_configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      {
        TTL: 60 * 10,
        urgency: "normal",
      }
    );
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; stack?: string };
    console.error("[web-push] delivery failed", {
      statusCode: err.statusCode,
      body: err.body,
      endpoint: subscription.endpoint,
      stack: err.stack,
    });
    return { ok: false, statusCode: err.statusCode, body: err.body };
  }
}
