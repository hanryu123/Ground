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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-4 pt-2 pb-6 safe-pb">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="relative flex flex-col items-center gap-1 py-1.5"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 1.8}
                  className={
                    active ? "text-white" : "text-ink-400"
                  }
                />
                <span
                  className={`text-[10px] font-semibold tracking-wider ${
                    active ? "text-white" : "text-ink-400"
                  }`}
                >
                  {label}
                </span>
                {active && (
                  <motion.span
                    layoutId="tab-dot"
                    className="absolute -top-1 h-1 w-1 rounded-full bg-white"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
