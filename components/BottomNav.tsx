"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ListOrdered, Ticket, UserRound } from "lucide-react";

/**
 * 하단 탭 — iOS 탭 바. 오늘 · 일정 · 순위 · MY.
 *  선택된 탭만 구단 색(--club-tint), 나머지는 시스템 회색. 아이콘·글자 모양은 iOS 기본을 따른다.
 *  흐림(backdrop-filter)은 iOS 스크롤 중 매 프레임 다시 그려져 버벅여서 거의 불투명한 바로 대신한다.
 */
const TABS = [
  { href: "/today", label: "오늘", Icon: Ticket },
  { href: "/schedule", label: "일정", Icon: CalendarDays },
  { href: "/rank", label: "순위", Icon: ListOrdered },
  { href: "/my", label: "MY", Icon: UserRound },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t-[0.5px] border-sys-sep"
      style={{ background: "var(--bar)" }}
    >
      <ul className="safe-pb mx-auto flex max-w-md items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname?.startsWith(href) ?? false;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[49px] flex-col items-center justify-center gap-[3px] pb-1 pt-[7px] transition-colors active:opacity-60 ${
                  active ? "text-club-tint" : "text-sys-label2"
                }`}
              >
                <Icon size={24} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span className="text-[10px] font-semibold leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
