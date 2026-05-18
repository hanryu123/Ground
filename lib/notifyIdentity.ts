import { prisma } from "@/lib/prisma";

function sanitizeUserId(raw: string): string {
  const v = raw.trim().toLowerCase();
  const safe = v.replace(/[^a-z0-9-_]/g, "");
  return safe || "anonymous-web";
}

export function resolveNotifyUserId(headerValue: string | null): string {
  if (!headerValue) return "anonymous-web";
  return sanitizeUserId(headerValue);
}

type EnsureUserOptions = {
  favoriteTeam?: string | null;
};

export async function ensureNotifyUser(userId: string, options?: EnsureUserOptions) {
  const favoriteTeam = options?.favoriteTeam?.trim().toLowerCase() || null;
  await prisma.user.upsert({
    where: { id: userId },
    update: favoriteTeam ? { favoriteTeam } : {},
    create: {
      id: userId,
      name: "web-user",
      favoriteTeam,
    },
  });
}
