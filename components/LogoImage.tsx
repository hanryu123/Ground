"use client";

import { useEffect, useMemo, useState } from "react";
import { findTeam, type Team } from "@/lib/teams";
import { getTeamConfig } from "@/config/teams";

/**
 * LogoImage — 로고 매칭 100% 강제 규칙
 *
 *   경로:  /images/logos/<base>.<ext>   (선두 슬래시 1개, public/ 정적 자산)
 *
 *   베이스 후보(우선순위 높은 순):
 *     1) config/teams.ts 의 `logoBasename` (디스크 파일과 정확히 일치하도록 명시)
 *     2) Capitalize(teamId)        — 예: "doosan" → "Doosan"
 *     3) lowercase(teamId)         — 예: "samsung" → "samsung"
 *     4) UPPERCASE(teamId)         — 예: "kt" → "KT"  (KT/SSG/NC 전부대문자 케이스)
 *
 *   확장자 후보(우선순위 높은 순): svg → png → webp → jpg → jpeg
 *
 *   왜 next/image 가 아니라 plain <img> 인가:
 *     Next.js 16 의 <Image> 는 보안 정책상 로컬 SVG 를 차단(404)한다.
 *     `unoptimized` 로도 통과되지 않으며, `dangerouslyAllowSVG` 는 원격 SVG 용이다.
 *     로고는 작은 정적 자산이라 최적화 이득도 미미. <img> 가 가장 신뢰성 높다.
 *     priority 의도는 `loading="eager"` + `fetchPriority="high"` 로 동등하게 표현.
 *
 *   디버깅:
 *     - 다음 후보 fallthrough 시 console.warn (실패 경로 + 다음 시도)
 *     - 모든 후보 소진 시 console.error 로 전체 시도 경로 출력 + 텍스트 폴백
 */

const EXT_PRIORITY = ["svg", "png", "webp", "jpg", "jpeg"] as const;

function buildCandidatePaths(
  teamId: string,
  configBasename?: string
): string[] {
  const lower = teamId.trim().toLowerCase();
  if (!lower) return [];

  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  const upper = lower.toUpperCase();

  // dedupe하면서 순서 보존
  const baseSet = new Set<string>();
  if (configBasename) baseSet.add(configBasename);
  baseSet.add(cap);
  baseSet.add(lower);
  baseSet.add(upper);

  const out: string[] = [];
  for (const base of baseSet) {
    for (const ext of EXT_PRIORITY) {
      out.push(`/images/logos/${base}.${ext}`);
    }
  }
  return out;
}

type Props = {
  /** 팀 식별자 (lib/teams.ts의 id 또는 config/teams.ts의 teamId — 모두 OK) */
  teamId: string;
  /** 접근성 alt 텍스트 */
  alt: string;
  className?: string;
  /** 픽셀 사이즈 (정사각, 텍스트 폴백 시 height 기준이 됨) */
  size?: number;
  style?: React.CSSProperties;
  /** 즉시 렌더가 필요할 때 true (eager + fetchPriority="high") */
  priority?: boolean;
  /** 텍스트 폴백 표시 문구 (기본: 팀의 nameEn — 예: "KIA TIGERS") */
  fallbackText?: string;
};

export default function LogoImage({
  teamId,
  alt,
  className,
  size = 48,
  style,
  priority = false,
  fallbackText,
}: Props) {
  const team = useMemo(() => findTeam(teamId), [teamId]);
  const cfg = useMemo(() => getTeamConfig(teamId), [teamId]);

  const candidates = useMemo(
    () => buildCandidatePaths(teamId, cfg?.logoBasename),
    [teamId, cfg]
  );

  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  // teamId 가 바뀌면 후보 인덱스 리셋
  useEffect(() => {
    setIdx(0);
    setExhausted(false);
  }, [teamId]);

  if (exhausted || candidates.length === 0) {
    return (
      <TextLogoFallback
        team={team}
        text={fallbackText ?? team.nameEn}
        size={size}
        className={className}
        style={style}
      />
    );
  }

  const src = candidates[idx];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // key를 src로 두면 src 변경 시 새 노드가 마운트되어 onError 재발화
      key={src}
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      // priority 시 critical 리소스로 힌트
      fetchPriority={priority ? "high" : "auto"}
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        display: "block",
        objectFit: "contain",
        ...style,
      }}
      onError={() => {
        const failed = candidates[idx];
        const next = candidates[idx + 1];
        if (next) {
          console.warn(
            `[LogoImage] not found: ${failed} → trying next: ${next}`
          );
          setIdx(idx + 1);
        } else {
          console.error(
            `[LogoImage] FAILED to resolve logo for teamId="${teamId}". ` +
              `All candidate paths returned 404:\n` +
              candidates.map((c) => `  - ${c}`).join("\n") +
              `\nFix: drop a matching file into public/images/logos/ ` +
              `or set "logoBasename" in config/teams.ts to the exact filename (without extension).`
          );
          setExhausted(true);
        }
      }}
    />
  );
}

/**
 * 텍스트 폴백 — 팀 이름을 워드마크 형태로.
 *  - 1단어("KIA", "LG"): 큰 글자 한 줄
 *  - 2단어("KIA TIGERS"): 두 줄로 타이트하게 스택
 */
function TextLogoFallback({
  team,
  text,
  size,
  className,
  style,
}: {
  team: Team;
  text: string;
  size: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const parts = text.split(/\s+/).filter(Boolean);
  const isMulti = parts.length > 1;

  const longest = parts.reduce((m, p) => Math.max(m, p.length), 0);
  const baseFs = isMulti ? size * 0.22 : size * 0.32;
  const fs =
    longest > 6
      ? Math.max(8, Math.round(baseFs * (6 / longest)))
      : Math.round(baseFs);

  return (
    <div
      className={`flex select-none flex-col items-center justify-center ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        gap: isMulti ? 1 : 0,
        ...style,
      }}
      aria-label={text}
      title={text}
    >
      {parts.map((line, i) => (
        <span
          key={i}
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontWeight: 800,
            fontSize: fs,
            lineHeight: 1,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.96)",
            textShadow: `0 0 14px ${team.accent}66, 0 1px 3px rgba(0,0,0,0.7)`,
            whiteSpace: "nowrap",
          }}
        >
          {line}
        </span>
      ))}
    </div>
  );
}
