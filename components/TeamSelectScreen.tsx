"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { TEAMS } from "@/lib/teams";
import { setMyTeam } from "@/lib/useMyTeam";
import LogoImage from "./LogoImage";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * TeamSelectScreen — 첫 진입 시 무조건 띄우는 풀스크린 팀 선택.
 *
 * Apple-스럽게 매우 단정한 비주얼:
 *   - 블랙 배경, 얇은 Serif 이탤릭 타이틀("Choose Your Team")
 *   - 세로 리스트: [실제 로고] · [팀명 / 연고지] · [라디오]
 *   - 항목 자체 클릭으로 선택 → 팀 컬러 글로우 강조
 *   - 선택 직후 짧은 체크 애니메이션을 보여준 뒤 setMyTeam 커밋
 *     (today/page에서 hasChosen 변화를 감지하고 화면을 fade out)
 */
export default function TeamSelectScreen() {
  // 낙관적 선택 표시 — 실제 영속(setMyTeam)은 짧은 딜레이 후
  const [pickedId, setPickedId] = useState<string | null>(null);

  const choose = (id: string) => {
    if (pickedId) return; // 중복 클릭 방지
    setPickedId(id);
    // 라디오 체크 애니메이션이 보일 시간을 살짝 준 뒤 커밋 → fade out 트리거
    window.setTimeout(() => {
      setMyTeam(id);
    }, 240);
  };

  return (
    <div className="flex h-dvh flex-col bg-black">
      {/* 헤더 */}
      <header className="px-7 pt-12 pb-5">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="text-[10px] uppercase tracking-[0.42em] text-white/40"
          style={{ fontWeight: 600 }}
        >
          Welcome
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.05 }}
          className="mt-3 text-white"
          style={{
            fontFamily:
              '"Cormorant Garamond", "EB Garamond", Georgia, "Times New Roman", serif',
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 34,
            lineHeight: 1.05,
            letterSpacing: "0.14em",
          }}
        >
          Choose Your Team
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease, delay: 0.18 }}
          className="mt-3 text-[12px] tracking-wide text-white/45"
          style={{ fontWeight: 400 }}
        >
          응원할 팀을 선택하면 곧바로 시작됩니다.
        </motion.p>
      </header>

      {/* 리스트 */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-24">
        <ul className="flex flex-col">
          {TEAMS.map((t, i) => {
            const active = pickedId === t.id;
            const dim = pickedId !== null && !active;

            return (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: dim ? 0.25 : 1,
                  y: 0,
                }}
                transition={{ duration: 0.45, ease, delay: i * 0.035 }}
              >
                <button
                  type="button"
                  onClick={() => choose(t.id)}
                  aria-pressed={active}
                  className="relative flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors active:opacity-70"
                  style={{
                    backgroundColor: active
                      ? `${t.accent}1f` // ~12% 알파
                      : "transparent",
                  }}
                >
                  {/* 활성 보더 + 글로우 */}
                  {active && (
                    <motion.span
                      layoutId="team-select-active"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                      className="pointer-events-none absolute inset-0 rounded-2xl"
                      style={{
                        border: `1px solid ${t.accent}80`,
                        boxShadow: `0 0 32px ${t.accent}40, inset 0 0 24px ${t.accent}1a`,
                      }}
                    />
                  )}

                  {/* 로고 */}
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                    <LogoImage
                      teamId={t.id}
                      alt={t.nameEn}
                      size={48}
                      priority
                      className="h-12 w-12"
                      style={{
                        filter: active
                          ? `drop-shadow(0 0 14px ${t.accent}cc)`
                          : "drop-shadow(0 1px 4px rgba(0,0,0,0.5))",
                        transition: "filter 0.25s",
                      }}
                    />
                  </span>

                  {/* 팀명 + 연고지 */}
                  <span className="relative flex min-w-0 flex-1 flex-col">
                    <span
                      className="text-[16px] tracking-tight text-white"
                      style={{ fontWeight: active ? 800 : 600 }}
                    >
                      {t.name}
                    </span>
                    <span
                      className="mt-0.5 text-[11.5px] tracking-wide text-white/45"
                      style={{ fontWeight: 400 }}
                    >
                      {t.city}
                    </span>
                  </span>

                  {/* 라디오 */}
                  <Radio active={active} accent={t.accent} />
                </button>

                {/* 디바이더 */}
                {i < TEAMS.length - 1 && (
                  <div className="ml-[68px] h-px bg-white/[0.05]" />
                )}
              </motion.li>
            );
          })}
        </ul>

        <p
          className="mt-8 text-center text-[10px] uppercase tracking-[0.3em] text-white/25"
          style={{ fontWeight: 500 }}
        >
          나중에 언제든 변경할 수 있어요
        </p>
      </div>
    </div>
  );
}

function Radio({ active, accent }: { active: boolean; accent: string }) {
  return (
    <motion.span
      animate={{
        backgroundColor: active ? accent : "rgba(255,255,255,0)",
        borderColor: active ? accent : "rgba(255,255,255,0.22)",
        scale: active ? 1.08 : 1,
      }}
      transition={{ duration: 0.2, ease }}
      className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
      style={{ borderWidth: 1.5, borderStyle: "solid" }}
    >
      {active && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          className="inline-flex"
        >
          <Check size={13} strokeWidth={3} className="text-white" />
        </motion.span>
      )}
    </motion.span>
  );
}
