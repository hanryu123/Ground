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

export const DEFAULT_PUSH_ICON = "/icons/icon-192x192.png";
export const DEFAULT_PUSH_BADGE = "/icons/badge-monochrome.png";

function normalizeTeamKey(team: string | null | undefined): string | null {
  if (!team) return null;
  const normalized = team.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const aliasMap: Record<string, string> = {
    lg: "lg",
    "lg twins": "lg",
    "lg트윈스": "lg",
    엘지: "lg",
    doosan: "doosan",
    "doosan bears": "doosan",
    두산: "doosan",
    kia: "kia",
    "kia tigers": "kia",
    기아: "kia",
    hanwha: "hanwha",
    "hanwha eagles": "hanwha",
    한화: "hanwha",
    kiwoom: "kiwoom",
    "kiwoom heroes": "kiwoom",
    키움: "kiwoom",
    lotte: "lotte",
    "lotte giants": "lotte",
    롯데: "lotte",
    nc: "nc",
    "nc dinos": "nc",
    엔씨: "nc",
    ssg: "ssg",
    "ssg landers": "ssg",
    삼성: "samsung",
    samsung: "samsung",
    "samsung lions": "samsung",
    kt: "kt",
    "kt wiz": "kt",
  };

  return aliasMap[normalized] ?? normalized;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function resolveTeamLogo(
  team: string | null | undefined,
  options?: { baseUrl?: string | null }
): string {
  const key = normalizeTeamKey(team);
  const encodedTeam = encodeURIComponent(key ?? "default");
  const baseUrl = options?.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? null;
  if (!baseUrl) return `/api/push-icon?team=${encodedTeam}`;
  return `${normalizeBaseUrl(baseUrl)}/api/push-icon?team=${encodedTeam}`;
}

type WebPushPayload = Record<string, unknown> & {
  icon?: string;
  badge?: string;
  teamId?: string;
  favoriteTeam?: string;
};

export async function sendWebPush(
  subscription: StoredSubscription,
  payload: WebPushPayload,
  options?: { favoriteTeam?: string | null; origin?: string | null }
): Promise<{ ok: boolean; statusCode?: number; body?: string }> {
  if (!ensureConfigured()) {
    return { ok: false, body: "vapid_not_configured" };
  }

  const payloadTeam =
    options?.favoriteTeam ??
    (typeof payload.favoriteTeam === "string"
      ? payload.favoriteTeam
      : typeof payload.teamId === "string"
        ? payload.teamId
        : null);
  const icon =
    typeof payload.icon === "string" && payload.icon.trim().length > 0
      ? payload.icon
      : resolveTeamLogo(payloadTeam, { baseUrl: options?.origin });
  const badge =
    typeof payload.badge === "string" && payload.badge.trim().length > 0
      ? payload.badge
      : DEFAULT_PUSH_BADGE;
  const enrichedPayload: WebPushPayload = {
    ...payload,
    icon,
    badge,
  };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(enrichedPayload),
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
