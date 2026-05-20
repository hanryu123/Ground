/**
 * KST 기준 경기 시간대 가드.
 *
 * isKboGameHour  — 경기 진행 중 구간 (check-score, live-events)
 *   주중(화~금): 18:00 ~ 22:30
 *   주말(토~일): 14:00 ~ 21:00
 *   월요일: false (KBO 정기 휴식일)
 *
 * isKboPostgameHour — 경기 종료 후 구간 (postgame)
 *   주중(화~금): 21:00 ~ 23:30
 *   주말(토~일): 19:30 ~ 22:30
 *   월요일: false
 */

export function isKboGameHour(now?: Date): boolean {
  const kst = toKst(now ?? new Date());
  const day      = kst.getDay();
  const totalMin = kst.getHours() * 60 + kst.getMinutes();

  if (day === 1) return false; // 월요일 휴식

  const isWeekend = day === 0 || day === 6;
  return isWeekend
    ? totalMin >= 14 * 60 && totalMin < 21 * 60        // 14:00~21:00
    : totalMin >= 18 * 60 && totalMin < 22 * 60 + 30;  // 18:00~22:30
}

export function isKboPostgameHour(now?: Date): boolean {
  const kst = toKst(now ?? new Date());
  const day      = kst.getDay();
  const totalMin = kst.getHours() * 60 + kst.getMinutes();

  if (day === 1) return false; // 월요일 휴식

  const isWeekend = day === 0 || day === 6;
  return isWeekend
    ? totalMin >= 19 * 60 + 30 && totalMin < 22 * 60 + 30  // 19:30~22:30
    : totalMin >= 21 * 60      && totalMin < 23 * 60 + 30;  // 21:00~23:30
}

function toKst(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}
