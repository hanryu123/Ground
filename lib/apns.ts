import http2 from "node:http2";
import { sign } from "node:crypto";

type ApnsResult = {
  ok: number;
  failed: string[];
};

export type LiveActivityContentState = {
  phase: "PRE" | "LIVE" | "FINAL" | "CANCEL";
  status: string;
  inning: string;
  homeScore: number;
  awayScore: number;
  resultLabel?: string | null;
  winningPitcher?: string | null;
  losingPitcher?: string | null;
  updatedAtEpochMs: number;
};

export type ApnsConfigStatus = {
  configured: boolean;
  keyIdSet: boolean;
  teamIdSet: boolean;
  privateKeySet: boolean;
  privateKeyLooksLikeP8: boolean;
  topic: string;
  environment: "development" | "production";
  host: string;
};

let cachedJwt: { value: string; issuedAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function getApnsConfig() {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.trim();
  const topic = process.env.APNS_BUNDLE_ID?.trim() || "com.ground.kbo";
  const environment = process.env.APNS_ENV?.trim() === "development" ? "development" : "production";

  if (!keyId || !teamId || !privateKey) {
    throw new Error("APNS_KEY_ID, APNS_TEAM_ID, and APNS_PRIVATE_KEY must be set");
  }

  return {
    keyId,
    teamId,
    privateKey: normalizePrivateKey(privateKey),
    topic,
    host: environment === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
  };
}

export function getApnsConfigStatus(): ApnsConfigStatus {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.trim();
  const topic = process.env.APNS_BUNDLE_ID?.trim() || "com.ground.kbo";
  const environment = process.env.APNS_ENV?.trim() === "development" ? "development" : "production";
  const normalizedKey = privateKey ? normalizePrivateKey(privateKey) : "";

  return {
    configured: Boolean(keyId && teamId && privateKey),
    keyIdSet: Boolean(keyId),
    teamIdSet: Boolean(teamId),
    privateKeySet: Boolean(privateKey),
    privateKeyLooksLikeP8:
      normalizedKey.includes("BEGIN PRIVATE KEY") && normalizedKey.includes("END PRIVATE KEY"),
    topic,
    environment,
    host: environment === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
  };
}

function createJwt(): string {
  const config = getApnsConfig();
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 45 * 60) {
    return cachedJwt.value;
  }

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  cachedJwt = { value: `${signingInput}.${base64url(signature)}`, issuedAt: now };
  return cachedJwt.value;
}

function safeReason(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { reason?: string };
    return parsed.reason;
  } catch {
    return body.slice(0, 120);
  }
}

function sendApnsRequest(input: {
  client: http2.ClientHttp2Session;
  token: string;
  jwt: string;
  topic: string;
  payload: Buffer;
}): Promise<{ ok: boolean; disable: boolean; status: number; reason?: string }> {
  return new Promise((resolve) => {
    const req = input.client.request({
      ":method": "POST",
      ":path": `/3/device/${input.token}`,
      authorization: `bearer ${input.jwt}`,
      "apns-topic": input.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";

    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("error", (error) => {
      resolve({ ok: false, disable: false, status, reason: error.message });
    });
    req.on("end", () => {
      const reason = body ? safeReason(body) : undefined;
      resolve({
        ok: status >= 200 && status < 300,
        disable: status === 410 || reason === "BadDeviceToken" || reason === "Unregistered",
        status,
        reason,
      });
    });
    req.end(input.payload);
  });
}

function sendApnsBackgroundRequest(input: {
  client: http2.ClientHttp2Session;
  token: string;
  jwt: string;
  topic: string;
  payload: Buffer;
}): Promise<{ ok: boolean; disable: boolean; status: number; reason?: string }> {
  return new Promise((resolve) => {
    const req = input.client.request({
      ":method": "POST",
      ":path": `/3/device/${input.token}`,
      authorization: `bearer ${input.jwt}`,
      "apns-topic": input.topic,
      "apns-push-type": "background",
      "apns-priority": "5",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";

    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("error", (error) => {
      resolve({ ok: false, disable: false, status, reason: error.message });
    });
    req.on("end", () => {
      const reason = body ? safeReason(body) : undefined;
      resolve({
        ok: status >= 200 && status < 300,
        disable: status === 410 || reason === "BadDeviceToken" || reason === "Unregistered",
        status,
        reason,
      });
    });
    req.end(input.payload);
  });
}

function sendApnsLiveActivityRequest(input: {
  client: http2.ClientHttp2Session;
  token: string;
  jwt: string;
  topic: string;
  payload: Buffer;
}): Promise<{ ok: boolean; disable: boolean; status: number; reason?: string }> {
  return new Promise((resolve) => {
    const req = input.client.request({
      ":method": "POST",
      ":path": `/3/device/${input.token}`,
      authorization: `bearer ${input.jwt}`,
      "apns-topic": `${input.topic}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";

    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("error", (error) => {
      resolve({ ok: false, disable: false, status, reason: error.message });
    });
    req.on("end", () => {
      const reason = body ? safeReason(body) : undefined;
      resolve({
        ok: status >= 200 && status < 300,
        disable: status === 410 || reason === "BadDeviceToken" || reason === "Unregistered",
        status,
        reason,
      });
    });
    req.end(input.payload);
  });
}

export async function sendApnsMulticast(input: {
  tokens: string[];
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}): Promise<ApnsResult> {
  if (input.tokens.length === 0) return { ok: 0, failed: [] };

  const config = getApnsConfig();
  const jwt = createJwt();
  const payload = Buffer.from(JSON.stringify({
    aps: {
      alert: { title: input.title, body: input.body },
      badge: 1,
      sound: "default",
    },
    url: input.url ?? "/",
    ...(input.data ?? {}),
  }));

  const client = http2.connect(`https://${config.host}`);
  const failed: string[] = [];
  let ok = 0;

  try {
    for (const token of input.tokens) {
      const result = await sendApnsRequest({
        client,
        token,
        jwt,
        topic: config.topic,
        payload,
      });

      if (result.ok) {
        ok += 1;
      } else if (result.disable) {
        failed.push(token);
      } else {
        console.warn("[apns] delivery failed", {
          status: result.status,
          reason: result.reason,
          tokenPrefix: token.slice(0, 8),
        });
      }
    }
  } finally {
    client.close();
  }

  return { ok, failed };
}

export async function sendApnsSilentMulticast(input: {
  tokens: string[];
  payload: Record<string, unknown>;
}): Promise<ApnsResult> {
  if (input.tokens.length === 0) return { ok: 0, failed: [] };

  const config = getApnsConfig();
  const jwt = createJwt();
  const payload = Buffer.from(JSON.stringify({
    aps: { "content-available": 1 },
    ...input.payload,
  }));

  const client = http2.connect(`https://${config.host}`);
  const failed: string[] = [];
  let ok = 0;

  try {
    for (const token of input.tokens) {
      const result = await sendApnsBackgroundRequest({
        client,
        token,
        jwt,
        topic: config.topic,
        payload,
      });

      if (result.ok) {
        ok += 1;
      } else if (result.disable) {
        failed.push(token);
      } else {
        console.warn("[apns-silent] delivery failed", {
          status: result.status,
          reason: result.reason,
          tokenPrefix: token.slice(0, 8),
          host: config.host,
        });
      }
    }
  } finally {
    client.close();
  }

  return { ok, failed };
}

export async function sendLiveActivityUpdate(input: {
  tokens: string[];
  event: "update" | "end";
  contentState: LiveActivityContentState;
  staleDateMs?: number | null;
  dismissalDateMs?: number | null;
}): Promise<ApnsResult> {
  if (input.tokens.length === 0) return { ok: 0, failed: [] };

  const config = getApnsConfig();
  const jwt = createJwt();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = {
    timestamp: nowSeconds,
    event: input.event,
    "content-state": input.contentState,
  };

  if (input.event === "update") {
    aps["stale-date"] = Math.floor((input.staleDateMs ?? Date.now() + 60_000) / 1000);
  } else if (input.dismissalDateMs) {
    aps["dismissal-date"] = Math.floor(input.dismissalDateMs / 1000);
  }

  const payload = Buffer.from(JSON.stringify({ aps }));
  const client = http2.connect(`https://${config.host}`);
  const failed: string[] = [];
  let ok = 0;

  try {
    for (const token of input.tokens) {
      const result = await sendApnsLiveActivityRequest({
        client,
        token,
        jwt,
        topic: config.topic,
        payload,
      });

      if (result.ok) {
        ok += 1;
      } else if (result.disable) {
        failed.push(token);
      } else {
        console.warn("[apns-live-activity] delivery failed", {
          status: result.status,
          reason: result.reason,
          tokenPrefix: token.slice(0, 8),
          event: input.event,
          host: config.host,
        });
      }
    }
  } finally {
    client.close();
  }

  return { ok, failed };
}

export async function sendApnsDebug(input: {
  token: string;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}): Promise<{
  ok: boolean;
  disable: boolean;
  status: number;
  reason?: string;
  host: string;
  topic: string;
}> {
  const config = getApnsConfig();
  const jwt = createJwt();
  const payload = Buffer.from(JSON.stringify({
    aps: {
      alert: { title: input.title, body: input.body },
      badge: 1,
      sound: "default",
    },
    url: input.url ?? "/",
    ...(input.data ?? {}),
  }));

  const client = http2.connect(`https://${config.host}`);
  try {
    const result = await sendApnsRequest({
      client,
      token: input.token,
      jwt,
      topic: config.topic,
      payload,
    });
    return {
      ...result,
      host: config.host,
      topic: config.topic,
    };
  } finally {
    client.close();
  }
}
