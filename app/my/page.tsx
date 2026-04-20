"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { TEAMS } from "@/lib/teams";

const STORAGE_KEY = "kbo-my-team";

export default function MyPage() {
  const [selected, setSelected] = useState<string | null>("doosan");

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

  return (
    <section className="flex min-h-dvh flex-col">
      <header className="px-5 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-300">
          MY
        </p>
        <h1 className="mt-2 text-[34px] font-black leading-tight tracking-tightest text-white">
          내 응원 팀 선택
        </h1>
        <p className="mt-2 text-[13px] text-ink-300">
          한 팀만 선택할 수 있어요. 언제든 변경 가능합니다.
        </p>
      </header>

      <div className="mt-8 px-5">
        <ul className="overflow-hidden rounded-2xl bg-ink-900">
          {TEAMS.map((t, i) => {
            const active = selected === t.id;
            return (
              <li key={t.id}>
                <button
                  onClick={() => choose(t.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left active:bg-ink-800"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-black text-white"
                      style={{ backgroundColor: t.accent }}
                    >
                      {t.short}
                    </span>
                    <div>
                      <p className="text-[16px] font-semibold tracking-tight text-white">
                        {t.name}
                      </p>
                      <p className="text-[12px] text-ink-400">{t.city}</p>
                    </div>
                  </div>

                  <Radio active={active} />
                </button>
                {i < TEAMS.length - 1 && (
                  <div className="ml-[68px] h-px bg-ink-800" />
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 px-1 text-[11px] text-ink-500">
          응원 팀을 선택하면 TODAY 화면에서 해당 팀 경기가 가장 먼저 표시돼요.
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
        borderColor: active ? "#ffffff" : "#3a3a3a",
      }}
      transition={{ duration: 0.18 }}
      className="flex h-6 w-6 items-center justify-center rounded-full border-2"
    >
      {active && <Check size={14} strokeWidth={3} className="text-black" />}
    </motion.span>
  );
}
