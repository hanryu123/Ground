"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, User } from "lucide-react";
import { motion } from "framer-motion";

const TABS = [
  { href: "/today", label: "TODAY", Icon: Home },
  { href: "/schedule", label: "SCHEDULE", Icon: CalendarDays },
  { href: "/my", label: "MY", Icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* 위쪽으로 자연스럽게 사라지는 그라데이션 (라인 대신) */}
      <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-black to-transparent" />
      <div className="bg-black/85 backdrop-blur-2xl">
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-6 pb-6 pt-3 safe-pb">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className="relative flex flex-col items-center justify-center py-2"
                >
                  <motion.div
                    animate={{
                      scale: active ? 1 : 0.95,
                      opacity: active ? 1 : 0.55,
                    }}
                    transition={{ type: "spring", stiffness: 360, damping: 26 }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <Icon
                      size={22}
                      strokeWidth={active ? 2.2 : 1.7}
                      className="text-white"
                    />
                    <span
                      className="text-[9.5px] tracking-[0.22em] text-white"
                      style={{ fontWeight: active ? 700 : 400 }}
                    >
                      {label}
                    </span>
                  </motion.div>
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                      className="absolute -top-1 h-[3px] w-7 rounded-full bg-white"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
