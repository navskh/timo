# TIMO

**T**hink · **I**dea-**M**anager · **O**peration — Claude Code를 쓰듯이 자연어로 요청하면, AI가 파일을 직접 읽고 쓰고 실행하면서 **작업 태스크를 스스로 정리**해주는 로컬 툴.

`idea-manager(im)`의 후속작(**im.v2**)입니다. 이전 버전이 태스크 "정리"에만 머물렀다면, TIMO는 **직접 실행**과 **유기적 루프**까지 가져갑니다.

## 스크린샷

좌측 사이드바에 프로젝트·세션, 중앙에 Claude Code 스타일 채팅(도구 호출 + 결과 인라인 표시), 우측에 **AI가 TodoWrite로 만든 태스크 리스트**가 실시간 반영됩니다.

## 설치

[GitHub Releases](https://github.com/navskh/timo/releases)에서 macOS용 `.app.tar.gz`를 받아 압축 해제 후 `TIMO.app`을 `/Applications`에 옮기고 더블클릭하세요. 인앱 자동 업데이트가 새 버전을 받아옵니다.

### 전제 조건

TIMO는 여러분의 CLI 에이전트를 **스폰**해서 동작합니다. 최소 하나는 설치되어 있어야 합니다:

- **Claude** (추천): https://docs.claude.com/en/docs/claude-code/overview
- **Gemini CLI**: https://github.com/google-gemini/gemini-cli
- **Codex CLI**: OpenAI Codex CLI

각 에이전트에 로그인 / 구독 / API 키 설정은 해당 CLI 문서를 따라주세요.

## 사용법

`TIMO.app`을 실행하면 Tauri WebView 안에서 본체가 뜹니다. 데이터는 `~/.timo/`에 그대로 보존됩니다.

### 기본 흐름

1. **새 프로젝트** — 사이드바에서 이름·작업 디렉토리·에이전트 선택
2. **채팅으로 요청** — Claude Code에 말하듯이 (`"여기서 OAuth 버그 찾아줘"`, `"폴더별로 README 써줘"` 등)
3. **AI가 작업 + TodoWrite** — 파일을 읽고 쓰고 실행하면서 생긴 모든 todo가 우측 태스크 패널에 자동 반영
4. **수동 태스크 추가** — 원하면 사이드바 상단 `+ 직접 추가…`로 직접 적어두기
5. **다음 턴에서 이어서** — 이전 대화와 현재 태스크 상태가 프롬프트에 자동 주입되어 자연스럽게 이어짐

### Skills

`/plan`, `/build`, `/review`, `/design`, `/docs` 5개 스킬이 기본 탑재돼 있어요. 채팅에 `/plan` 치면 AI가 기획·분석 모드로 응답하고, `/build`는 "기존 컨벤션 먼저 스캔" 규칙을 강제합니다.

```
/plan 이 기능을 도입하면 뭐가 문제야?
/build 위 계획대로 구현해줘
/review 방금 한 거 회귀 리스크 체크
```

스킬은 `~/.timo/skills/*.md` 파일로 저장되며, 앱 내 `관리` 메뉴에서 추가/수정/삭제할 수 있습니다.

## 저장 위치

모든 데이터는 로컬입니다 — 외부로 나가지 않아요.

- `~/.timo/data/timo.db` — 프로젝트·세션·태스크·메시지 (SQLite)
- `~/.timo/skills/*.md` — 스킬 정의

## 개발

```bash
git clone https://github.com/navskh/timo.git
cd timo
npm install
npm run tauri:dev      # Tauri WebView + Next dev (port 3789, hot reload)
npm run tauri:build    # 로컬 .app + 자동 업데이트 번들 (signing key 필요)
```

릴리스는 `v*` 태그를 푸시하면 GitHub Actions가 macOS arm64/x64 빌드를 만들어 Draft Release로 올립니다 (`.github/workflows/release.yml`).

## 라이선스

MIT © navskh
