/**
 * Today 히어로용 인스타 스토리 비율(9:16) PNG — 캔버스 합성 (외부 라이브러리 없음).
 * 동일 출처 이미지만 그리므로 캔버스 오염(taint) 없음.
 */

export type TodayStoryImageInput = {
  /** 절대 URL 또는 `/path` (호출 시 origin 붙임) */
  posterSrc: string;
  /** 응원 팀 표기 (예: LG / LG 트윈스) */
  teamHeadline: string;
  /** 카피 한 줄 */
  slogan: string;
  /** 경기 메타 (날짜·대전·구장 등), 없으면 생략 */
  metaLine?: string;
  /** 선발 한 줄, 없으면 생략 */
  startersLine?: string;
  /** 팀 포인트 컬러 (헤드라인 강조) */
  accentHex?: string;
};

const W = 1080;
const H = 1920;
const PAD_X = 72;
const BOTTOM_PAD = 120;
const MAX_TEXT_W = W - PAD_X * 2;

function absolutePosterUrl(posterSrc: string): string {
  if (posterSrc.startsWith("http://") || posterSrc.startsWith("https://")) {
    return posterSrc;
  }
  if (typeof window === "undefined") return posterSrc;
  return new URL(posterSrc, window.location.origin).href;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`story image load failed: ${src}`));
    img.src = src;
  });
}

/** 간단 줄바꿈: 공백 단위, 한글은 글자 단위로도 쪼갤 수 있게 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const t = text.trim();
  if (!t) return [];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w;
    if (ctx.measureText(tryLine).width <= maxWidth) {
      line = tryLine;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(w).width <= maxWidth) {
      line = w;
      continue;
    }
    let chunk = "";
    for (const ch of w) {
      const next = chunk + ch;
      if (ctx.measureText(next).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dw: number,
  dh: number
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
}

/**
 * 스토리용 PNG Blob. 실패 시 reject.
 */
export async function buildTodayStoryPng(input: TodayStoryImageInput): Promise<Blob> {
  const posterUrl = absolutePosterUrl(input.posterSrc);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(posterUrl);
  } catch {
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);
  }

  if (img) {
    drawCover(ctx, img, W, H);
  }

  const grad = ctx.createLinearGradient(0, H * 0.38, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.35, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";

  const accent = input.accentHex ?? "#ffffff";
  let y = H - BOTTOM_PAD;

  const drawBlock = (
    lines: string[],
    fontSize: number,
    weight: string,
    color: string,
    gap: number
  ) => {
    ctx.font = `${weight} ${fontSize}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
    ctx.fillStyle = color;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      ctx.fillText(line, PAD_X, y);
      y -= fontSize + gap;
    }
  };

  if (input.startersLine?.trim()) {
    const lines = wrapLines(ctx, input.startersLine.trim(), MAX_TEXT_W);
    drawBlock(lines, 30, "500", "rgba(255,255,255,0.72)", 10);
    y -= 18;
  }

  if (input.metaLine?.trim()) {
    const lines = wrapLines(ctx, input.metaLine.trim(), MAX_TEXT_W);
    drawBlock(lines, 32, "600", "rgba(255,255,255,0.82)", 12);
    y -= 20;
  }

  if (input.slogan.trim()) {
    ctx.font = `600 40px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
    const sloganLines = wrapLines(ctx, input.slogan.trim(), MAX_TEXT_W).slice(0, 5);
    drawBlock(sloganLines, 40, "600", "rgba(255,255,255,0.95)", 14);
    y -= 28;
  }

  if (input.teamHeadline.trim()) {
    ctx.font = `800 56px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
    ctx.fillStyle = "#ffffff";
    const headLines = wrapLines(ctx, input.teamHeadline.trim(), MAX_TEXT_W).slice(0, 2);
    for (let i = headLines.length - 1; i >= 0; i--) {
      const line = headLines[i]!;
      ctx.fillText(line, PAD_X, y);
      if (i === headLines.length - 1) {
        const w = ctx.measureText(line).width;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(PAD_X, y + 8, Math.min(w, MAX_TEXT_W), 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
      }
      y -= 56 + 12;
    }
  }

  ctx.font = '600 22px "Pretendard Variable", Pretendard, system-ui, sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.fillText("GROUND · KBO TODAY", PAD_X, 56);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      },
      "image/png",
      0.92
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
