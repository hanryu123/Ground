"use client";

import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";

type Status = "idle" | "sending" | "done" | "error";

/**
 * /download — Android 출시 알림 이메일 신청.
 * Android 기기면 처음부터 펼쳐 두고, 그 외(iPhone·PC)는 "Android 출시 알림 받기"를 눌러야 펼친다.
 */
export default function AndroidWaitlistForm({
  defaultOpen = false,
  align = "start",
  placement,
}: {
  defaultOpen?: boolean;
  align?: "start" | "center";
  /** 분석용 — 페이지 어느 자리의 폼인지 */
  placement: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-white/45 underline-offset-4 transition hover:text-white/75 hover:underline"
      >
        <AndroidGlyph /> Android는 준비 중이에요 · 출시 알림 받기
      </button>
    );
  }

  if (status === "done") {
    return (
      <div className={`flex flex-col gap-1 ${alignClass}`}>
        <p className="text-[15px] font-semibold text-white">신청 완료! Android 나오면 바로 알려 드릴게요 🙌</p>
        <p className="text-sm text-white/45">{email}</p>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/android-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, honeypot, source: `${placement}${window.location.search}` }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("done");
      track("android_waitlist_signup", { placement });
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className={`flex w-full max-w-md flex-col gap-2.5 ${alignClass}`}>
      <p className="flex items-center gap-1.5 text-[15px] font-semibold text-white/85">
        <AndroidGlyph /> Android 출시되면 알려 드릴게요
      </p>
      <div className="flex w-full gap-2">
        <input
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
        />
        {/* 사람에게는 안 보이는 칸 — 봇 걸러내기 */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="absolute h-0 w-0 opacity-0"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="shrink-0 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-black transition active:scale-95 disabled:opacity-60"
        >
          {status === "sending" ? "신청 중…" : "알림 받기"}
        </button>
      </div>
      {status === "error" ? (
        <p className="text-sm text-[#ff7a7a]">신청이 안 됐어요. 이메일을 확인하고 다시 눌러 주세요.</p>
      ) : (
        <p className="text-xs leading-relaxed text-white/40">
          Android 출시 안내 메일 한 번에만 쓰고, 보낸 뒤 바로 지워요.{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-white/70">
            개인정보 처리방침
          </a>
        </p>
      )}
    </form>
  );
}

function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 00-.66-.38l-1.86 3.22a11.4 11.4 0 00-9.84 0L5.22 5.92a.38.38 0 10-.66.38L6.4 9.48A10.78 10.78 0 001 18h22a10.78 10.78 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}
