import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Android 출시 알림 신청 — /download 의 이메일 칸.
 *
 *  POST { email, source?, honeypot? } → 저장 (같은 이메일은 한 번만)
 *  GET  ?key=ADMIN_SECRET[&format=csv] → 신청 목록 (출시 날 숨은참조로 한 번 보내고 지운다)
 *  DELETE ?key=ADMIN_SECRET&email=... (또는 &all=1) → 삭제
 *
 *  테이블은 Prisma 스키마 밖에서 처음 쓸 때 만든다 (lib/llmBudget 와 같은 이유 — 로컬에서 운영 DB 마이그레이션 불가).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  tableReady ??= prisma
    .$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "AndroidWaitlist" (
        "email" TEXT PRIMARY KEY,
        "source" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    )
    .then(() => {})
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

export async function POST(req: Request) {
  let body: { email?: unknown; source?: unknown; honeypot?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  // 봇이 채우는 숨은 칸 — 채워져 있으면 저장하지 않고 성공처럼 답한다
  if (typeof body.honeypot === "string" && body.honeypot) return NextResponse.json({ ok: true });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  const source = typeof body.source === "string" ? body.source.slice(0, 200) : null;

  try {
    await ensureTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AndroidWaitlist" ("email", "source") VALUES ($1, $2) ON CONFLICT ("email") DO NOTHING`,
      email,
      source
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[android-waitlist] save failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

function isAuthorized(req: Request, url: URL): boolean {
  const secrets = [process.env.ADMIN_SECRET, process.env.ADMIN_PASSWORD].filter((v): v is string => Boolean(v));
  const auth = req.headers.get("authorization");
  const key = url.searchParams.get("key");
  return secrets.some((s) => auth === `Bearer ${s}` || key === s);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ email: string; source: string | null; createdAt: Date }>>(
    `SELECT "email", "source", "createdAt" FROM "AndroidWaitlist" ORDER BY "createdAt"`
  );
  const headers = { "Cache-Control": "no-store" };
  if (url.searchParams.get("format") === "csv") {
    const csv = ["email,source,createdAt", ...rows.map((r) => `${r.email},${r.source ?? ""},${r.createdAt.toISOString()}`)].join("\n");
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  return NextResponse.json({ ok: true, count: rows.length, items: rows }, { headers });
}

/** DELETE ?key=ADMIN_SECRET&email=... — 삭제 요청 처리, 발송 후 전체 삭제는 &all=1 */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureTable();
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const deleted = email
    ? await prisma.$executeRawUnsafe(`DELETE FROM "AndroidWaitlist" WHERE "email" = $1`, email)
    : url.searchParams.get("all") === "1"
      ? await prisma.$executeRawUnsafe(`DELETE FROM "AndroidWaitlist"`)
      : 0;
  return NextResponse.json({ ok: true, deleted });
}
