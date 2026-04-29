'use client';

import { useCallback, useRef, useState } from 'react';

export interface SSEEvent {
  event: string;
  data: unknown;
}

export function useSSEStream() {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (url: string, init?: RequestInit) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setEvents([]);
      setRunning(true);

      try {
        const res = await fetch(url, {
          method: init?.method ?? 'POST',
          headers: init?.headers,
          body: init?.body,
          signal: controller.signal,
        });
        if (!res.body) throw new Error('no stream body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE events separated by \n\n
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const lines = part.split('\n');
            let evt = 'message';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) evt = line.slice(7).trim();
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            let parsed: unknown = data;
            try { parsed = JSON.parse(data); } catch { /* ignore */ }
            setEvents((prev) => [...prev, { event: evt, data: parsed }]);
            if (evt === 'done') {
              setRunning(false);
              return;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setEvents((prev) => [
            ...prev,
            { event: 'error', data: { message: (err as Error).message } },
          ]);
        }
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  /** Drop the current event log. Combine with `stop()` when switching sessions
   *  to prevent the previous session's deltas from polluting the new view. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setEvents([]);
    setRunning(false);
  }, []);

  return { events, running, start, stop, reset };
}
