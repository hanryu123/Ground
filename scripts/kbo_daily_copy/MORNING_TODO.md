# 내일 아침 To-Do (자고 일어나서 할 일)

어젯밤(2026-04-19) 만들어놓은 드롭-인 패키지를 실제로 돌려보는 절차.

## 1) 파일 복사 (커서로 이동)

`kbo_daily_copy/` 폴더 전체를 작업 중인 Cursor 프로젝트로 복사.

## 2) 환경 설정 (5분)

```bash
cd kbo_daily_copy
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

`.env` 열어서 `ANTHROPIC_API_KEY` 채우기.

## 3) 스모크 테스트 (1분)

```bash
# 프롬프트만 찍어서 눈으로 확인
python generate_daily_copy.py \
    --inputs daily_inputs_sample.json \
    --out out/test.json \
    --dry-run
```

문제 없으면 실제 호출:

```bash
python generate_daily_copy.py \
    --inputs daily_inputs_sample.json \
    --out out/2026-04-20.json
```

`out/2026-04-20.json` 열어서 10개 팀 A/B/C 눈으로 확인.

## 4) 공유 카드 렌더 (1분)

```bash
python render_share_card.py \
    --input out/2026-04-20.json \
    --outdir out/cards/2026-04-20 \
    --options B,C
```

`out/cards/2026-04-20/` 에 `LG_B.png`, `LG_C.png`, ... 30장이 나온다.

## 5) 톤 튜닝 (원하면)

- 특정 팀 카피가 맘에 안 들면: `team_dna.json` 해당 팀 `voice`/`avoid`/`signature_moves` 손보기
- 전 구단 공통 규칙: `system_prompt.md` 수정
- 금칙어 추가: `quality_gate.py`의 `BANNED_PATTERNS`

수정 후 같은 명령으로 다시 돌리면 반영됨.

## 6) 실제 데이터 연결

`daily_inputs_sample.json` 스키마 그대로 실제 경기 데이터를 넣는 로직을 작성. 두 경로:
- KBO 공식 API가 공식 파트너 아니면 서드파티(statiz, baseballguru 등)
- 이미 크롤러 있다면 그걸로 daily_inputs.json만 생성하면 끝

## 7) 크론 등록 (선택)

README.md의 "크론 예시" 섹션 참고. 매일 00:30 KST에 자동 생성.

---

## 오늘 남긴 것들 체크리스트

- [x] team_dna.json (10팀 DNA)
- [x] team_colors.json (팀 컬러)
- [x] special_situations.json (20개 특수상황)
- [x] fallback_copy.json (10팀 안전망)
- [x] daily_inputs_sample.json (2026-04-20 예시)
- [x] system_prompt.md
- [x] user_prompt_template.md
- [x] quality_gate.py
- [x] generate_daily_copy.py (prompt caching, 품질 게이트, fallback)
- [x] render_share_card.py (9:16, 한글 폰트 자동 탐색)
- [x] notifications.json (푸시 템플릿 보너스)
- [x] requirements.txt, .env.example
- [x] README.md

## 남은 숙제 (나중에 한 번에 물어보세요)

- 실제 경기 데이터 소스 연결 (KBO 공식 vs 서드파티)
- 앱 프론트에서 JSON을 어떻게 꺼내 쓸지 API 엔드포인트 설계
- 팀 로고는 여전히 CI 패키지 필요 (구단별 공식 요청 템플릿은 이전 턴에서 전달)
- A/B 성과 추적 인프라 (공유/저장 클릭 로깅)
