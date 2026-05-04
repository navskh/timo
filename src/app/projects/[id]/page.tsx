'use client';

import { useCallback, useEffect, useMemo, useRef, useState, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { IProject, ITask, IChatSession, IChatMessage, ChatBlock, IAttachment } from '@/types';
import { ChatMessage } from '@/components/ChatMessage';
import { TaskSidebar } from '@/components/TaskSidebar';
import { DirectoryPicker } from '@/components/DirectoryPicker';
import { Composer } from '@/components/Composer';
import { confirm, toast } from '@/components/ui/dialogs';
import { useSSEStream } from '@/lib/use-sse-stream';
import { useTabs } from '@/lib/tabs/TabsContext';

export default function ProjectChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryStringSession = searchParams.get('s');

  const [project, setProject] = useState<IProject | null>(null);
  const [sessions, setSessions] = useState<IChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [tasks, setTasks] = useState<ITask[]>([]);
  const [streamingBlocks, setStreamingBlocks] = useState<ChatBlock[] | null>(null);
  const [pickingPath, setPickingPath] = useState(false);
  const [externalRunning, setExternalRunning] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [tidying, setTidying] = useState(false);

  const { events, running, start, reset } = useSSEStream();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tabs live globally now (TabsBar at layout level). The page just pins the
  // current session as a tab whenever it changes.
  const { openTab } = useTabs();

  const loadProject = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}`).then((r) => r.json());
    setProject(r.project);
  }, [id]);

  const loadSessions = useCallback(async (): Promise<IChatSession[]> => {
    const r = await fetch(`/api/projects/${id}/sessions`).then((r) => r.json());
    const list: IChatSession[] = r.sessions ?? [];
    setSessions(list);
    return list;
  }, [id]);

  const loadMessages = useCallback(async (sid: string) => {
    const r = await fetch(`/api/sessions/${sid}/messages`).then((r) => r.json());
    setMessages(r.messages ?? []);
  }, []);

  const loadTasks = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}/tasks`).then((r) => r.json());
    setTasks(r.tasks ?? []);
  }, [id]);

  // Initial load: project + tasks, and ensure at least one session exists.
  useEffect(() => {
    loadProject();
    loadTasks();
    (async () => {
      // Idempotent ensure — safe even if Strict Mode double-fires this effect.
      const r = await fetch(`/api/projects/${id}/sessions/ensure`).then((r) => r.json());
      const list: IChatSession[] = r.sessions ?? [];
      setSessions(list);
      if (queryStringSession && list.some((s) => s.id === queryStringSession)) {
        setCurrentSessionId(queryStringSession);
      } else if (!currentSessionId) {
        setCurrentSessionId(r.session?.id ?? list[0]?.id ?? null);
      }
      window.dispatchEvent(new Event('timo:refresh-sidebar'));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // React to ?s= changes (sidebar clicks)
  useEffect(() => {
    if (queryStringSession && queryStringSession !== currentSessionId) {
      setCurrentSessionId(queryStringSession);
    }
  }, [queryStringSession, currentSessionId]);

  // Load messages when current session changes. Also abort any in-flight SSE
  // from the previous session and drop its event log — otherwise the previous
  // session's deltas would keep landing in this session's view (cross-session
  // leak) and `streamingBlocks` would briefly mix the two.
  useEffect(() => {
    if (!currentSessionId) return;
    reset();
    loadMessages(currentSessionId);
    setStreamingBlocks(null);
  }, [currentSessionId, loadMessages, reset]);

  // Poll the current session's run status every 2s. Drives externalRunning
  // for the reattach UI; the tab strip's running dots come from TabsBar's own
  // poll so they stay in sync across projects.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/sessions/status').then((r) => r.json());
        if (stopped) return;
        const ids: string[] = (r.running ?? []).map((x: { session_id: string }) => x.session_id);
        setExternalRunning(currentSessionId ? ids.includes(currentSessionId) : false);
      } catch { /* ignore */ }
    };
    poll();
    const intId = setInterval(poll, 2000);

    const onFinished = (e: Event) => {
      const detail = (e as CustomEvent<{ session_id: string }>).detail;
      if (!detail?.session_id) return;
      if (detail.session_id === currentSessionId) {
        setExternalRunning(false);
        setStreamingBlocks(null);
        loadMessages(currentSessionId);
      }
    };
    const onRenamed = (e: Event) => {
      const detail = (e as CustomEvent<{ session_id?: string; title?: string }>).detail;
      if (!detail?.session_id || typeof detail.title !== 'string') return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === detail.session_id ? { ...s, title: detail.title as string } : s,
        ),
      );
    };
    window.addEventListener('timo:session-finished', onFinished);
    window.addEventListener('timo:session-renamed', onRenamed);

    return () => {
      stopped = true;
      clearInterval(intId);
      window.removeEventListener('timo:session-finished', onFinished);
      window.removeEventListener('timo:session-renamed', onRenamed);
    };
  }, [currentSessionId, loadMessages]);

  // Reattach: while another tab/window is producing the assistant turn for
  // THIS session, poll the server's mid-stream block buffer so the user sees
  // progress instead of a static spinner. Skips when we're the producer
  // (running=true means the local SSE is feeding streamingBlocks live).
  useEffect(() => {
    if (!currentSessionId || !externalRunning || running) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/sessions/${currentSessionId}/streaming-state`).then((r) => r.json());
        if (stopped) return;
        const blocks: ChatBlock[] = r.blocks ?? [];
        // Only re-render when something actually changed — chat-engine only
        // appends, so a length match means no new blocks landed.
        setStreamingBlocks((prev) => (prev && prev.length === blocks.length ? prev : blocks));
      } catch { /* ignore */ }
    };
    tick();
    const intId = setInterval(tick, 1000);
    return () => { stopped = true; clearInterval(intId); };
  }, [currentSessionId, externalRunning, running]);

  // Reflect current session in URL (state → URL). Intentionally does NOT depend on
  // queryStringSession — otherwise URL-driven state changes would trigger a URL
  // replace that fights the other effect and creates a ping-pong loop.
  useEffect(() => {
    if (!currentSessionId) return;
    router.replace(`/projects/${id}?s=${currentSessionId}`, { scroll: false });
  }, [currentSessionId, id, router]);

  // Pin the active session as a tab in the global tab strip whenever project
  // and session metadata are both available. Sidebar clicks flip the URL,
  // currentSessionId updates here, and this effect ensures the tab is created
  // (or its title is refreshed if the session was renamed).
  useEffect(() => {
    if (!project || !currentSessionId) return;
    const session = sessions.find((s) => s.id === currentSessionId);
    if (!session) return;
    openTab({
      session_id: session.id,
      project_id: project.id,
      title: session.title,
      project_name: project.name,
    });
  }, [project, currentSessionId, sessions, openTab]);

  // Process SSE events
  useEffect(() => {
    let tasksRefreshed = false;
    for (const e of events) {
      if (e.event === 'user-message-saved') {
        const data = e.data as { message: IChatMessage };
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
        );
        setStreamingBlocks([]);
      } else if (e.event === 'assistant-delta') {
        const data = e.data as { block: ChatBlock };
        setStreamingBlocks((prev) => [...(prev ?? []), data.block]);
      } else if (e.event === 'assistant-message-saved') {
        const data = e.data as { message: IChatMessage };
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
        );
        setStreamingBlocks(null);
      } else if (e.event === 'tasks-updated') {
        if (!tasksRefreshed) {
          loadTasks();
          tasksRefreshed = true;
        }
      }
    }
    if (!running && events.some((e) => e.event === 'done')) {
      loadTasks();
      loadSessions();
      window.dispatchEvent(new Event('timo:refresh-sidebar'));
      // Kick off follow-up suggestion generation for the just-completed turn.
      if (currentSessionId) {
        setSuggestionsLoading(true);
        fetch(`/api/sessions/${currentSessionId}/suggest`, { method: 'POST' })
          .then((r) => r.json())
          .catch(() => ({ suggestions: [] }))
          .finally(() => {
            setSuggestionsLoading(false);
            if (currentSessionId) loadMessages(currentSessionId);
          });
      }
    }
  }, [events, running, loadTasks, loadSessions, currentSessionId, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingBlocks]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  // Tracks the in-flight start() promise so a new send() while running can
  // wait for it to drain before kicking off the next one. Without this the
  // old SSE handler is still emitting 'done'/save events when the new one
  // begins and the two collide (duplicate user messages, lost deltas).
  const inFlightRef = useRef<Promise<void> | null>(null);

  async function send(text: string, attachments: IAttachment[] = []) {
    if (!currentSessionId) return;
    if (!text.trim() && attachments.length === 0) return;

    // Interrupt-and-send: typing during a running turn and pressing Enter
    // SIGTERMs the current claude process, waits for the SSE 'done' to land
    // (so chat-state's markIdle/clearProcess have run), then starts the new
    // turn. We don't await the interrupt fetch — it's idempotent and the
    // SSE 'done' is what we actually need.
    if (running && inFlightRef.current) {
      void fetch(`/api/sessions/${currentSessionId}/interrupt`, { method: 'POST' })
        .catch(() => { /* ignore — server might be already done */ });
      try {
        await inFlightRef.current;
      } catch { /* swallow — abort/error from interrupt is expected */ }
    }

    const p = start(`/api/sessions/${currentSessionId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, attachments }),
    });
    inFlightRef.current = p;
    try { await p; } finally {
      if (inFlightRef.current === p) inFlightRef.current = null;
    }
  }

  async function stopCurrent() {
    if (!currentSessionId) return;
    await fetch(`/api/sessions/${currentSessionId}/interrupt`, { method: 'POST' });
    // SSE 'error'→'done' will flow through; local `running` flips back to false.
  }

  async function tidyTasks() {
    if (tidying) return;
    setTidying(true);
    try {
      const res = await fetch(`/api/projects/${id}/tidy-tasks`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '정리 실패');
      } else {
        const s = data.summary;
        const changed = s.marked_done + s.deleted + s.renamed;
        if (changed === 0) {
          toast.info(`변경된 항목 없음 (${s.total}개 모두 유지)`, 6000);
        } else {
          const parts: string[] = [];
          if (s.marked_done) parts.push(`완료 ${s.marked_done}`);
          if (s.deleted) parts.push(`삭제 ${s.deleted}`);
          if (s.renamed) parts.push(`이름변경 ${s.renamed}`);
          toast.success(`✨ ${parts.join(' · ')} (전체 ${s.total} → 유지 ${s.kept})`, 12000);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      loadTasks();
      setTidying(false);
    }
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    loadTasks();
  }

  async function addTask(title: string) {
    await fetch(`/api/projects/${id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    loadTasks();
  }

  async function toggleTaskStatus(taskId: string, nextStatus: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    loadTasks();
  }

  async function reorderPending(orderedPendingIds: string[]) {
    // Full ordering: pending (new order) → others in current order
    const others = tasks.filter((t) => t.status !== 'pending').map((t) => t.id);
    const fullOrder = [...orderedPendingIds, ...others];
    await fetch(`/api/projects/${id}/tasks/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: fullOrder }),
    });
    loadTasks();
  }

  async function savePath(value: string | null) {
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_path: value }),
    });
    setPickingPath(false);
    loadProject();
  }

  async function setSessionModel(model: string | null) {
    if (!currentSessionId) return;
    const r = await fetch(`/api/sessions/${currentSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    const data = await r.json();
    if (data?.session) {
      setSessions((prev) => prev.map((s) => (s.id === data.session.id ? data.session : s)));
    }
  }

  async function deleteCurrentSession() {
    if (!currentSessionId) return;
    const ok = await confirm({
      title: '대화 삭제',
      message: `"${currentSession?.title ?? ''}" 대화를 삭제할까요?\n메시지 전체가 함께 지워집니다.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/sessions/${currentSessionId}`, { method: 'DELETE' });
    toast.success('대화 삭제됨');
    const remaining = await loadSessions();
    window.dispatchEvent(new Event('timo:refresh-sidebar'));
    if (remaining.length > 0) {
      router.push(`/projects/${id}?s=${remaining[0].id}`);
      setCurrentSessionId(remaining[0].id);
    } else {
      const r = await fetch(`/api/projects/${id}/sessions/ensure`).then((r) => r.json());
      setSessions(r.sessions ?? [r.session]);
      setCurrentSessionId(r.session.id);
      window.dispatchEvent(new Event('timo:refresh-sidebar'));
    }
  }

  if (!project) {
    return (
      <main className="flex-1 flex items-center justify-center text-sm text-[var(--fg-muted)]">
        불러오는 중…
      </main>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <section className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-12 border-b border-[var(--border)] flex items-center gap-3 px-4 bg-[var(--surface-1)]">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold truncate">{project.name}</h1>
            {currentSession && (
              <>
                <span className="text-[var(--fg-dim)]">/</span>
                <span className="text-xs text-[var(--fg-muted)] truncate max-w-[300px]">
                  {currentSession.title}
                </span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium mono bg-[var(--surface-3)] text-[var(--fg-muted)] uppercase">
              {project.agent_type}
            </span>
            {project.agent_type === 'claude' && currentSession && (
              <select
                value={currentSession.model ?? ''}
                onChange={(e) => setSessionModel(e.target.value || null)}
                className="text-[11px] mono px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent-border)] text-[var(--foreground)] outline-none cursor-pointer"
                title="이 대화에서 사용할 모델"
              >
                <option value="">기본 (opus)</option>
                <option value="opus">Opus — 최고 성능</option>
                <option value="sonnet">Sonnet — 균형, 별도 쿼터</option>
                <option value="haiku">Haiku — 빠름/가벼움</option>
              </select>
            )}
            <button
              onClick={() => setPickingPath(true)}
              className={`flex items-center gap-1 text-[11px] mono px-2 py-1 rounded-md border transition max-w-[320px] ${
                project.project_path
                  ? 'text-[var(--fg-muted)] border-[var(--border)] hover:border-[var(--accent-border)] hover:text-[var(--foreground)]'
                  : 'text-[var(--warning)] border-[var(--warning-border)] bg-[var(--warning-bg)] hover:bg-[var(--warning-bg)]'
              }`}
              title="작업 디렉토리 변경"
            >
              <span>📁</span>
              <span className="truncate">{project.project_path ?? 'cwd 미지정'}</span>
            </button>
            {project.project_path && (
              <button
                onClick={() => savePath(null)}
                className="text-[var(--fg-dim)] hover:text-[var(--danger)] text-xs px-1"
                title="경로 해제"
              >
                ×
              </button>
            )}
            <div className="w-px h-5 bg-[var(--border)] mx-1" />
            {currentSessionId && (
              <button
                onClick={deleteCurrentSession}
                className="text-xs text-[var(--fg-dim)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-[var(--surface-3)]"
                title="현재 대화 삭제"
              >
                대화 삭제
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
          {messages.length === 0 && !streamingBlocks && (
            <div className="max-w-xl mx-auto text-center mt-16">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-black/40">
                <span className="text-[var(--accent-on)] text-xl font-bold">T</span>
              </div>
              <h2 className="text-lg font-semibold mb-1">{project.name}에서 시작해보세요</h2>
              <p className="text-sm text-[var(--fg-muted)] mb-6">
                Claude Code를 쓰듯이 자연스럽게 요청하면, 작업 중 태스크를 오른쪽에 정리해줘요.
              </p>
              {!project.project_path && (
                <div className="text-xs text-[var(--warning)] bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-md px-3 py-2 inline-block">
                  ⚠ 작업 디렉토리가 없어서 파일 수정이 서버 cwd에서 일어나요.{' '}
                  <button onClick={() => setPickingPath(true)} className="underline hover:text-[var(--warning)]">
                    지금 설정
                  </button>
                </div>
              )}
            </div>
          )}
          {(() => {
            const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
            return messages.map((m) => {
              let blocks: ChatBlock[] = [];
              try {
                blocks = JSON.parse(m.blocks_json);
              } catch {
                blocks = [{ kind: 'text', content: m.content }];
              }
              const isLastAssistant = m.id === lastAssistantId;
              let suggestions: string[] = [];
              if (isLastAssistant) {
                try { suggestions = JSON.parse(m.suggestions_json ?? '[]'); } catch { /* ignore */ }
              }
              return (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  blocks={blocks}
                  suggestions={isLastAssistant ? suggestions : undefined}
                  suggestionsLoading={isLastAssistant && !streamingBlocks ? suggestionsLoading : false}
                />
              );
            });
          })()}
          {streamingBlocks && <ChatMessage role="assistant" blocks={streamingBlocks} streaming />}
          {!streamingBlocks && externalRunning && (
            <div className="flex gap-3 px-2 items-center text-[var(--fg-muted)]">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="text-[var(--accent-on)] text-[11px] font-bold">T</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-[var(--accent-soft)] font-medium">TIMO</span>
                <span className="text-[var(--fg-dim)]">응답 중</span>
                <span className="flex gap-0.5 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <Composer running={running || externalRunning} onSend={send} onStop={stopCurrent} />
          </div>
        </div>
      </section>

      <div className="w-[300px] flex-shrink-0">
        <TaskSidebar
          tasks={tasks}
          onDelete={deleteTask}
          onAdd={addTask}
          onToggleStatus={toggleTaskStatus}
          onReorderPending={reorderPending}
          onTidy={tidyTasks}
          tidyDisabled={tidying}
          tidyRunning={tidying}
        />
      </div>

      {pickingPath && (
        <DirectoryPicker
          initialPath={project.project_path}
          onSelect={(p) => savePath(p)}
          onClose={() => setPickingPath(false)}
        />
      )}
    </div>
  );
}
