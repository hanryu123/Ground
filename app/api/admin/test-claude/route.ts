import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const adminSecret = req.headers.get("x-admin-secret") ?? new URL(req.url).searchParams.get("secret");
  const expected = process.env.ADMIN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!expected || adminSecret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 50,
        messages: [{ role: "user", content: "한화이글스 팬처럼 삼진 잡았을 때 단톡방 리액션 한 줄만 써줘." }],
      }),
      signal: controller.signal,
    });

    const status = res.status;
    const body = await res.text();

    if (!res.ok) {
      return NextResponse.json({ ok: false, status, error: body.slice(0, 300) });
    }

    const json = JSON.parse(body);
    const text = json?.content?.[0]?.text ?? null;
    return NextResponse.json({ ok: true, status, text, keyPrefix: apiKey.slice(0, 10) + "..." });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) });
  } finally {
    clearTimeout(timeout);
  }
}
