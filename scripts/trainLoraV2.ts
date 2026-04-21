/**
 * trainLoraV2.ts ── `hanryu123/ground.master` 2차 LoRA Fine-tune
 *
 *  ── 흐름 ────────────────────────────────────────────────────────────
 *   1) `ground_dataset.zip` 준비
 *      - 워크스페이스 루트에 이미 있으면 그대로 사용
 *      - 없으면 `public/images/ground_dataset/` (이미지 + 동명 .txt 캡션)
 *        을 시스템 `zip` 으로 묶어 자동 생성
 *   2) Replicate Files API 로 zip 업로드 → 임시 URL 획득
 *   3) `ostris/flux-dev-lora-trainer` 의 최신 버전을 trainer 로 사용해
 *      Trainings API 호출. 결과물은 `hanryu123/ground.master` 로 push.
 *   4) 학습 진행을 60초 간격으로 폴링, 완료되면 새 버전 ID 출력.
 *      (그 ID 를 `.env.local` 의 REPLICATE_MODEL_VERSION 에 박아 넣으면
 *       generate-posters 가 곧장 새 가중치로 동작.)
 *
 *  ── 환경 변수 (`.env.local`) ─────────────────────────────────────────
 *   REPLICATE_API_TOKEN          (필수)
 *   REPLICATE_API_TRIGGER_WORD   (선택, 기본 "ground" — LoRA 마스터 토큰)
 *   REPLICATE_DESTINATION        (선택, 기본 "hanryu123/ground.master")
 *   TRAIN_STEPS                  (선택, 기본 1000)
 *   TRAIN_LR                     (선택, 기본 0.0004)
 *   TRAIN_LORA_RANK              (선택, 기본 16)
 *   TRAIN_RESOLUTION             (선택, 기본 1024)
 *   TRAINER_VERSION              (선택 — ostris/flux-dev-lora-trainer 의
 *                                 특정 버전 hash 고정하고 싶을 때만)
 *   DATASET_ZIP                  (선택 — zip 파일 경로 직접 지정)
 *   DATASET_DIR                  (선택, 기본 public/images/ground_dataset
 *                                 — 자동 zip 소스 폴더)
 *   POLL_INTERVAL_SEC            (선택, 기본 60)
 *
 *  ── 실행 ────────────────────────────────────────────────────────────
 *   npm run train:lora-v2          # 기본값으로 실행
 *   DRY_RUN=1 npm run train:lora-v2  # API 호출 없이 zip 생성만 검증
 */

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import Replicate from "replicate";

// ─── env ───────────────────────────────────────────────────────────
const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env.local") });
dotenv.config();

const TOKEN = process.env.REPLICATE_API_TOKEN;
const MASTER_TRIGGER = (process.env.REPLICATE_API_TRIGGER_WORD ?? "ground").trim();
const DESTINATION = (
  process.env.REPLICATE_DESTINATION ?? "hanryu123/ground.master"
).trim();
const STEPS = parseInt(process.env.TRAIN_STEPS ?? "1000", 10);
const LR = parseFloat(process.env.TRAIN_LR ?? "0.0004");
const LORA_RANK = parseInt(process.env.TRAIN_LORA_RANK ?? "16", 10);
const RESOLUTION = parseInt(process.env.TRAIN_RESOLUTION ?? "1024", 10);
const TRAINER_VERSION = process.env.TRAINER_VERSION?.trim() || null;
const POLL_INTERVAL_SEC = parseInt(process.env.POLL_INTERVAL_SEC ?? "60", 10);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const DATASET_ZIP =
  process.env.DATASET_ZIP?.trim() || path.join(ROOT, "ground_dataset.zip");
const DATASET_DIR =
  process.env.DATASET_DIR?.trim() ||
  path.join(ROOT, "public", "images", "ground_dataset");

if (!TOKEN && !DRY_RUN) {
  console.error("❌ REPLICATE_API_TOKEN 미설정 (.env.local 확인)");
  process.exit(1);
}

// ─── 1) zip 준비 ────────────────────────────────────────────────────
/**
 * 캡션 파일(.txt) 과 동명 이미지가 짝지어진 폴더를 통째로 zip.
 *  - flux-dev-lora-trainer 가 받는 표준 구조: zip 내부 루트에 image+caption pair.
 *  - macOS / Linux 의 시스템 `zip` 사용 (의존성 추가 없음).
 */
async function ensureDatasetZip(): Promise<string> {
  if (fs.existsSync(DATASET_ZIP)) {
    const stat = await fsp.stat(DATASET_ZIP);
    console.log(
      `📦 zip 이미 존재: ${path.relative(ROOT, DATASET_ZIP)} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`
    );
    return DATASET_ZIP;
  }
  if (!fs.existsSync(DATASET_DIR)) {
    throw new Error(
      `dataset 폴더 없음: ${DATASET_DIR}. DATASET_DIR 또는 DATASET_ZIP 환경변수 확인.`
    );
  }
  const entries = await fsp.readdir(DATASET_DIR);
  const images = entries.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (images.length === 0) {
    throw new Error(`${DATASET_DIR} 안에 학습 이미지 없음`);
  }
  console.log(
    `📦 zip 생성: ${images.length} 장 → ${path.relative(ROOT, DATASET_ZIP)}`
  );
  // -j (junk paths): 디렉토리 구조 없이 파일만 루트에 — flux trainer 표준 입력
  const result = spawnSync(
    "zip",
    ["-jq", DATASET_ZIP, ...entries.map((f) => path.join(DATASET_DIR, f))],
    { stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`zip 명령 실패 (exit ${result.status})`);
  }
  return DATASET_ZIP;
}

// ─── 2-3) 업로드 + 학습 호출 ────────────────────────────────────────
async function main() {
  const zipPath = await ensureDatasetZip();

  if (DRY_RUN) {
    console.log("🧪 DRY_RUN — Replicate 호출 생략. zip 만 검증 완료.");
    return;
  }

  const replicate = new Replicate({ auth: TOKEN! });

  // trainer 버전 결정
  let trainerVersionId = TRAINER_VERSION;
  if (!trainerVersionId) {
    console.log("🔎 ostris/flux-dev-lora-trainer 최신 버전 조회…");
    const trainerModel = await replicate.models.get(
      "ostris",
      "flux-dev-lora-trainer"
    );
    if (!trainerModel.latest_version) {
      throw new Error("trainer 모델에 latest_version 없음 — TRAINER_VERSION 으로 직접 지정 필요");
    }
    trainerVersionId = trainerModel.latest_version.id;
  }
  console.log(`   trainer version: ${trainerVersionId}`);

  // destination 모델 존재 확인 (없으면 친절한 안내 후 종료)
  const [destOwner, destName] = DESTINATION.split("/");
  if (!destOwner || !destName) {
    throw new Error(`REPLICATE_DESTINATION 형식 오류: "${DESTINATION}" (owner/name 필요)`);
  }
  try {
    await replicate.models.get(destOwner, destName);
  } catch {
    console.error(
      `❌ destination 모델이 Replicate 에 없음: ${DESTINATION}\n` +
        `   먼저 https://replicate.com/create 에서 빈 모델을 만들어 두어야 함.`
    );
    process.exit(1);
  }

  // zip 업로드 (Replicate Files API)
  //  ── SDK v1.x 의 files.create 는 Blob | File | Buffer 만 받음.
  //     fs.createReadStream() 같은 Node Stream 은 "Invalid file argument" 로 거절.
  //     → 통째로 Buffer 로 읽어서 Blob 으로 감싸 업로드. (12MB 정도라 메모리 OK)
  const stat = await fsp.stat(zipPath);
  console.log(`⬆️  zip 업로드 중… (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  const buffer = fs.readFileSync(zipPath);
  const blob = new Blob([buffer], { type: "application/zip" });
  const file = await replicate.files.create(blob);
  const fileUrl = file.urls.get;
  console.log(`   ✓ uploaded → ${fileUrl.slice(0, 80)}…`);

  // 학습 입력
  const input: Record<string, unknown> = {
    input_images: fileUrl,
    trigger_word: MASTER_TRIGGER,
    steps: STEPS,
    learning_rate: LR,
    lora_rank: LORA_RANK,
    resolution: RESOLUTION,
    autocaption: false, // 우리는 .txt 캡션을 zip 안에 직접 넣음
    batch_size: 1,
    optimizer: "adamw8bit",
    cache_latents_to_disk: false,
  };

  console.log(`🚀 학습 시작 → ${DESTINATION}`);
  console.log(`   trigger="${MASTER_TRIGGER}" steps=${STEPS} lr=${LR} rank=${LORA_RANK}`);

  let training = await replicate.trainings.create(
    "ostris",
    "flux-dev-lora-trainer",
    trainerVersionId,
    {
      destination: DESTINATION as `${string}/${string}`,
      input,
    }
  );
  console.log(`   training id: ${training.id}`);
  console.log(`   진행 상황: https://replicate.com/p/${training.id}`);

  // ─── 4) 폴링 ───────────────────────────────────────────────────────
  const startedAt = Date.now();
  while (
    training.status !== "succeeded" &&
    training.status !== "failed" &&
    training.status !== "canceled"
  ) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_SEC * 1000));
    training = await replicate.trainings.get(training.id);
    const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
    console.log(`   [${elapsedMin}m] status=${training.status}`);
  }

  if (training.status !== "succeeded") {
    console.error(`❌ 학습 실패: status=${training.status}`);
    if (training.error) console.error(`   error: ${training.error}`);
    process.exit(2);
  }

  // 결과 — 새 버전 hash 추출
  const output = training.output as { version?: string; weights?: string } | null;
  const newVersion =
    typeof output === "object" && output && "version" in output && output.version
      ? output.version
      : null;

  console.log(`\n✅ 학습 완료 (${((Date.now() - startedAt) / 60_000).toFixed(1)}분)`);
  if (newVersion) {
    console.log(`\n   새 버전: ${newVersion}\n`);
    console.log(`   .env.local 갱신:`);
    console.log(`   REPLICATE_MODEL_VERSION=${newVersion}\n`);
  } else {
    console.log(
      `   (output 에 version 없음 — Replicate 콘솔에서 https://replicate.com/${DESTINATION} 의 latest version 확인)`
    );
  }
}

main().catch((err) => {
  console.error(`💥 ${(err as Error).stack ?? err}`);
  process.exit(1);
});
