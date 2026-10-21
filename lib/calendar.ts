/**
 * Games 캘린더용 날짜 계산 (순수 함수 — 클라이언트/서버 공용).
 *  날짜는 전부 KST 기준 "YYYY-MM-DD" 문자열로 다루고, 계산은 UTC 자정으로 해서 시간대 영향을 없앤다.
 */

export const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function toUtc(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function shiftDate(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay();
}

/** 그 주 일요일 */
export function weekStart(iso: string): string {
  return shiftDate(iso, -dayOfWeek(iso));
}

/** 일~토 7일 */
export function weekDates(iso: string): string[] {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
}

/** "YYYY-MM" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * 월 달력 칸 — 첫 주 일요일부터 6주(42칸) 고정 (앞뒤 달 날짜 포함).
 *  달마다 줄 수가 바뀌면 바텀시트 높이가 달라져 월 이동 버튼 위치가 튄다.
 */
export function monthGrid(month: string): string[] {
  const start = weekStart(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => shiftDate(start, i));
}

/** "10월 2026" */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${m}월 ${y}`;
}

/** "10월 21일 화요일" */
export function longDateLabel(iso: string): string {
  const d = toUtc(iso);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${KO_DOW[d.getUTCDay()]}요일`;
}

/** "3월 28일" */
export function shortDateLabel(iso: string): string {
  const d = toUtc(iso);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export function isValidMonth(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isValidDate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toUtc(s).toISOString().slice(0, 10) === s;
}
