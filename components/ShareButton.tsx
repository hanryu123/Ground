"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Check } from "lucide-react";

/**
 * ShareButton — 우상단 공유 아이콘 버튼.
 *
 *  - 1순위: 모바일 Web Share API (`navigator.share`) — 시스템 시트 호출
 *  - 2순위: 클립보드 복사 + "Copied" 미니 토스트 (1.6s)
 *  - 3순위: 둘 다 실패 시 콘솔 경고만, UI는 깨지지 않음
 *
 *  알림 종(NotificationBell, 44px) 옆에 균형 맞춰 동일 사이즈로 배치.
 */

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  /** 공유 텍스트 (예: "NC vs 두산 — 4월 19일 · 일") */
  title?: string;
  /** 공유 본문 (옵셔널) */
  text?: string;
  /** 공유 URL — 미지정 시 현재 페이지 */
  url?: string;
};

export default function ShareButton({ title = "KBO TODAY", text, url }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof window === "undefined") return;

    const targetUrl = url ?? window.location.href;
    const payload: ShareData = { title, text, url: targetUrl };
    const nav = window.navigator;

    try {
      if (typeof nav.share === "function") {
        await nav.share(payload);
        return;
      }
      if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
        const fallbackText = [title, text, targetUrl]
          .filter(Boolean)
          .join("\n");
        await nav.clipboard.writeText(fallbackText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        return;
      }
      console.warn("[ShareButton] no share or clipboard API available");
    } catch (e) {
      // 사용자가 시스템 시트를 취소한 경우 대부분 AbortError — 무시.
      if (e instanceof Error && e.name !== "AbortError") {
        console.warn("[ShareButton] share failed:", e.message);
      }
    }
  }

  return (
    <div className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={handleShare}
        className="relative flex h-11 w-11 items-center justify-center rounded-full"
        aria-label="공유하기"
      >
        <Share2
          size={20}
          strokeWidth={1.5}
          className="text-white/85"
          style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.55))" }}
        />
      </motion.button>

      <AnimatePresence>
        {copied && (
          <motion.span
            key="copied-toast"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.22, ease }}
            className="absolute right-0 top-12 whitespace-nowrap rounded-full px-3 py-1.5 text-[10.5px] uppercase tracking-[0.22em]"
            style={{
              fontWeight: 600,
              backgroundColor: "rgba(15,15,18,0.82)",
              color: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(18px) saturate(160%)",
              WebkitBackdropFilter: "blur(18px) saturate(160%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
            role="status"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check size={11} strokeWidth={2.4} />
              Link copied
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
