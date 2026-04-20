# KBO Daily Copy Pipeline

매일 아침 10개 구단의 한 줄 "출사표" 카피(A/B/C 옵션)를 Claude API로 생성하고, 9:16 공유 카드 PNG로 렌더링하는 드롭-인 파이프라인.

## 구조

```
kbo_daily_copy/
├── team_dna.json              # 10개 팀 브랜드 DNA (anchors, voice, do, avoid, signature_moves)
├── team_colors.json           # 팀 컬러 팔레트 (primary/secondary/accent)
├── special_situations.json    # 특수 상황 프리셋 (우천/스윕/끝내기 등)
├── fallback_copy.json         # API 실패 시 안전망 카피
├── notifications.json         # 푸시 알림 템플릿
├── daily_inputs_sample.json   # 입력 예시 (2026-04-20)
├── system_prompt.md           # Claude system prompt (캐시됨)
├── user_prompt_template.md    # User prompt 템플릿
├── quality_gate.py            # 길이·금칙어·비하 검증
├── generate_daily_copy.py     # 메인: 카피 생성
├── render_share_card.py       # 9:16 공유 카드 렌더
├── requirements.txt
├── .env.example
└── README.md
```

## 빠른 시작

```bash
cd kbo_daily_copy
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 열어서 ANTHROPIC_API_KEY 채우기

# 1) dry-run (프롬프트만 확인)
python generate_daily_copy.py \
    --inputs daily_inputs_sample.json \
    --out out/2026-04-20.json \
    --dry-run

# 2) 실제 호출
python generate_daily_copy.py \
    --inputs daily_inputs_sample.json \
    --out out/2026-04-20.json

# 3) 공유 카드 이미지 렌더
python render_share_card.py \
    --input out/2026-04-20.json \
    --outdir out/cards/2026-04-20 \
    --options A,B,C
```

## 출력 형식

`out/YYYY-MM-DD.json`:

```json
{
  "date": "2026-04-20",
  "generated_at": "2026-04-20T00:31:12+0900",
  "model": "claude-opus-4-6",
  "results": {
    "LG": {
      "A": "...",
      "B": "...",
      "C": "...",
      "anchor_used": "복습",
      "rationale": "2연승 + 라이벌전 스윕 직전",
      "colors": { "primary": "#C30452", ... }
    },
    ...
  }
}
```

## 매일 입력 채우기

`daily_inputs.json`을 매일 00:30에 업데이트한다. 필수 필드:

- `date`: YYYY-MM-DD
- `teams.<CODE>.last_game`: `{ result, score, opponent, venue, hero }` (경기 없으면 null)
- `teams.<CODE>.standing`: `{ rank, w, l, gb }`
- `teams.<CODE>.streak`: 예 "W3", "L2"
- `teams.<CODE>.next_game`: `{ opponent, venue, starter }`
- `teams.<CODE>.situation`: `special_situations.json`의 키 (없으면 null)
- `teams.<CODE>.notes`: 자유 텍스트 (한 줄 맥락)

`situation`에 `"walkoff_win"`, `"winning_streak"`, `"losing_streak"` 등을 넣으면 해당 프리셋의 `tone_shift`와 `prompt_hints`가 반영된다.

## 품질 게이트

`quality_gate.py`가 다음을 검사하고 실패 시 해당 팀은 `fallback_copy.json`으로 대체:

- A/B/C 길이(각각 12~150 / 8~80 / 4~40자)
- 금칙어 (드디어, 화이팅, 이모지, 해시태그 등)
- 타 팀 비하 맥락
- 숫자 과다 (3개 이상)
- 단문 4개 이상 연속 나열
- A/B/C 동일 문장 여부

개별 팀이 실패해도 나머지 9팀은 LLM 결과를 유지한다.

## 비용 추정

Prompt caching 활용(system_prompt + team_dna.json 캐시) 시:
- 최초 호출: ~$0.15
- 이후 호출(5분 내): ~$0.03
- 매일 1회만 돌리면 매번 풀 요금이므로 약 **$0.10~0.15/일, 월 $3~5**
- Sonnet으로 바꾸면 1/5 수준

## 크론 예시 (매일 00:30 KST)

```cron
30 0 * * * cd /path/to/kbo_daily_copy && \
  /path/to/.venv/bin/python generate_daily_copy.py \
    --inputs daily_inputs.json \
    --out out/$(date +\%Y-\%m-\%d).json \
    >> logs/$(date +\%Y-\%m).log 2>&1 && \
  /path/to/.venv/bin/python render_share_card.py \
    --input out/$(date +\%Y-\%m-\%d).json \
    --outdir out/cards/$(date +\%Y-\%m-\%d) \
    --options A,B,C
```

## 카피 톤 수정하고 싶을 때

1. 팀 단위 톤: `team_dna.json`의 해당 팀 `voice`, `do`, `avoid`, `signature_moves` 수정.
2. 전 구단 공통 규칙: `system_prompt.md` 수정.
3. 상황별 프리셋: `special_situations.json`의 `prompt_hints` 수정.
4. 금칙어: `quality_gate.py`의 `BANNED_PATTERNS` 리스트.

## 트러블슈팅

- **`ANTHROPIC_API_KEY 환경변수가 없습니다`**: `.env` 파일이 스크립트와 같은 폴더에 있는지 확인. 또는 `export ANTHROPIC_API_KEY=...`.
- **모든 팀이 fallback으로 대체됨**: 로그의 `[qc-fail]` 줄을 확인. 대부분 길이 초과 또는 금칙어 매칭. `quality_gate.py`의 임계값 조정.
- **한글이 □로 표시됨**: 시스템에 한글 폰트가 없다. macOS는 기본으로 있음. Linux는 `apt install fonts-nanum` 또는 `fonts-noto-cjk`.
- **JSON 파싱 실패**: 모델이 JSON 외 텍스트를 섞어서 반환. `system_prompt.md`의 "JSON 외 어떤 문자도 출력하지 말 것" 줄을 더 강조하거나 `max_tokens`를 늘린다.

## 확장 아이디어

- 경기 데이터 자동 수집(KBO 공식 OR 서드파티 API)으로 `daily_inputs.json`을 크론 앞단에서 자동 생성
- Slack/Discord 웹훅으로 생성 결과 자동 전송
- A/B 성과 트래킹: 실제 공유/저장률을 수집해 팀별 선호 옵션 학습
- 경기 중간 실시간 업데이트: 이닝별 주요 이벤트 발생 시 on-demand 생성
- 선수 개인 카드: 당일 MVP에게 별도 카피
