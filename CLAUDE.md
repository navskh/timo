# CLAUDE.md

TIMO — **T**hink · **I**dea-**M**anager · **O**peration.
idea-manager의 후속작. "계획 관리"에서 "직접 실행"으로 방향을 튼 로컬 우선 AI 실행 루프.

## Commands

```bash
npm run dev     # dev server (port 3789)
npm run build   # production build
npm run lint    # eslint
```

## Core Flow

```
brain dump → 태스크 생성 → 실행 버튼 → claude/gemini/codex CLI 스폰
          → NDJSON 스트림을 SSE로 UI에 릴레이 (Claude Code 스타일 표시)
          → 실행 이벤트 전부 execution_events에 영구 저장
          → "Run All" 누르면 pending 태스크를 sort_order 순으로 유기적 루프 실행
```

## Architecture

### Execution Engine
- `src/lib/ai/client.ts` — `runAgent(agentType, prompt, onText, onRawEvent, {cwd, onSpawn})`. CLI를 `spawn`으로 띄우고 stdin에 프롬프트 주입 후 NDJSON stdout 파싱. `onSpawn`으로 `ChildProcess` 참조를 외부(executor)에 넘겨 취소 가능.
- `src/lib/ai/agents.ts` — claude/gemini/codex별 바이너리, 인자, 스트림 이벤트 파서. Claude는 `--dangerously-skip-permissions --max-turns 80`로 풀 툴 모드.
- `src/lib/executor.ts` — `executeTask(taskId, sink)`: task + project 로드 → execution 레코드 생성 → `runAgent` 호출 → raw 이벤트 전부 `execution_events`에 seq와 함께 저장하면서 sink로 릴레이 → 완료/실패/취소 상태 업데이트. `live` Map으로 실행 중인 프로세스 추적 → `cancelExecution(id)`.
- `src/lib/loop-runner.ts` — `runProjectLoop(projectId, sink)`: `getNextPendingTask` → `executeTask` → 실패 시 중단, 완료 시 다음 태스크로. `activeLoops` Map으로 프로젝트 단위 중복 방지 + 중단 지원.

### DB (`src/lib/db/`)
- `~/.timo/data/timo.db` (sql.js wasm, write-through atomic save via tmp-rename)
- **schema**: `projects`(agent_type) → `tasks`(status: pending|running|done|failed) → `executions`(1:N, status: running|completed|failed|cancelled) → `execution_events`(NDJSON raw event + seq)
- `findSqlJsDistDir()`에서 cwd 기준으로 `node_modules/sql.js/dist`를 fs 탐색으로 찾음 — Turbopack의 `require.resolve` 가상 경로 문제 우회.

### API
- `/api/projects` CRUD
- `/api/projects/[id]/tasks` 태스크 목록/생성
- `/api/tasks/[taskId]` 개별 태스크 CRUD
- `/api/tasks/[taskId]/execute` — **SSE 스트림** (event: `execution-started`, `text`, `raw`, `error`, `execution-finished`, `done`)
- `/api/projects/[id]/run-loop` — **SSE 스트림** (event: `loop-started`, `task-picked`, `exec`(중첩), `loop-stopped`, `done`)
- `/api/projects/[id]/stop-loop` — 루프 중단 (실행 중 프로세스에 SIGTERM)
- `/api/executions/[id]/events` — 저장된 이벤트 replay용
- `/api/executions/[id]/cancel` — 단건 실행 취소

### UI
- `/` — 프로젝트 대시보드 (생성/삭제)
- `/projects/[id]` — 2단 레이아웃: 좌측 태스크 리스트(추가/실행/재시도/삭제), 우측 `ExecutionPanel`
- `src/components/ExecutionPanel.tsx` — Claude Code 스타일 블록 렌더링. `blocksFromRawEvent()`가 NDJSON을 `text`/`tool_use`/`tool_result`/`system`/`error` 블록으로 변환. `tool_use`/`tool_result`는 접혀서 표시.
- `src/lib/use-sse-stream.ts` — fetch + ReadableStream reader로 SSE 파싱하는 클라이언트 훅.

## Design Decisions

- **CLI 스폰** (not Agent SDK). 사용자의 claude/gemini/codex CLI 구독을 그대로 활용. `--dangerously-skip-permissions`로 풀 툴 모드 — 실행 루프는 본질적으로 "신뢰하고 맡김".
- **full event persistence** — `execution_events`에 raw NDJSON 전부 저장. 새로고침·나중에 봐도 실행 과정 복원 가능.
- **task status를 4개로 단순화** (idea-manager는 7개). 실행 루프에 필요한 최소: `pending | running | done | failed`.
- **loop은 실패 시 중단**. "조용히 스킵"하지 않고 사용자가 원인 보고 결정하도록. 루프에서 cancel하면 현재 태스크는 `pending`으로 돌아감(재실행 가능).
- **sub-projects 없음**. 프로젝트 → 태스크 평면 구조. 필요해지면 태그/필터로 해결.

## Type Conventions
- `I` prefix for interfaces (`IProject`, `ITask`, `IExecution`, `IExecutionEvent`)
- `@/*` path alias → `./src/*`
