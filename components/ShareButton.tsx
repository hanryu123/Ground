"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Check } from "lucide-react";
import {
  buildTodayStoryPng,
  downloadBlob,
  type TodayStoryImageInput,
} from "@/lib/buildTodayStoryImage";

/**
 * ShareButton — 우상단 공유 아이콘 버튼.
 *
 *  - `todayStory` 가 있으면: 9:16 PNG 합성 → Web Share `files` 로 스토리에 넣기 시도
 *  - 파일 공유 불가/취소 시: PNG 로컬 다운로드 → 갤러리에서 스토리 업로드 가능
 *  - 그 외: 기존 링크/텍스트 공유 또는 클립보드
 */

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  /** 공유 텍스트 (예: "NC vs 두산 — 4월 19일 · 일") */
  title?: string;
  /** 공유 본문 (옵셔널) */
  text?: string;
  /** 공유 URL — 미지정 시 현재 페이지 */
  url?: string;
  /** Today 히어로용 스토리 카드 — 포스터+팀명+카피+경기/선발 */
  todayStory?: TodayStoryImageInput | null;
};

export default function ShareButton({
  title = "KBO TODAY",
  text,
  url,
  todayStory,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (typeof window === "undefined") return;

    const targetUrl = url ?? window.location.href;
    const nav = window.navigator;

    if (todayStory) {
      try {
        setBusy(true);
        const blob = await buildTodayStoryPng(todayStory);
        const file = new File([blob], "ground-today.png", { type: "image/png" });
        /** 일부 모바일은 files+url 동시 공유를 거부하므로 이미지 우선 payload */
        const withFiles: ShareData = { files: [file], title, text };

        if (typeof nav.share === "function") {
          const can =
            typeof nav.canShare !== "function" || nav.canShare(withFiles);
          if (can) {
            try {
              await nav.share(withFiles);
              return;
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") return;
            }
          }
        }

        downloadBlob(blob, "ground-today.png");
        setToast("사진 저장됨 · 앨범에서 스토리에 추가");
        setTimeout(() => setToast(null), 2400);
        return;
      } catch (e) {
        console.warn("[ShareButton] story image failed:", e);
      } finally {
        setBusy(false);
      }
    }

    const payload: ShareData = { title, text, url: targetUrl };

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
      if (e instanceof Error && e.name !== "AbortError") {
        console.warn("[ShareButton] share failed:", e.message);
      }
    }
  }

  return (
    <div className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: busy ? 1 : 0.9 }}
        disabled={busy}
        onClick={() => void handleShare()}
        className="relative flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-45"
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
        {toast && (
          <motion.span
            key="toast-msg"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.22, ease }}
            className="absolute right-0 top-12 max-w-[220px] rounded-full px-3 py-1.5 text-[10px] uppercase leading-snug tracking-[0.14em]"
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
            {toast}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
