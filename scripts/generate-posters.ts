/**
 * KBO 화보 자동 생성기 — Replicate AI
 *
 * 실행 방법:
 *   npm run posters:morning    # 모드: 아침 (06시 크론)
 *   npm run posters:night      # 모드: 밤 (22시 크론, 승패 분기)
 *   npm run posters:dry        # API 호출 없이 프롬프트만 출력 (검증용)
 *
 * 환경변수 (.env.local 또는 GH Secrets):
 *   REPLICATE_API_TOKEN          — 필수
 *   REPLICATE_MODEL_VERSION      — 필수, 예: "user/repo:hashversion"
 *   REPLICATE_API_TRIGGER_WORD   — 선택, 마스터 LoRA 트리거 (기본 "ground")
 *   POSTER_WIDTH / POSTER_HEIGHT — 선택, 기본 832x1216
 *   POSTER_STEPS / POSTER_GUIDANCE — 선택, 기본 30 / 7.5
 *
 * 트리거 합성 (`hanryu123/ground.master` LoRA 전용):
 *   1) master  ("ground")              — env 로 받음, LoRA 본체 활성화
 *   2) team    ("ground.lg" 등)        — TRIGGER_BY_TEAM 매핑 (학습 폴더명)
 *   3) mode    ("ground.victory" 등)   — promptBuilder 내부에서 자동 부착
 *   세 트리거는 프롬프트 맨 앞에 직렬로 들어가 LoRA 토큰 가중치를 최대화.
 *
 * 저장 경로:
 *   morning: public/images/refs/ready/${teamId.toLowerCase()}.jpg
 *   night + winner: public/images/refs/victory/${teamId.toLowerCase()}.jpg
 *   night + loser/no-game: public/images/refs/ready/${teamId.toLowerCase()}.jpg
 *      (밤에도 이긴 게 아니라면 ready 슬롯이 그대로 노출되므로 ready 갱신)
 *
 * 결과 로그:
 *   logs/generation.log  (콘솔 + 파일 동시 기록)
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import Replicate from "replicate";
import sharp from "sharp";

import { TEAM_CONFIG } from "../config/teams";
import { isTeamWinnerToday } from "../config/todayGames";
import { TEAM_PROMPT_META } from "../config/posterPrompts";
import { buildPrompt, type PromptMode } from "./lib/promptBuilder";
import { appendLog, appendLogBlock, logBoth } from "./lib/log";
import {
  fetchKboTodayGames,
  getTeamGame,
  type LiveGame,
  type TeamGameView,
} from "../lib/kbo";

// ─── env ───────────────────────────────────────────────────────────
const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env.local") });
dotenv.config(); // .env fallback

type Mode = "morning" | "night";
const MODE = (process.env.MODE ?? "morning") as Mode;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

if (MODE !== "morning" && MODE !== "night") {
  console.error(`MODE must be "morning" or "night" (got "${MODE}")`);
  process.exit(1);
}

const TOKEN = process.env.REPLICATE_API_TOKEN;
const MODEL = process.env.REPLICATE_MODEL_VERSION;
const MASTER_TRIGGER = (process.env.REPLICATE_API_TRIGGER_WORD ?? "ground").trim();

/**
 * CLI: `--teams=lg,kia,samsung` 또는 env `TEAMS=lg,kia` 로 부분 생성.
 * 비어있으면 전체 10팀 생성.
 */
function parseTeamFilter(): Set<string> | null {
  const raw =
    process.argv.find((a) => a.startsWith("--teams="))?.slice("--teams=".length) ??
    process.env.TEAMS ??
    "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? new Set(list) : null;
}
const TEAM_FILTER = parseTeamFilter();

/**
 * 팀별 LoRA 트리거 워드 — **학습된 폴더명 그대로** 매핑.
 *
 * `prepare_lora_dataset.py` 가 폴더명을 캡션에 그대로 박았기 때문에,
 * 학습 토큰과 정확히 일치해야 LoRA 효과가 발동한다.
 * dataset/ 폴더명이 들쭉날쭉(공백/대소문자/오타)이라 매핑 테이블로 못박는다.
 *
 * (장기 정리: dataset 폴더명을 정규화 후 재학습하면 이 매핑이 필요없어진다.)
 */
const TRIGGER_BY_TEAM: Record<string, string> = {
  // 정상 매칭
  lg: "ground.lg",
  kia: "ground.kia",
  doosan: "ground.doosan",
  samsung: "ground.samsung",
  // 학습 시 폴더명에 공백 + 첫글자 대문자
  kt: "ground. KT",
  kiwoom: "ground. Kiwoom",
  lotte: "ground. Lotte",
  nc: "ground. NC",
  // 학습 시 첫글자 대문자만
  ssg: "ground.SSG",
  // 학습 시 오타
  hanwha: "ground.Hanhwa",
};

function triggerForTeam(teamId: string): string {
  const id = teamId.toLowerCase();
  return TRIGGER_BY_TEAM[id] ?? `ground.${id}`;
}

// 2026 프리미엄 모드: steps↑↑ + flux 안전 guidance + 1MP 풀 해상도.
// (사장님 8K 오더 → cog 한계상 1MP 생성 후 Real-ESRGAN 4x 업스케일 후처리)
const STEPS = Number(process.env.POSTER_STEPS ?? 50);
const GUIDANCE = Number(process.env.POSTER_GUIDANCE ?? 4.5);
const ASPECT_RATIO = process.env.POSTER_ASPECT ?? "9:16";
const LORA_SCALE = Number(process.env.POSTER_LORA_SCALE ?? 1.0);
const MEGAPIXELS = (process.env.POSTER_MEGAPIXELS ?? "1") as "1" | "0.25";

// Real-ESRGAN 4x 업스케일 — 활성화 시 1024x1536 → 4096x6144
// env `POSTER_UPSCALE=0` 으로 끌 수 있음. 비용·시간 추가 (~10s/장)
const UPSCALE_ENABLED = process.env.POSTER_UPSCALE !== "0";
const UPSCALE_MODEL =
  "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";
const UPSCALE_FACTOR = Number(process.env.POSTER_UPSCALE_FACTOR ?? 4);
/**
 * img2img 강도 — flux-dev 기준 1.0=reference 완전 무시, 0.0=완전 보존.
 *
 *  ── 1.0 으로 상향한 이유 (LG 흰배경 사고 후속) ──
 *   reference 인 `public/images/refs/uniforms/<team>.jpg` 가 흰 배경 상품컷
 *   (빈 유니폼만 떠 있는 쇼핑몰 사진) 이라, prompt_strength=0.96 에서도
 *   배경 흰색과 "사람 없는 빈 옷" 컴포지션이 출력에 살아남았다.
 *   → 1.0 으로 올려 reference 의 픽셀 영향을 거의 0 으로 만들고, 유니폼
 *     식별은 LoRA 학습 + prompt 의 uniformSignature 텍스트로만 처리한다.
 *   장기적으론 reference 이미지 자체를 어두운 stadium 배경에 선수가 입은
 *   컷으로 교체하는 게 맞다.
 */
const PROMPT_STRENGTH = Number(process.env.POSTER_PROMPT_STRENGTH ?? 1.0);

if (!DRY_RUN) {
  if (!TOKEN) {
    console.error("REPLICATE_API_TOKEN is required (set in .env.local or env).");
    process.exit(1);
  }
  if (!MODEL) {
    console.error(
      'REPLICATE_MODEL_VERSION is required (e.g. "user/repo:versionhash").'
    );
    process.exit(1);
  }
}

// ─── paths ─────────────────────────────────────────────────────────
const READY_DIR = path.join(ROOT, "public/images/refs/ready");
const VICTORY_DIR = path.join(ROOT, "public/images/refs/victory");
const UNIFORM_DIR = path.join(ROOT, "public/images/refs/uniforms");

/**
 * 팀 reference 유니폼 사진을 읽어 base64 data URI 로 반환.
 * 파일이 없으면 null → img2img 없이 text-only 생성으로 fallback.
 */
async function loadUniformDataUri(teamId: string): Promise<string | null> {
  const file = path.join(UNIFORM_DIR, `${teamId.toLowerCase()}.jpg`);
  try {
    const buf = await fs.readFile(file);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── helpers ───────────────────────────────────────────────────────

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/**
 * Replicate SDK 의 다양한 출력 형태 흡수 (string / string[] / FileOutput).
 */
async function urlFromOutput(output: unknown): Promise<string> {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    return urlFromOutput(output[0]);
  }
  if (output && typeof output === "object") {
    const o = output as { url?: () => URL | string };
    if (typeof o.url === "function") {
      const u = o.url();
      return typeof u === "string" ? u : u.toString();
    }
  }
  throw new Error(
    `unexpected output shape: ${JSON.stringify(output).slice(0, 200)}`
  );
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed (HTTP ${res.status}) for ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * 얼굴 음영 강화 — 위쪽 영역에 어두운 그라디언트를 곱하기(blend) 로 덧씌움.
 *  ─ flux-dev 는 prompt 의 "shadow under cap brim" 을 잘 안 따라줌.
 *  ─ 그래서 출력물에 직접 모자 챙 그림자 효과를 합성한다.
 *  ─ 위 0~38% 구간이 점진적으로 어두워짐 → 얼굴이 자동으로 그늘에 들어감.
 *  ─ 하단 (가슴 wordmark + 다리) 은 영향 없음 → 유니폼 식별성 유지.
 *
 * env `POSTER_FACE_SHADOW=0` 으로 비활성 가능. 기본 강도 0.55.
 */
const FACE_SHADOW_ENABLED = process.env.POSTER_FACE_SHADOW !== "0";
const FACE_SHADOW_STRENGTH = Math.max(
  0,
  Math.min(0.9, Number(process.env.POSTER_FACE_SHADOW ?? 0.55))
);

async function applyFaceShadow(buf: Buffer): Promise<Buffer> {
  if (!FACE_SHADOW_ENABLED || FACE_SHADOW_STRENGTH <= 0) return buf;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 832;
  const h = meta.height ?? 1216;
  // 위쪽 0% (가장 어두움) → 38% 부근에서 완전 투명
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="black" stop-opacity="${FACE_SHADOW_STRENGTH.toFixed(3)}"/>
      <stop offset="22%" stop-color="black" stop-opacity="${(FACE_SHADOW_STRENGTH * 0.6).toFixed(3)}"/>
      <stop offset="38%" stop-color="black" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
</svg>`;
  return sharp(buf, { failOn: "none" })
    .composite([{ input: Buffer.from(svg), blend: "multiply" }])
    .toBuffer();
}

/**
 * sharp 로 mozjpeg 최적화 — 점진 인코딩, EXIF 제거.
 *  - 업스케일된 4K+ 입력은 화질 보존을 위해 quality=92, 일반은 88
 *  - 모바일 배포 사이즈 고려: 너비가 2048↑면 2048 로 다운샘플 (lanczos3)
 *    → 화면에서 retina display 충분, 파일 크기 1~2MB 선
 */
async function optimizeJpeg(buf: Buffer, upscaled = false): Promise<Buffer> {
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  let pipeline = sharp(buf, { failOn: "none" }).rotate();
  if (upscaled && meta.width && meta.width > 2048) {
    pipeline = pipeline.resize({ width: 2048, withoutEnlargement: true, kernel: "lanczos3" });
  }
  return pipeline
    .jpeg({ quality: upscaled ? 92 : 88, mozjpeg: true, progressive: true })
    .withMetadata({ exif: undefined })
    .toBuffer();
}

/**
 * 승리 판정 — 라이브 KBO 데이터(view)가 있으면 그것을 1순위로 보고,
 * 없으면 기존 static todayGames 폴백. 승리 트리거(ground.victory) 자동 부착의 단일 출처.
 */
function isWinnerNow(teamId: string, view?: TeamGameView | null): boolean {
  if (view) return view.isWinner;
  return isTeamWinnerToday(teamId);
}

function pickPromptMode(teamId: string, view?: TeamGameView | null): PromptMode {
  if (MODE === "morning") return "morning";
  return isWinnerNow(teamId, view) ? "night-victory" : "night-default";
}

function pickOutputPath(teamId: string, view?: TeamGameView | null): string {
  const file = `${teamId.toLowerCase()}.jpg`;
  if (MODE === "night" && isWinnerNow(teamId, view)) {
    return path.join(VICTORY_DIR, file);
  }
  return path.join(READY_DIR, file);
}

// ─── core: generate one team ───────────────────────────────────────

type Result = {
  teamId: string;
  promptMode: PromptMode;
  ok: boolean;
  outPath?: string;
  bytes?: number;
  error?: string;
  durationMs?: number;
};

async function generateOne(
  replicate: Replicate | null,
  teamId: string,
  liveView: TeamGameView | null = null
): Promise<Result> {
  const meta = TEAM_PROMPT_META[teamId];
  if (!meta) {
    return {
      teamId,
      promptMode: "morning",
      ok: false,
      error: `no prompt meta for "${teamId}"`,
    };
  }

  const promptMode = pickPromptMode(teamId, liveView);
  const outPath = pickOutputPath(teamId, liveView);
  const triggerWord = triggerForTeam(teamId);
  const prompt = buildPrompt({
    teamId,
    mode: promptMode,
    meta,
    triggerWord,
    masterTrigger: MASTER_TRIGGER,
    starterName: liveView?.starter ?? null,
  });

  // 팀별 reference 유니폼 사진 (img2img 시드)
  const uniformImage = await loadUniformDataUri(teamId);
  const hasRef = uniformImage !== null;

  if (DRY_RUN || !replicate) {
    const refLabel = hasRef
      ? `img2img(uniforms/${teamId.toLowerCase()}.jpg, strength=${PROMPT_STRENGTH})`
      : "text-only (no uniform ref)";
    await appendLogBlock([
      `[DRY] ${teamId} (${promptMode}) → ${path.relative(ROOT, outPath)}`,
      `[DRY] ${refLabel}`,
      `[DRY] prompt: ${prompt}`,
    ]);
    console.log(`[${teamId}] DRY → ${path.relative(ROOT, outPath)}  [${refLabel}]`);
    console.log(`        ${prompt}`);
    return { teamId, promptMode, ok: true, outPath };
  }

  const t0 = Date.now();
  try {
    await ensureDir(path.dirname(outPath));

    /**
     * `hanryu123/ground.master` (flux-dev 베이스) input 스키마:
     *   prompt, image, prompt_strength, aspect_ratio, lora_scale,
     *   num_inference_steps, guidance_scale, output_format, output_quality, num_outputs
     * (negative_prompt 미지원 — flux 가 reject. 부정문은 prompt 안에 양성형으로 박았음.)
     */
    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: ASPECT_RATIO,
      megapixels: MEGAPIXELS,
      num_inference_steps: STEPS,
      guidance_scale: GUIDANCE,
      lora_scale: LORA_SCALE,
      output_format: "jpg",
      output_quality: 100,
      num_outputs: 1,
    };
    if (hasRef) {
      input.image = uniformImage;
      input.prompt_strength = PROMPT_STRENGTH;
    }

    const output = await replicate.run(
      MODEL as `${string}/${string}:${string}`,
      { input }
    );

    const url = await urlFromOutput(output);

    // 2026 프리미엄: 1024x1536 (1MP) → Real-ESRGAN 4x 업스케일 → 4096x6144
    let finalUrl = url;
    let upscaled = false;
    if (UPSCALE_ENABLED) {
      try {
        const up = await replicate.run(
          UPSCALE_MODEL as `${string}/${string}:${string}`,
          { input: { image: url, scale: UPSCALE_FACTOR, face_enhance: true } }
        );
        finalUrl = await urlFromOutput(up);
        upscaled = true;
      } catch (upErr) {
        // 업스케일 실패해도 원본 1MP 으로 폴백 — fatal 아님
        console.warn(`[${teamId}] upscale fail (${upErr instanceof Error ? upErr.message : upErr}) → fallback 1MP`);
      }
    }

    const raw = await downloadBuffer(finalUrl);
    const shaded = await applyFaceShadow(raw);
    const optimized = await optimizeJpeg(shaded, upscaled);
    await fs.writeFile(outPath, optimized);

    const durationMs = Date.now() - t0;
    return {
      teamId,
      promptMode,
      ok: true,
      outPath,
      bytes: optimized.byteLength,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - t0;
    return {
      teamId,
      promptMode,
      ok: false,
      outPath,
      error: e instanceof Error ? e.message : String(e),
      durationMs,
    };
  }
}

// ─── main ──────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  const filterLabel = TEAM_FILTER
    ? `teams=[${[...TEAM_FILTER].join(",")}]`
    : `teams=ALL(10)`;
  const header = [
    `==============================================================`,
    `Poster generation start: ${startedAt.toISOString()}`,
    `mode=${MODE}  dryRun=${DRY_RUN}  ${filterLabel}`,
    `trigger=master:"${MASTER_TRIGGER}" + per-team(TRIGGER_BY_TEAM) + per-mode(MODE_TRIGGER)`,
    `model=${MODEL ?? "(unset)"}`,
    `output: aspect=${ASPECT_RATIO} ${MEGAPIXELS}MP, steps=${STEPS}, guidance=${GUIDANCE}, lora=${LORA_SCALE}, prompt_strength=${PROMPT_STRENGTH}`,
    `upscale: ${UPSCALE_ENABLED ? `Real-ESRGAN x${UPSCALE_FACTOR} → resize 2048w` : "OFF"}`,
    `==============================================================`,
  ];
  console.log(header.join("\n"));
  await appendLogBlock(header);

  const replicate =
    DRY_RUN || !TOKEN ? null : new Replicate({ auth: TOKEN! });

  // ── 라이브 KBO 컨텍스트 1회 fetch (실패 시 정적 폴백) ─────────────
  let liveGames: LiveGame[] = [];
  try {
    liveGames = await fetchKboTodayGames();
    const fmt = liveGames
      .map(
        (g) =>
          `  ${g.time}  ${g.awayId.toUpperCase()}@${g.homeId.toUpperCase()}  ` +
          `[${g.status}]  starter: ${g.awayPitcher} vs ${g.homePitcher}` +
          (g.result
            ? `  → ${g.result.awayScore}-${g.result.homeScore} (winner=${g.result.winnerId ?? "draw"})`
            : "")
      )
      .join("\n");
    const liveBlock = [
      "── LIVE KBO context ──",
      `games(${liveGames.length}):`,
      fmt || "  (none)",
      "──────────────────────",
    ];
    console.log(liveBlock.join("\n"));
    await appendLogBlock(liveBlock);
  } catch (e) {
    console.warn(`[live] failed: ${(e as Error).message} — proceeding without`);
  }

  const allTeamIds = Object.keys(TEAM_CONFIG);
  const teamIds = TEAM_FILTER
    ? allTeamIds.filter((t) => TEAM_FILTER.has(t.toLowerCase()))
    : allTeamIds;
  if (teamIds.length === 0) {
    console.error(`[fatal] team filter matched 0 teams. available=${allTeamIds.join(",")}`);
    process.exit(1);
  }
  const results: Result[] = [];

  // 직렬 처리 — Replicate 동시 호출 폭주 방지 + rate limit 안전
  for (const teamId of teamIds) {
    const view = getTeamGame(liveGames, teamId);
    const liveLabel = view
      ? `starter=${view.starter ?? "미정"} winner=${view.isWinner}`
      : "no-game-today";
    process.stdout.write(`[${teamId}] generating... (${liveLabel})\n`);
    const r = await generateOne(replicate, teamId, view);
    results.push(r);

    if (r.ok) {
      const sizeLabel = r.bytes ? `${(r.bytes / 1024).toFixed(0)}KB` : "—";
      const durLabel = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—";
      const rel = r.outPath ? path.relative(ROOT, r.outPath) : "—";
      const line = `[${teamId}] OK  (${r.promptMode}) → ${rel}  [${sizeLabel}, ${durLabel}]`;
      await logBoth(line);
    } else {
      const line = `[${teamId}] FAIL (${r.promptMode}) → ${r.error}`;
      await logBoth(line);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const finishedAt = new Date();
  const totalSec = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);

  const footer = [
    `--------------------------------------------------------------`,
    `Done: ${ok} ok / ${fail} fail / ${results.length} total`,
    `Elapsed: ${totalSec}s   finished=${finishedAt.toISOString()}`,
    `==============================================================`,
    "",
  ];
  console.log(footer.join("\n"));
  await appendLogBlock(footer);

  // 실패가 하나라도 있으면 exit 1 (CI가 빨갛게 표시되도록)
  if (fail > 0) process.exit(1);
}

// ESM에서도 안전하게 "직접 실행"인지 판별
const __filename = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  main().catch(async (e) => {
    const msg = e instanceof Error ? e.stack || e.message : String(e);
    console.error(msg);
    await appendLog(`FATAL: ${msg}`);
    process.exit(1);
  });
}
