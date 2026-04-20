/**
 * 오늘의 KBO 경기 결과 — 수동 컨트롤 룸 (Mock)
 *
 * 외부 결과 API가 연결되기 전까지 이 파일을 손으로 갱신해서 사용한다.
 * 키는 항상 대문자(영문 약칭, TEAM_CONFIG 키와 동일).
 *
 *  - isWinner === true   → 해당 팀 승리 (Night Slot에 victory 화보 노출)
 *  - isWinner === false  → 패배 또는 경기 전/취소 (Night Slot에 _night.jpg 노출)
 *
 * 갱신 흐름:
 *  - 매일 22:00 직전(혹은 경기 종료 직후) 이 파일의 isWinner 값만 업데이트.
 *  - 경기가 없는 팀은 그대로 false로 두면 됨.
 *  - 추후 KBO 결과 API 연결 시, 동일 인터페이스(`isTeamWinnerToday`)만 유지하면
 *    호출 측(HeroCard)은 변경 없이 그대로 동작.
 */

export type TodayResult = {
  isWinner: boolean;
};

export const todayResults: Record<string, TodayResult> = {
  LG: { isWinner: false },
  KIA: { isWinner: false },
  KT: { isWinner: false },
  SSG: { isWinner: false },
  NC: { isWinner: false },
  DOOSAN: { isWinner: false },
  // 데모용 — 삼성만 승리로 두어 Night Slot에서 victory 화보가 노출되는지 확인 가능.
  SAMSUNG: { isWinner: true },
  LOTTE: { isWinner: false },
  HANWHA: { isWinner: false },
  KIWOOM: { isWinner: false },
};

/** 대/소문자 어떤 형식이 들어와도 안전하게 조회하는 헬퍼 */
export function isTeamWinnerToday(
  teamId: string | null | undefined
): boolean {
  if (!teamId) return false;
  return Boolean(todayResults[teamId.toUpperCase()]?.isWinner);
}
