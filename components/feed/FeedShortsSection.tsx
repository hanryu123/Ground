"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX, ArrowUpRight } from "lucide-react";
import type { Team } from "@/lib/teams";
import type { ShortsItem } from "@/lib/shorts";
import type { FeedTheme } from "@/components/feed/feedTheme";

/**
 * 피드 2번 블록 — 우리 팀 숏츠. YouTube 공식 iframe 임베드만 쓴다.
 *
 *  - 좌우 스와이프(scroll-snap)로 다음 영상. 카드 면적 50% 이상 보이는 카드 하나만 재생한다.
 *    (IntersectionObserver 는 가로 스크롤 영역에 잘린 부분까지 빼고 계산하므로 세로·가로 모두 이걸로 판단)
 *  - 기본 음소거 자동재생. 소리 버튼은 플레이어 밖에 둔다 (YouTube 플레이어 위에 Ground UI를 덮지 않는다).
 *  - 앱이 백그라운드로 가면 즉시 정지. 영상이 끝나면(숏츠는 반복 재생으로 0초로 돌아온다) 다음 카드로 넘긴다.
 *  - 자동재생이 막힌 웹뷰에선 YouTube 플레이어 자체 재생 버튼을 누르면 재생된다.
 *    (Capacitor 8.3.4 기본값 — iOS allowsInlineMediaPlayback=true·mediaTypesRequiringUserActionForPlayback=[],
 *     Android setMediaPlaybackRequiresUserGesture(false) — 이라 음소거 자동재생은 코드상 된다. 실기기 미검증)
 *  - 우리 팀 영상이 없으면 블록 자체를 숨긴다.
 */

const YT_ORIGIN = "https://www.youtube.com";
const PLAY_RATIO = 0.5;
/** 이 거리(px) 이상 밀거나 이 속도(px/ms) 이상으로 튕기면 한 장 넘긴다 */
const SWIPE_PX = 40;
const SWIPE_VELOCITY = 0.3;
const SNAP_MS = 280;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min || 1}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function sendCommand(iframe: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
}

export default function FeedShortsSection({ team, theme }: { team: Team; theme: FeedTheme }) {
  const [items, setItems] = useState<ShortsItem[] | null>(null);
  const [moreUrl, setMoreUrl] = useState<string | null>(null);
  // 지금 재생해야 하는 카드 (50% 이상 보이고 앱이 앞에 있을 때)
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  // iframe 을 띄워 둔 카드 — 화면 밖으로 나가면 멈추기만 하고, 다른 카드로 넘어가면 내린다
  const [mountedIndex, setMountedIndex] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // 좌우 넘기기 — 브라우저 스크롤 대신 직접 처리해 한 번에 정확히 한 장씩 넘긴다
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    t: number;
    from: number;
    axis: "x" | "y" | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const snapAnim = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const ratios = useRef<Map<number, number>>(new Map());
  const pageVisible = useRef(true);
  // 재생 중인 영상의 위치 — 반복 재생으로 넘어가는 순간을 잡는다
  const progress = useRef({ lastTime: 0, duration: 0 });

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setPlayingIndex(null);
    setMountedIndex(null);
    fetch(`/api/shorts?team=${encodeURIComponent(team.id)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: ShortsItem[]; moreUrl?: string }) => {
        if (cancelled) return;
        setItems(j.items ?? []);
        setMoreUrl(j.moreUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

  const recompute = useCallback(() => {
    let best: number | null = null;
    let bestRatio = PLAY_RATIO;
    ratios.current.forEach((ratio, index) => {
      if (ratio >= bestRatio) {
        best = index;
        bestRatio = ratio;
      }
    });
    setPlayingIndex(pageVisible.current ? best : null);
  }, []);

  // 카드별 노출 비율 추적
  useEffect(() => {
    if (!items?.length) return;
    ratios.current.clear();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const index = Number((e.target as HTMLElement).dataset.index);
          ratios.current.set(index, e.isIntersecting ? e.intersectionRatio : 0);
        }
        recompute();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    cardRefs.current.slice(0, items.length).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [items, recompute]);

  // 앱 백그라운드 → 즉시 정지
  useEffect(() => {
    const onVisibility = () => {
      pageVisible.current = document.visibilityState === "visible";
      if (!pageVisible.current) sendCommand(iframeRef.current, "pauseVideo");
      recompute();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [recompute]);

  // 재생 카드가 바뀌면 그 카드에 iframe 을 띄우고, 화면 밖이면 멈춘다
  useEffect(() => {
    if (playingIndex === null) {
      sendCommand(iframeRef.current, "pauseVideo");
      return;
    }
    if (playingIndex !== mountedIndex) {
      progress.current = { lastTime: 0, duration: 0 };
      setMountedIndex(playingIndex);
      setSoundOn(false);
    } else {
      sendCommand(iframeRef.current, "playVideo");
    }
  }, [playingIndex, mountedIndex]);

  // 카드를 가운데로 — 세로로 덜 보이던 카드면 다 보이게 같이 내린다 (50% 넘으면 재생)
  const scrollToCard = useCallback((index: number) => {
    const card = cardRefs.current[index];
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  // 가로 목록에서 가운데에 가장 가까운 칸 (마지막 "더 보기" 칸 포함)
  function centerIndex(): number {
    const scroller = scrollerRef.current;
    if (!scroller) return 0;
    const mid = scroller.scrollLeft + scroller.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(scroller.children).forEach((el, i) => {
      const node = el as HTMLElement;
      const dist = Math.abs(node.offsetLeft + node.offsetWidth / 2 - mid);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    return best;
  }

  function goToSlot(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slots = scroller.children;
    const node = slots[Math.max(0, Math.min(index, slots.length - 1))] as HTMLElement | undefined;
    if (!node) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const to = Math.max(0, Math.min(max, node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2));
    // scrollTo({ behavior: "smooth" }) 는 재생 카드가 바뀌며 iframe 이 붙는 순간 중간에 끊겨
    // 칸 사이에 멈출 때가 있어 직접 프레임마다 움직인다.
    if (snapAnim.current !== null) cancelAnimationFrame(snapAnim.current);
    const from = scroller.scrollLeft;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SNAP_MS);
      scroller.scrollLeft = from + (to - from) * (1 - Math.pow(1 - t, 3));
      snapAnim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    snapAnim.current = requestAnimationFrame(step);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (snapAnim.current !== null) {
      cancelAnimationFrame(snapAnim.current);
      snapAnim.current = null;
    }
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: scroller.scrollLeft,
      t: performance.now(),
      from: centerIndex(),
      axis: null,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const scroller = scrollerRef.current;
    if (!d || !scroller) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.axis === null && Math.hypot(dx, dy) > 6) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") scroller.setPointerCapture(e.pointerId);
    }
    if (d.axis === "x") scroller.scrollLeft = d.left - dx;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    const dx = e.clientX - d.x;
    const velocity = dx / Math.max(1, performance.now() - d.t); // px/ms
    let next = d.from;
    if (dx < -SWIPE_PX || velocity < -SWIPE_VELOCITY) next = d.from + 1;
    else if (dx > SWIPE_PX || velocity > SWIPE_VELOCITY) next = d.from - 1;
    goToSlot(next);
    // 끌어서 넘긴 손을 뗄 때 카드 탭으로 처리되지 않게
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }

  function onPointerCancel() {
    const d = drag.current;
    drag.current = null;
    if (d?.axis === "x") goToSlot(d.from);
  }

  // 영상이 끝나면 다음 카드로
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      // 숏츠 임베드는 끝나면 ENDED(0) 없이 처음부터 다시 돈다 → 끝 근처에서 0초로 돌아오면 끝난 걸로 본다
      const info = data.info as { playerState?: number; currentTime?: number; duration?: number } | null;
      let ended = data.event === "onStateChange" && data.info === 0;
      if (data.event === "infoDelivery" && info) {
        if (info.playerState === 0) ended = true;
        if (typeof info.duration === "number" && info.duration > 0) progress.current.duration = info.duration;
        if (typeof info.currentTime === "number") {
          const { lastTime, duration } = progress.current;
          if (duration > 0 && lastTime >= duration - 1.5 && info.currentTime < 1) ended = true;
          progress.current.lastTime = info.currentTime;
        }
      }
      if (ended && mountedIndex !== null) {
        progress.current = { lastTime: 0, duration: 0 };
        scrollToCard(mountedIndex + 1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mountedIndex, scrollToCard]);

  function onIframeLoad() {
    const iframe = iframeRef.current;
    // 상태 이벤트(onStateChange)를 받으려면 먼저 listening 을 보내야 한다
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "ground-shorts", channel: "widget" }), YT_ORIGIN);
    sendCommand(iframe, "addEventListener", ["onStateChange"]);
  }

  function toggleSound() {
    const iframe = iframeRef.current;
    if (soundOn) {
      sendCommand(iframe, "mute");
    } else {
      sendCommand(iframe, "unMute");
      sendCommand(iframe, "setVolume", [100]);
      // 자동재생이 막혀 멈춰 있던 경우도 이 탭으로 재생된다
      sendCommand(iframe, "playVideo");
    }
    setSoundOn(!soundOn);
  }

  if (!items || items.length === 0) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="snap-start pb-2 pt-7" aria-labelledby="feed-shorts-title">
      <div className="mb-4 flex items-baseline justify-between px-5">
        <h2
          id="feed-shorts-title"
          className="text-[20px] font-bold tracking-[-0.02em]"
          style={{ color: theme.text(0.95) }}
        >
          {team.short} Moments
        </h2>
        <span
          className="text-[11px] font-medium uppercase tracking-[0.24em]"
          style={{ color: theme.text(0.4) }}
        >
          Shorts
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto overscroll-x-contain px-5 pb-2"
        style={{ scrollbarWidth: "none", touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {items.map((item, index) => {
          const mounted = mountedIndex === index;
          return (
            <div key={item.videoId} className="w-[70%] max-w-[300px] shrink-0">
              <div
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                data-index={index}
                className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black"
              >
                {mounted ? (
                  <iframe
                    ref={iframeRef}
                    src={`${YT_ORIGIN}/embed/${item.videoId}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(origin)}`}
                    title={item.title}
                    className="absolute inset-0 h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    onLoad={onIframeLoad}
                  />
                ) : null}
                {mounted ? (
                  // 플레이어가 터치를 가져가 좌우로 안 넘어가던 문제 — 가운데만 덮어 스와이프를 받고, 탭하면 소리 켜기.
                  // 위아래 가장자리(YouTube 로고·제목·컨트롤)는 덮지 않는다 (YouTube 정책).
                  <div
                    className="absolute inset-x-0 bottom-[22%] top-[14%]"
                    onClick={toggleSound}
                    aria-hidden
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => scrollToCard(index)}
                    className="absolute inset-0 h-full w-full"
                    aria-label={`${item.title} 재생`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full scale-[1.34] object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                        <Play size={18} fill="white" className="ml-0.5 text-white" />
                      </span>
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="line-clamp-2 text-[14px] font-semibold leading-snug"
                    style={{ color: theme.text(0.92) }}
                  >
                    {item.title}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: theme.text(0.5) }}>
                    {item.channelLabel} · {timeAgo(item.publishedAt)}
                  </p>
                </div>
                {mounted ? (
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                    style={{ background: theme.text(0.1), color: theme.text(0.85) }}
                    aria-label={soundOn ? "소리 끄기" : "소리 켜기"}
                  >
                    {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {moreUrl ? (
          <a
            href={moreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-[9/16] w-[40%] max-w-[180px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl text-center"
            style={{ background: theme.text(0.07), color: theme.text(0.8) }}
          >
            <ArrowUpRight size={22} />
            <span className="px-3 text-[13px] font-semibold leading-snug">YouTube에서 더 보기</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
