export type AppEnv = "production" | "alpha" | "development";

function normalizeEnv(raw: string | undefined): AppEnv {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "alpha" || value === "staging") return "alpha";
  if (value === "prod" || value === "production") return "production";
  return "development";
}

export function resolveServerAppEnv(): AppEnv {
  return normalizeEnv(process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV);
}

export function isAlphaServerEnv(): boolean {
  return resolveServerAppEnv() === "alpha";
}

function hasValidCronAuth(url: URL, req?: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req?.headers.get("authorization");
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export function shouldSkipCronInAlpha(url: URL, req?: Request): boolean {
  if (!isAlphaServerEnv()) return false;
  const force = (url.searchParams.get("force") ?? "").toLowerCase();
  if (force === "1" || force === "true" || force === "yes") return false;
  return !hasValidCronAuth(url, req);
}
