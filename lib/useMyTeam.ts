"use client";

import { useEffect, useState } from "react";
import { findTeam, type Team } from "./teams";

export const MY_TEAM_KEY = "kbo-my-team";
export const MY_TEAM_EVENT = "kbo:my-team-change";

const DEFAULT_ID = "doosan";

export function useMyTeam(): Team {
  const [id, setId] = useState<string>(DEFAULT_ID);

  useEffect(() => {
    try {
      const v = localStorage.getItem(MY_TEAM_KEY);
      if (v) setId(v);
    } catch {}

    const onChange = () => {
      try {
        const v = localStorage.getItem(MY_TEAM_KEY);
        if (v) setId(v);
      } catch {}
    };

    window.addEventListener("storage", onChange);
    window.addEventListener(MY_TEAM_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(MY_TEAM_EVENT, onChange);
    };
  }, []);

  return findTeam(id);
}

export function setMyTeam(id: string) {
  try {
    localStorage.setItem(MY_TEAM_KEY, id);
    window.dispatchEvent(new Event(MY_TEAM_EVENT));
  } catch {}
}

/**
 * 응원 팀이 명시적으로 선택되었는지 + localStorage 확인이 끝났는지 메타 정보.
 *
 *  - hasChosen: 사용자가 한 번이라도 팀을 선택했는가 (= localStorage 키 존재)
 *  - isReady:   클라이언트에서 localStorage 조회가 끝났는가 (SSR/hydration 안전 가드)
 *
 * 첫 진입 분기(메인 화보 vs. 팀 선택 풀스크린)에 사용한다.
 */
export function useMyTeamMeta(): { hasChosen: boolean; isReady: boolean } {
  const [state, setState] = useState<{ hasChosen: boolean; isReady: boolean }>({
    hasChosen: false,
    isReady: false,
  });

  useEffect(() => {
    const check = () => {
      try {
        const v = localStorage.getItem(MY_TEAM_KEY);
        setState({ hasChosen: !!v, isReady: true });
      } catch {
        setState({ hasChosen: false, isReady: true });
      }
    };
    check();
    window.addEventListener("storage", check);
    window.addEventListener(MY_TEAM_EVENT, check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener(MY_TEAM_EVENT, check);
    };
  }, []);

  return state;
}
