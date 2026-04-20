/**
 * 생성 결과 로그 (콘솔 + logs/generation.log)
 *
 * GitHub Actions 에서 실행될 때 결과 파일이 git에 함께 커밋되어
 * 사용자가 아침에 PR/커밋 히스토리에서 바로 확인할 수 있다.
 */

import path from "node:path";
import fs from "node:fs/promises";

const LOG_PATH = path.join(process.cwd(), "logs/generation.log");

async function ensureDir(): Promise<void> {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
}

export async function appendLog(line: string): Promise<void> {
  await ensureDir();
  const stamp = new Date().toISOString();
  await fs.appendFile(LOG_PATH, `[${stamp}] ${line}\n`, "utf8");
}

export async function appendLogBlock(lines: string[]): Promise<void> {
  await ensureDir();
  const stamp = new Date().toISOString();
  const body = lines.map((l) => `[${stamp}] ${l}`).join("\n") + "\n";
  await fs.appendFile(LOG_PATH, body, "utf8");
}

export function logBoth(line: string): Promise<void> {
  console.log(line);
  return appendLog(line);
}
