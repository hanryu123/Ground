"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX, ArrowUpRight } from "lucide-react";
import { track } from "@vercel/analytics";
import type { Team } from "@/lib/teams";
import type { ShortsItem } from "@/lib/shorts";
import type { FeedTheme } from "@/components/feed/feedTheme";
import { useForegroundTick } from "@/lib/useForegroundTick";

/**
 * 피드 2번 블록 — 우리 팀 숏츠. YouTube 공식 iframe 임베드만 쓴다.
 *
 *  - 좌우 넘기기는 브라우저 기본 스크롤 + scroll-snap (한 번에 한 장, 왼쪽 정렬 + 다음 카드 살짝 보임).
 *    넘기는 동안엔 React 상태를 건드리지 않고, 스크롤이 멈춘 뒤에 왼쪽 카드를 한 번 정한다.
 *  - 플레이어(iframe)는 하나만 띄워 두고 영상만 바꾼다 (loadVideoById).
 *    카드마다 iframe 을 새로 띄우면 짧은 시간에 임베드를 여러 번 여는 패턴이 돼서 YouTube 가
 *    "로그인하여 봇이 아님을 확인하세요" 화면을 띄웠다. 플레이어는 스크롤 영역 안에 절대 위치로 두어
 *    넘길 때 카드와 같이 밀려 나가고, 멈추면 새 카드 위치로 옮긴다 (위치만 바꾸면 iframe 이 다시 뜨지 않는다).
 *  - 그래도 확인 화면이 뜰 수 있어 카드마다 "YouTube에서 보기"(↗)를 플레이어 밖에 둔다.
 *  - 측정: 영상을 띄우고 PLAY_TIMEOUT_MS 안에 재생이 시작되지 않으면 Vercel Analytics 에 shorts_play_failed.
 *  - 플레이어 가운데는 투명 영역으로 덮어 넘기기를 받고 탭하면 소리 켜기. 위아래 가장자리(YouTube 로고·컨트롤)는 덮지 않는다.
 *  - 기본 음소거 자동재생, 앱이 백그라운드로 가면 즉시 정지, 영상이 끝나면 다음 카드로.
 *  - 재생된 숏츠는 기기에 기억해 두고, 목록을 받을 때 안 본 숏츠를 앞으로 보낸다
 *    (비시즌엔 새 업로드가 드물어 며칠씩 같은 영상이 앞에 있었다). 새로 올라온 숏츠는 안 본 것이라 자연히 앞에 온다.
 */

const YT_ORIGIN = "https://www.youtube.com";
/** 섹션이 이 비율 이상 보여야 재생 */
const SECTION_VISIBLE_RATIO = 0.55;
/** 스크롤 이벤트가 이만큼 멈추면 넘기기가 끝난 것으로 본다 (scrollend 미지원 브라우저용) */
const SCROLL_SETTLE_MS = 90;
/** 카드가 이만큼 계속 보여야 영상을 바꾼다 */
const LOAD_DELAY_MS = 450;
/** 앱이 다시 앞으로 왔을 때 이보다 오래됐으면 새로 받는다 (비어 있으면 바로) */
const REFRESH_AFTER_MS = 5 * 60_000;
/** 영상을 띄우고 이 시간 안에 재생이 안 되면 실패로 기록하고 플레이어를 그대로 보여 준다 (확인 화면 포함) */
const PLAY_TIMEOUT_MS = 6_000;
/** YouTube playerState */
const YT_PLAYING = 1;
const YT_ENDED = 0;
/** 본 숏츠 기록 — videoId → 처음 재생한 시각 */
const SEEN_KEY = "ground.shorts.seen";
const SEEN_MAX = 400;

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function markSeen(videoId: string) {
  try {
    const seen = readSeen();
    if (seen[videoId]) return;
    seen[videoId] = Date.now();
    const ids = Object.keys(seen);
    if (ids.length > SEEN_MAX) {
      ids.sort((a, b) => seen[a]! - seen[b]!);
      for (const id of ids.slice(0, ids.length - SEEN_MAX)) delete seen[id];
    }
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // 저장 못 해도 재생엔 영향 없음
  }
}

/** 안 본 숏츠 먼저, 본 숏츠는 뒤로 — 각 무리 안에서는 서버 순서를 그대로 둔다 */
function unseenFirst(items: ShortsItem[]): ShortsItem[] {
  const seen = readSeen();
  return [...items.filter((i) => !seen[i.videoId]), ...items.filter((i) => seen[i.videoId])];
}

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

type Box = { left: number; top: number; width: number; height: number };

export default function FeedShortsSection({ team, theme }: { team: Team; theme: FeedTheme }) {
  const [items, setItems] = useState<ShortsItem[] | null>(null);
  const [moreUrl, setMoreUrl] = useState<string | null>(null);
  // 넘기기가 멈춘 뒤 왼쪽에 맞춰진 카드
  const [activeIndex, setActiveIndex] = useState(0);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  // 플레이어에 올라가 있는 카드 (null = 아직 플레이어 없음)
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  // 처음 띄울 때의 영상 — 이후엔 loadVideoById 로만 바꾸므로 src 는 바뀌지 않는다
  const [playerSrcId, setPlayerSrcId] = useState<string | null>(null);
  const [playerShown, setPlayerShown] = useState(false);
  const [playerBox, setPlayerBox] = useState<Box | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeReady = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const playTimer = useRef<number | null>(null);
  const loaded = useRef<{ team: string; at: number; ids: string } | null>(null);
  // 재생 중인 영상의 위치 — 반복 재생으로 넘어가는 순간을 잡는다
  const progress = useRef({ lastTime: 0, duration: 0 });

  const foregroundTick = useForegroundTick();
  const itemCount = items?.length ?? 0;
  const playingIndex =
    sectionVisible && pageVisible && activeIndex < itemCount ? activeIndex : null;

  // ── 숏츠 목록 ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const prev = loaded.current;
    const sameTeam = prev?.team === team.id;
    // 앱이 다시 앞으로 온 경우: 목록이 있고 아직 신선하면 그대로 둔다
    if (sameTeam && prev.ids && Date.now() - prev.at < REFRESH_AFTER_MS) return;
    if (!sameTeam) {
      setItems(null);
      setActiveIndex(0);
      setPlayerIndex(null);
      setPlayerShown(false);
    }
    fetch(`/api/shorts?team=${encodeURIComponent(team.id)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: ShortsItem[]; moreUrl?: string }) => {
        if (cancelled) return;
        const next = unseenFirst(j.items ?? []);
        const ids = next.map((i) => i.videoId).join(",");
        // 새로 받은 목록이 같으면 화면을 건드리지 않는다 (보던 영상이 끊기지 않게)
        if (!sameTeam || ids !== prev?.ids) {
          setItems(next);
          setMoreUrl(j.moreUrl ?? null);
          if (sameTeam) {
            setActiveIndex(0);
            setPlayerIndex(null);
            setPlayerShown(false);
            scrollerRef.current?.scrollTo({ left: 0 });
          }
        }
        loaded.current = { team: team.id, at: Date.now(), ids };
      })
      .catch(() => {
        if (!cancelled && !sameTeam) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [team.id, foregroundTick]);

  // ── 섹션 노출 · 앱 전후면 ─────────────────────────────────
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !itemCount) return;
    const io = new IntersectionObserver(
      ([entry]) =>
        setSectionVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= SECTION_VISIBLE_RATIO)),
      { threshold: [0, SECTION_VISIBLE_RATIO, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [itemCount]);

  useEffect(() => {
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) sendCommand(iframeRef.current, "pauseVideo");
      setPageVisible(visible);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ── 넘기기가 멈추면 왼쪽 카드를 정한다 ────────────────────
  const settle = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const left = scroller.scrollLeft + parseFloat(getComputedStyle(scroller).scrollPaddingLeft || "0");
    let best = 0;
    let bestDist = Infinity;
    Array.from(scroller.children).forEach((el) => {
      const node = el as HTMLElement;
      if (node.dataset.slot === undefined) return; // 플레이어 레이어는 칸이 아니다
      const dist = Math.abs(node.offsetLeft - left);
      if (dist < bestDist) {
        best = Number(node.dataset.slot);
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

  // ── 플레이어 위치: 플레이어가 맡은 카드의 영상 칸 위 ───────
  const measure = useCallback(() => {
    if (playerIndex === null) return;
    const card = cardRefs.current[playerIndex];
    if (!card) return;
    setPlayerBox({ left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight });
  }, [playerIndex]);

  useLayoutEffect(() => {
    measure();
  }, [measure, itemCount]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // ── 재생할 카드가 바뀌면: 플레이어를 숨기고, 잠깐 머물면 그 카드로 옮겨 영상만 바꾼다 ──
  useEffect(() => {
    if (playingIndex === null) {
      sendCommand(iframeRef.current, "pauseVideo");
      return;
    }
    if (playingIndex === playerIndex) {
      sendCommand(iframeRef.current, "playVideo");
      return;
    }
    sendCommand(iframeRef.current, "pauseVideo");
    setPlayerShown(false);
    const timer = window.setTimeout(() => {
      const item = items?.[playingIndex];
      if (!item) return;
      progress.current = { lastTime: 0, duration: 0 };
      setSoundOn(false);
      setPlayerIndex(playingIndex);
      if (iframeRef.current && iframeReady.current) {
        sendCommand(iframeRef.current, "mute");
        sendCommand(iframeRef.current, "loadVideoById", [item.videoId]);
      } else {
        setPlayerSrcId(item.videoId); // 첫 플레이어
      }
      // 재생이 시작되면 보여 준다. 시간 안에 안 되면 실패로 기록하고 그대로 보여 준다 (확인 화면이면 사용자가 보게)
      if (playTimer.current !== null) window.clearTimeout(playTimer.current);
      playTimer.current = window.setTimeout(() => {
        playTimer.current = null;
        setPlayerShown(true);
        track("shorts_play_failed", { team: team.id, channel: item.channelLabel });
      }, PLAY_TIMEOUT_MS);
      track("shorts_play_attempt", { team: team.id });
    }, LOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [playingIndex, playerIndex, items, team.id]);

  // 카드를 왼쪽에 맞춰 보여 준다 — 세로로 덜 보이던 카드면 다 보이게 같이 내린다
  const scrollToCard = useCallback((index: number) => {
    const card = cardRefs.current[index];
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, []);

  // ── 플레이어 이벤트: 재생 시작 → 보이기, 끝 → 다음 카드 ───────
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      const info = data.info as { playerState?: number; currentTime?: number; duration?: number } | null;
      const state =
        data.event === "onStateChange" && typeof data.info === "number"
          ? data.info
          : data.event === "infoDelivery"
            ? info?.playerState
            : undefined;
      if (state === YT_PLAYING) {
        if (playTimer.current !== null) {
          window.clearTimeout(playTimer.current);
          playTimer.current = null;
        }
        setPlayerShown(true);
        const playing = playerIndex !== null ? items?.[playerIndex] : undefined;
        if (playing) markSeen(playing.videoId);
      }
      // 숏츠 임베드는 끝나면 ENDED 없이 처음부터 다시 돈다 → 끝 근처에서 0초로 돌아오면 끝난 걸로 본다
      let ended = state === YT_ENDED;
      if (data.event === "infoDelivery" && info) {
        if (typeof info.duration === "number" && info.duration > 0) progress.current.duration = info.duration;
        if (typeof info.currentTime === "number") {
          const { lastTime, duration } = progress.current;
          if (duration > 0 && lastTime >= duration - 1.5 && info.currentTime < 1) ended = true;
          progress.current.lastTime = info.currentTime;
        }
      }
      if (ended && playerIndex !== null) {
        progress.current = { lastTime: 0, duration: 0 };
        scrollToCard(playerIndex + 1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playerIndex, items, scrollToCard]);

  useEffect(
    () => () => {
      if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    },
    []
  );

  function onIframeLoad() {
    const iframe = iframeRef.current;
    iframeReady.current = true;
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

  // 받는 중엔 자리만 잡아 둔다 — 늦게 도착하면 블록이 갑자기 끼어들며 아래 소식이 밀렸다
  if (items === null) {
    return (
      <section className="pb-2 pt-7" aria-busy aria-label={`${team.short} Moments 불러오는 중`}>
        <div className="mb-4 px-5">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: theme.text(0.95) }}>
            {team.short} Moments
          </h2>
        </div>
        <div className="flex gap-3 overflow-hidden px-5 pb-2">
          {[0, 1].map((i) => (
            <div key={i} className="w-[70%] max-w-[300px] shrink-0">
              <div className="aspect-[9/16] w-full animate-pulse rounded-2xl" style={{ background: theme.text(0.08) }} />
              <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded" style={{ background: theme.text(0.08) }} />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded" style={{ background: theme.text(0.06) }} />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

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
          const active = playerIndex === index && playerShown;
          return (
            <div
              key={item.videoId}
              data-slot={index}
              className="w-[70%] max-w-[300px] shrink-0 snap-start"
              style={{ scrollSnapStop: "always" }}
            >
              <div
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black"
              >
                <button
                  type="button"
                  onClick={() => scrollToCard(index)}
                  className="absolute inset-0 h-full w-full"
                  aria-label={`${item.title} 재생`}
                  tabIndex={active ? -1 : 0}
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
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                      <Play size={18} fill="white" className="ml-0.5 text-white" />
                    </span>
                  </span>
                </button>
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
                {playerIndex === index ? (
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
                {/* 플레이어에 확인 화면이 떠도 볼 수 있게 — YouTube 앱(또는 브라우저)에서 바로 연다 */}
                <a
                  href={`https://www.youtube.com/shorts/${item.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                  style={{ background: theme.text(0.1), color: theme.text(0.85) }}
                  aria-label="YouTube에서 보기"
                >
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
          );
        })}

        {moreUrl ? (
          <a
            href={moreUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-slot={items.length}
            className="flex aspect-[9/16] w-[40%] max-w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl text-center"
            style={{ background: theme.text(0.07), color: theme.text(0.8), scrollSnapStop: "always" }}
          >
            <ArrowUpRight size={22} />
            <span className="px-3 text-[13px] font-semibold leading-snug">YouTube에서 더 보기</span>
          </a>
        ) : null}

        {/* 플레이어 하나 — 스크롤 영역 안 절대 위치라 넘길 때 카드와 같이 밀려 나가고, 멈추면 새 카드로 옮긴다 */}
        {playerSrcId && playerBox ? (
          <div
            className="pointer-events-none absolute z-10 overflow-hidden rounded-2xl transition-opacity duration-300"
            style={{
              left: playerBox.left,
              top: playerBox.top,
              width: playerBox.width,
              height: playerBox.height,
              opacity: playerShown ? 1 : 0,
            }}
            aria-hidden={!playerShown}
          >
            <iframe
              ref={iframeRef}
              src={`${YT_ORIGIN}/embed/${playerSrcId}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(pageUrl)}`}
              title="YouTube Shorts"
              className="h-full w-full"
              style={{ pointerEvents: playerShown ? "auto" : "none" }}
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              onLoad={onIframeLoad}
            />
            {/* 가운데만 덮어 넘기기는 스크롤로 넘기고, 탭하면 소리 켜기 (위아래 YouTube 로고·컨트롤은 덮지 않음) */}
            <div
              className="absolute inset-x-0 bottom-[18%] top-[12%]"
              style={{ pointerEvents: playerShown ? "auto" : "none" }}
              onClick={toggleSound}
              aria-hidden
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
