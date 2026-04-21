'use client';

import { useCallback, useEffect, useMemo, useRef, useState, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { IProject, ITask, IChatSession, IChatMessage, ChatBlock } from '@/types';
import { ChatMessage } from '@/components/ChatMessage';
import { TaskSidebar } from '@/components/TaskSidebar';
import { DirectoryPicker } from '@/components/DirectoryPicker';
import { Composer } from '@/components/Composer';
import { useSSEStream } from '@/lib/use-sse-stream';

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

  const { events, running, start } = useSSEStream();
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Load messages when current session changes + reflect it in the URL so the
  // sidebar can highlight the active session.
  useEffect(() => {
    if (!currentSessionId) return;
    loadMessages(currentSessionId);
    setStreamingBlocks(null);
    if (queryStringSession !== currentSessionId) {
      router.replace(`/projects/${id}?s=${currentSessionId}`, { scroll: false });
    }
  }, [currentSessionId, loadMessages, queryStringSession, id, router]);

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
    }
  }, [events, running, loadTasks, loadSessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingBlocks]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  async function send(text: string) {
    if (!currentSessionId || !text.trim() || running) return;
    await start(`/api/sessions/${currentSessionId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
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

  async function savePath(value: string | null) {
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_path: value }),
    });
    setPickingPath(false);
    loadProject();
  }

  async function deleteCurrentSession() {
    if (!currentSessionId) return;
    if (!confirm(`"${currentSession?.title ?? ''}" 대화를 삭제할까요?`)) return;
    await fetch(`/api/sessions/${currentSessionId}`, { method: 'DELETE' });
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
            <button
              onClick={() => setPickingPath(true)}
              className={`flex items-center gap-1 text-[11px] mono px-2 py-1 rounded-md border transition max-w-[320px] ${
                project.project_path
                  ? 'text-[var(--fg-muted)] border-[var(--border)] hover:border-violet-500/50 hover:text-white'
                  : 'text-amber-400 border-amber-800/50 bg-amber-950/30 hover:bg-amber-950/50'
              }`}
              title="작업 디렉토리 변경"
            >
              <span>📁</span>
              <span className="truncate">{project.project_path ?? 'cwd 미지정'}</span>
            </button>
            {project.project_path && (
              <button
                onClick={() => savePath(null)}
                className="text-[var(--fg-dim)] hover:text-red-400 text-xs px-1"
                title="경로 해제"
              >
                ×
              </button>
            )}
            <div className="w-px h-5 bg-[var(--border)] mx-1" />
            {currentSessionId && (
              <button
                onClick={deleteCurrentSession}
                className="text-xs text-[var(--fg-dim)] hover:text-red-400 px-2 py-1 rounded hover:bg-[var(--surface-3)]"
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
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-950/50">
                <span className="text-white text-xl font-bold">T</span>
              </div>
              <h2 className="text-lg font-semibold mb-1">{project.name}에서 시작해보세요</h2>
              <p className="text-sm text-[var(--fg-muted)] mb-6">
                Claude Code를 쓰듯이 자연스럽게 요청하면, 작업 중 태스크를 오른쪽에 정리해줘요.
              </p>
              {!project.project_path && (
                <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-md px-3 py-2 inline-block">
                  ⚠ 작업 디렉토리가 없어서 파일 수정이 서버 cwd에서 일어나요.{' '}
                  <button onClick={() => setPickingPath(true)} className="underline hover:text-amber-300">
                    지금 설정
                  </button>
                </div>
              )}
            </div>
          )}
          {messages.map((m) => {
            let blocks: ChatBlock[] = [];
            try {
              blocks = JSON.parse(m.blocks_json);
            } catch {
              blocks = [{ kind: 'text', content: m.content }];
            }
            return <ChatMessage key={m.id} role={m.role} blocks={blocks} />;
          })}
          {streamingBlocks && <ChatMessage role="assistant" blocks={streamingBlocks} streaming />}
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <Composer running={running} onSend={send} />
          </div>
        </div>
      </section>

      <div className="w-[300px] flex-shrink-0">
        <TaskSidebar
          tasks={tasks}
          onDelete={deleteTask}
          onAdd={addTask}
          onToggleStatus={toggleTaskStatus}
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
