# User Prompt Template

아래 입력을 바탕으로 오늘 날짜 {date}의 10개 구단 A/B/C 카피를 생성한다.

## 오늘의 컨텍스트

```json
{context_json}
```

## 지시

1. 위 JSON의 `teams` 객체에 있는 10개 팀 각각에 대해 A/B/C 3개 옵션과 `anchor_used`, `rationale`을 작성한다.
2. `last_game.result`, `streak`, `situation`, `hero`, `next_game` 등을 반드시 반영한다.
3. `situation`이 `special_situations.json`의 키에 해당하면 해당 `tone_shift`와 `prompt_hints`를 우선 적용한다.
4. 한 팀의 A/B/C는 서로 다른 앵커 또는 서로 다른 각도에서 쓴다(3개가 서로 다른 카피여야 함).
5. 결과는 system prompt에 명시된 JSON 구조로만 응답한다.

## Special Situations 참조

```json
{special_situations_json}
```

## 추가 주의

- 오늘 경기가 없는 팀(예: `last_game`이 null): `off_day` 또는 `rain_out` 톤 적용.
- 1위 팀이라도 "우리가 1위다" 식 자랑 금지. 팀 voice에 맞는 표현으로 변주.
- 꼴찌여도 자조 금지. 각 팀 DNA의 `avoid`를 최우선 지킨다.
