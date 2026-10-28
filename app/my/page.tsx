"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { TEAMS } from "@/lib/teams";
import { setMyTeam, useMyTeam } from "@/lib/useMyTeam";
import LiveActivityRecoveryButton from "@/components/LiveActivityRecoveryButton";
import {
  CASTER_STYLES,
  CASTER_STYLE_STORAGE_KEY,
  casterStyleSample,
  parseCasterStyle,
  type CasterStyle,
} from "@/lib/notifications/casterStyle";
import { getOrCreateNotifyUserId, saveCasterStyle } from "@/lib/webPushClient";

const ease = [0.22, 1, 0.36, 1] as const;

export default function MyPage() {
  const team = useMyTeam();
  const selected = team.id;

  const choose = (id: string) => setMyTeam(id);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-nav [-webkit-overflow-scrolling:touch]">
      {/* 미니멀 라벨 */}
      <header className="px-7 pt-7">
        <p
          className="text-[10px] uppercase tracking-[0.32em] text-white/45"
          style={{ fontWeight: 600 }}
        >
          Profile
        </p>
      </header>

      {/* 선택 팀 히어로 — 팀 컬러 글로우 (글로우만 overflow 로 클립, 텍스트는 잘리지 않게 분리) */}
      <div className="relative isolate mx-7 mt-6 rounded-[28px] bg-white/[0.03] px-7 pb-10 pt-9">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
          aria-hidden
        >
          <motion.div
            key={team.id + "-glow"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            transition={{ duration: 0.7, ease }}
            className="absolute -left-1/4 -top-1/3 h-[260px] w-[260px] rounded-full blur-3xl"
            style={{ backgroundColor: team.accent }}
          />
        </div>
        <div className="relative z-10">
          <p
            className="text-[10px] uppercase tracking-[0.3em] text-white/45"
            style={{ fontWeight: 600 }}
          >
            My Team
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease }}
            >
              <h1
                className="mt-2 text-[42px] leading-[1.08] tracking-tightest text-white"
                style={{ fontWeight: 900 }}
              >
                {team.short}
              </h1>
              <p
                className="mt-2 text-[13px] tracking-wide text-white/70"
                style={{ fontWeight: 300 }}
              >
                {team.name}
                <span className="mx-1.5 text-white/30">·</span>
                {team.city}
              </p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-7">
            <LiveActivityRecoveryButton
              teamId={team.id}
              teamShort={team.short}
              accent={team.accent}
              variant="settings"
            />
          </div>
        </div>
      </div>

      <CasterStylePicker teamId={team.id} />

      {/* 팀 선택 리스트 */}
      <div className="mt-10 flex-1 px-7">
        <p
          className="mb-4 text-[10px] uppercase tracking-[0.32em] text-white/45"
          style={{ fontWeight: 600 }}
        >
          Choose your team
        </p>

        <ul className="flex flex-col">
          {TEAMS.map((t, i) => {
            const active = selected === t.id;
            return (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease, delay: i * 0.025 }}
              >
                <button
                  onClick={() => choose(t.id)}
                  className="group flex w-full items-center justify-between py-4 text-left transition active:opacity-60"
                >
                  <div className="flex items-center gap-4">
                    <motion.span
                      animate={{
                        scale: active ? 1.05 : 1,
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] tracking-tight text-white"
                      style={{
                        backgroundColor: t.accent,
                        fontWeight: 900,
                      }}
                    >
                      {t.short}
                    </motion.span>
                    <div className="flex flex-col">
                      <span
                        className="text-[16px] tracking-tight text-white"
                        style={{ fontWeight: active ? 800 : 500 }}
                      >
                        {t.name}
                      </span>
                      <span
                        className="text-[11px] tracking-wide text-white/40"
                        style={{ fontWeight: 300 }}
                      >
                        {t.city}
                      </span>
                    </div>
                  </div>

                  <Radio active={active} />
                </button>
                {i < TEAMS.length - 1 && (
                  <div className="ml-[52px] h-px w-[calc(100%-52px)] bg-white/[0.06]" />
                )}
              </motion.li>
            );
          })}
        </ul>

        <p
          className="mt-8 text-[10px] uppercase tracking-[0.28em] text-white/30"
          style={{ fontWeight: 500 }}
        >
          한 팀만 선택할 수 있어요
        </p>
      </div>
    </section>
  );
}

/** 득점 알림 말투 — 알림 링크 /my#caster-style 로 바로 들어온다 */
function CasterStylePicker({ teamId }: { teamId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 저장된 말투를 읽기 전엔 그리지 않는다 — 기본값으로 먼저 그렸다 바꾸면 라디오 애니메이션이 중간에 멈춘다
  const [style, setStyle] = useState<CasterStyle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CASTER_STYLE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setStyle(parseCasterStyle(saved));
    // 알림 링크로 들어오면 이 칸으로 — 위쪽 카드·리스트 애니메이션이 자리 잡은 뒤에 이동
    if (window.location.hash !== "#caster-style") return;
    const timer = window.setTimeout(() => ref.current?.scrollIntoView({ block: "start" }), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const choose = async (next: CasterStyle) => {
    if (!style || next === style) return;
    const previous = style;
    setStyle(next);
    setError(null);
    try {
      await saveCasterStyle(next, getOrCreateNotifyUserId());
    } catch {
      setStyle(previous);
      setError("저장하지 못했어요. 잠시 후 다시 눌러 주세요.");
    }
  };

  return (
    <div ref={ref} id="caster-style" className="mt-10 scroll-mt-6 px-7">
      <p
        className="mb-1 text-[10px] uppercase tracking-[0.32em] text-white/45"
        style={{ fontWeight: 600 }}
      >
        Alert voice
      </p>
      <p className="mb-3 text-[12px] text-white/50">점수가 나면 이 말투로 알림이 와요.</p>
      <ul className="flex min-h-[380px] flex-col">
        {style && CASTER_STYLES.map((s, i) => {
          const active = style === s.id;
          return (
            <li key={s.id}>
              <button
                onClick={() => void choose(s.id)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left transition active:opacity-60"
                aria-pressed={active}
              >
                <div className="min-w-0">
                  <span
                    className="block text-[16px] tracking-tight text-white"
                    style={{ fontWeight: active ? 800 : 500 }}
                  >
                    {s.label}
                  </span>
                  <span className="mt-0.5 block break-keep text-[12px] leading-snug text-white/45">
                    {casterStyleSample(s.id, teamId)}
                  </span>
                </div>
                <Radio active={active} />
              </button>
              {i < CASTER_STYLES.length - 1 && <div className="h-px w-full bg-white/[0.06]" />}
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-[12px] text-[#ff8f8f]">{error}</p> : null}
    </div>
  );
}

function Radio({ active }: { active: boolean }) {
  return (
    <motion.span
      animate={{
        backgroundColor: active ? "#ffffff" : "rgba(255,255,255,0)",
        borderColor: active ? "#ffffff" : "rgba(255,255,255,0.2)",
      }}
      transition={{ duration: 0.18 }}
      className="flex h-6 w-6 items-center justify-center rounded-full border"
      style={{ borderWidth: 1.5 }}
    >
      {active && <Check size={13} strokeWidth={3} className="text-black" />}
    </motion.span>
  );
}
