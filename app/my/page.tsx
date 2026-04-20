"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { TEAMS, findTeam } from "@/lib/teams";

const STORAGE_KEY = "kbo-my-team";
const ease = [0.22, 1, 0.36, 1] as const;

export default function MyPage() {
  const [selected, setSelected] = useState<string>("doosan");

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v) setSelected(v);
    } catch {}
  }, []);

  const choose = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  const team = useMemo(() => findTeam(selected), [selected]);

  return (
    <section className="flex min-h-dvh flex-col">
      {/* 미니멀 라벨 */}
      <header className="px-7 pt-7">
        <p
          className="text-[10px] uppercase tracking-[0.32em] text-white/45"
          style={{ fontWeight: 600 }}
        >
          Profile
        </p>
      </header>

      {/* 선택 팀 히어로 — 팀 컬러 글로우 */}
      <div className="relative mx-7 mt-6 overflow-hidden rounded-[28px] bg-white/[0.03] px-7 py-9">
        <motion.div
          key={team.id + "-glow"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 0.7, ease }}
          className="pointer-events-none absolute -left-1/4 -top-1/3 h-[260px] w-[260px] rounded-full blur-3xl"
          style={{ backgroundColor: team.accent }}
        />
        <div className="relative">
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
                className="mt-2 text-[42px] leading-[0.9] tracking-tightest text-white"
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
        </div>
      </div>

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
