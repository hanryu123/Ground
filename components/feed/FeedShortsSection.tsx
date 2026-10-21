"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX, ArrowUpRight } from "lucide-react";
import type { Team } from "@/lib/teams";
import type { ShortsItem } from "@/lib/shorts";
import type { FeedTheme } from "@/components/feed/feedTheme";

/**
 * 피드 2번 블록 — 우리 팀 숏츠. YouTube 공식 iframe 임베드만 쓴다.
 *
 *  - 좌우 넘기기는 브라우저 기본 스크롤 + scroll-snap 에 맡긴다 (iOS 에서 컴포지터 스레드로 돌아 매끄럽다).
 *    snap-stop: always 로 한 번에 한 장씩 멈추고, YouTube 숏츠 줄처럼 왼쪽 정렬 + 다음 카드가 살짝 보인다.
 *    예전엔 포인터 이벤트로 scrollLeft 를 직접 옮겼는데, 메인 스레드가 바쁘면 손가락을 못 따라와 버벅였다.
 *  - 넘기는 동안엔 React 상태를 건드리지 않는다. 스크롤이 멈춘 뒤에 가운데(왼쪽 정렬된) 카드를 한 번 정하고,
 *    섹션이 화면에 충분히 보이고 앱이 앞에 있을 때만 그 카드를 재생한다.
 *  - 플레이어(iframe)는 카드가 MOUNT_DELAY_MS 동안 머물 때만 띄운다 (훑고 지나갈 때 1MB 플레이어 로드 방지).
 *    썸네일을 아래에 깔아 두고 플레이어가 준비되면 겹쳐 보여 검은 화면 깜빡임이 없다.
 *  - 플레이어가 터치를 가져가면 좌우로 안 넘어가므로 가운데를 투명 영역으로 덮는다 (탭하면 소리 켜기).
 *    위아래 가장자리(YouTube 로고·제목·컨트롤)는 덮지 않는다 (YouTube 정책).
 *  - 기본 음소거 자동재생, 앱이 백그라운드로 가면 즉시 정지, 영상이 끝나면 다음 카드로.
 *  - 우리 팀 영상이 없으면 블록 자체를 숨긴다.
 */

const YT_ORIGIN = "https://www.youtube.com";
/** 섹션이 이 비율 이상 보여야 재생 */
const SECTION_VISIBLE_RATIO = 0.55;
/** 스크롤 이벤트가 이만큼 멈추면 넘기기가 끝난 것으로 본다 (scrollend 미지원 브라우저용) */
const SCROLL_SETTLE_MS = 90;
/** 카드가 이만큼 계속 보여야 플레이어를 띄운다 */
const MOUNT_DELAY_MS = 450;

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
  // 넘기기가 멈춘 뒤 왼쪽에 맞춰진 카드
  const [activeIndex, setActiveIndex] = useState(0);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  // iframe 을 띄워 둔 카드 — 다른 카드로 넘어가면 내린다
  const [mountedIndex, setMountedIndex] = useState<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const settleTimer = useRef<number | null>(null);
  // 재생 중인 영상의 위치 — 반복 재생으로 넘어가는 순간을 잡는다
  const progress = useRef({ lastTime: 0, duration: 0 });

  const itemCount = items?.length ?? 0;
  const playingIndex =
    sectionVisible && pageVisible && activeIndex < itemCount ? activeIndex : null;

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setActiveIndex(0);
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

  // 섹션이 세로로 충분히 보이는지
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !itemCount) return;
    const io = new IntersectionObserver(
      ([entry]) => setSectionVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= SECTION_VISIBLE_RATIO)),
      { threshold: [0, SECTION_VISIBLE_RATIO, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [itemCount]);

  // 앱 백그라운드 → 즉시 정지
  useEffect(() => {
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) sendCommand(iframeRef.current, "pauseVideo");
      setPageVisible(visible);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // 넘기기가 멈추면 왼쪽에 맞춰진 칸을 정한다 (넘기는 동안엔 아무 상태도 바꾸지 않는다)
  const settle = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const left = scroller.scrollLeft + parseFloat(getComputedStyle(scroller).scrollPaddingLeft || "0");
    let best = 0;
    let bestDist = Infinity;
    Array.from(scroller.children).forEach((el, i) => {
      const dist = Math.abs((el as HTMLElement).offsetLeft - left);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    setActiveIndex(best);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !itemCount) return;
    const onScroll = () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, SCROLL_SETTLE_MS);
    };
    const onScrollEnd = () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settle();
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", onScrollEnd);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [itemCount, settle]);

  // 재생 카드가 바뀌면 그 카드에 iframe 을 띄우고, 화면 밖이면 멈춘다
  useEffect(() => {
    if (playingIndex === null) {
      sendCommand(iframeRef.current, "pauseVideo");
      return;
    }
    if (playingIndex === mountedIndex) {
      sendCommand(iframeRef.current, "playVideo");
      return;
    }
    // 이전 카드 영상은 바로 멈추고, 새 카드 플레이어는 잠깐 머물면 띄운다
    sendCommand(iframeRef.current, "pauseVideo");
    const timer = window.setTimeout(() => {
      progress.current = { lastTime: 0, duration: 0 };
      setPlayerReady(false);
      setMountedIndex(playingIndex);
      setSoundOn(false);
    }, MOUNT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [playingIndex, mountedIndex]);

  // 카드를 왼쪽에 맞춰 보여 준다 — 세로로 덜 보이던 카드면 다 보이게 같이 내린다
  const scrollToCard = useCallback((index: number) => {
    const card = cardRefs.current[index];
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, []);

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
    setPlayerReady(true);
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
    <section className="pb-2 pt-7" aria-labelledby="feed-shorts-title">
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
        className="relative flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto overscroll-x-contain px-5 pb-2"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {items.map((item, index) => {
          const mounted = mountedIndex === index;
          return (
            <div
              key={item.videoId}
              className="w-[70%] max-w-[300px] shrink-0 snap-start"
              style={{ scrollSnapStop: "always" }}
            >
              <div
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black"
              >
                {/* 썸네일은 항상 깔아 둔다 — 플레이어가 준비될 때까지 검은 화면 대신 보인다 */}
                <button
                  type="button"
                  onClick={() => scrollToCard(index)}
                  className="absolute inset-0 h-full w-full"
                  aria-label={`${item.title} 재생`}
                  tabIndex={mounted ? -1 : 0}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                    alt=""
                    loading={index < 3 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    className="h-full w-full scale-[1.34] object-cover"
                  />
                  {!mounted ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                        <Play size={18} fill="white" className="ml-0.5 text-white" />
                      </span>
                    </span>
                  ) : null}
                </button>

                {mounted ? (
                  <>
                    <iframe
                      ref={iframeRef}
                      src={`${YT_ORIGIN}/embed/${item.videoId}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(origin)}`}
                      title={item.title}
                      className="absolute inset-0 h-full w-full transition-opacity duration-300"
                      style={{ opacity: playerReady ? 1 : 0 }}
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                      onLoad={onIframeLoad}
                    />
                    <div
                      className="absolute inset-x-0 bottom-[18%] top-[12%]"
                      onClick={toggleSound}
                      aria-hidden
                    />
                  </>
                ) : null}
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
            className="flex aspect-[9/16] w-[40%] max-w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl text-center"
            style={{ background: theme.text(0.07), color: theme.text(0.8), scrollSnapStop: "always" }}
          >
            <ArrowUpRight size={22} />
            <span className="px-3 text-[13px] font-semibold leading-snug">YouTube에서 더 보기</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
