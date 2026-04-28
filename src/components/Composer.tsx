'use client';

import { useEffect, useRef, useState } from 'react';
import type { IAttachment } from '@/types';
import { toast } from './ui/dialogs';

interface ISkillSummary {
  name: string;
  description: string;
  trigger: string;
}

interface Props {
  running: boolean;
  onSend: (text: string, attachments: IAttachment[]) => void;
  onStop?: () => void;
}

interface PendingAttachment extends IAttachment {
  /** Key while uploading; replaced with server response once done. */
  uploadingKey?: string;
}

export function Composer({ running, onSend, onStop }: Props) {
  const [value, setValue] = useState('');
  const [skills, setSkills] = useState<ISkillSummary[]>([]);
  const [menu, setMenu] = useState<{ filter: string; index: number } | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/skills')
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []));
  }, []);

  useEffect(() => {
    const onInsert = (e: Event) => {
      const detail = (e as CustomEvent<{ trigger: string }>).detail;
      if (!detail?.trigger) return;
      setValue((prev) => {
        const prefix = prev.trim() === '' ? '' : prev.endsWith('\n') ? prev : prev + '\n';
        return `${prefix}${detail.trigger} `;
      });
      setTimeout(() => taRef.current?.focus(), 0);
    };
    const onFill = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      setValue(detail.text);
      setTimeout(() => {
        taRef.current?.focus();
        taRef.current?.setSelectionRange(detail.text.length, detail.text.length);
      }, 0);
    };
    window.addEventListener('timo:insert-skill', onInsert);
    window.addEventListener('timo:fill-composer', onFill);
    return () => {
      window.removeEventListener('timo:insert-skill', onInsert);
      window.removeEventListener('timo:fill-composer', onFill);
    };
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) { setMenu(null); return; }
    const cursor = ta.selectionStart ?? value.length;
    const upto = value.slice(0, cursor);
    const match = upto.match(/(?:^|\n)(\/[a-zA-Z0-9-]*)$/);
    if (!match) { setMenu(null); return; }
    const filter = match[1].slice(1).toLowerCase();
    setMenu((prev) => ({ filter, index: prev?.filter === filter ? prev.index : 0 }));
  }, [value]);

  const matches = menu
    ? skills
        .filter((s) => s.trigger.slice(1).toLowerCase().startsWith(menu.filter))
        .slice(0, 8)
    : [];

  function applySkill(skill: ISkillSummary) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const upto = value.slice(0, cursor);
    const after = value.slice(cursor);
    const triggerStart = upto.lastIndexOf('/');
    const nextValue = upto.slice(0, triggerStart) + skill.trigger + ' ' + after;
    setValue(nextValue);
    setMenu(null);
    setTimeout(() => {
      if (!taRef.current) return;
      const pos = triggerStart + skill.trigger.length + 1;
      taRef.current.selectionStart = taRef.current.selectionEnd = pos;
      taRef.current.focus();
    }, 0);
  }

  async function uploadFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0 && files.length > 0) {
      toast.error('이미지 파일만 지원합니다.');
      return;
    }
    for (const f of images) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append('file', f);
        const res = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? '업로드 실패');
          continue;
        }
        setAttachments((prev) => [
          ...prev,
          {
            path: data.path,
            url: data.url,
            name: data.name,
            size: data.size,
            mime: data.mime,
          },
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '업로드 실패');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.items]
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .filter((f): f is File => !!f);
    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0) uploadFiles(files);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function submit() {
    if (running || uploading > 0) return;
    if (!value.trim() && attachments.length === 0) return;
    onSend(value, attachments);
    setValue('');
    setAttachments([]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index + 1) % matches.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index - 1 + matches.length) % matches.length });
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault();
        applySkill(matches[menu.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // While a turn is streaming, Enter is reserved for a future release of
      // the interrupt-and-send flow — for now, guide the user to stop first.
      if (running) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      submit();
    }
  }

  const canSend = !running && uploading === 0 && (value.trim() || attachments.length > 0);

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {menu && matches.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] text-[var(--fg-dim)] uppercase tracking-wider border-b border-[var(--border)]">
            스킬 — ↑↓ 이동, Tab/Enter 선택, Esc 닫기
          </div>
          <ul>
            {matches.map((s, i) => (
              <li key={s.name}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySkill(s);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                    i === menu.index ? 'bg-[var(--accent-bg)] text-white' : 'hover:bg-[var(--surface-3)]'
                  }`}
                >
                  <span className="mono text-[12px] text-[var(--accent-soft)] w-[80px]">{s.trigger}</span>
                  <span className="text-[12px] text-[var(--fg-muted)] truncate flex-1">
                    {s.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attachment thumbnails */}
      {(attachments.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((a, i) => (
            <div
              key={a.path}
              className="relative group border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface-2)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                className="w-16 h-16 object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                title="제거"
              >
                ×
              </button>
            </div>
          ))}
          {uploading > 0 && (
            <div className="w-16 h-16 border border-[var(--border)] rounded-md flex items-center justify-center text-xs text-[var(--fg-dim)] animate-pulse bg-[var(--surface-2)]">
              업로드…
            </div>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-10 border-2 border-dashed border-[var(--accent)] rounded-lg bg-[var(--accent-bg)] flex items-center justify-center pointer-events-none text-sm text-[var(--accent-soft)]">
          🖼 이미지 드롭해서 첨부
        </div>
      )}

      <div className="flex gap-2 items-end">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-[60px] w-[44px] flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)] disabled:opacity-40 transition text-lg"
          title="이미지 첨부 (드래그·Ctrl+V도 가능)"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = e.target.files ? [...e.target.files] : [];
            if (files.length > 0) uploadFiles(files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder={
            running
              ? '응답 중이에요 — 중단하려면 오른쪽 ⏹ 버튼. 다음 메시지 미리 타이핑해두셔도 돼요.'
              : '무엇을 부탁할까요?  (Enter 전송 · Shift+Enter 줄바꿈 · / 스킬 · 이미지 드래그/붙여넣기)'
          }
          rows={2}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm resize-none outline-none transition-colors"
          style={{ fontFamily: 'inherit' }}
        />
        {running ? (
          <button
            type="button"
            onClick={() => onStop?.()}
            className="h-[60px] px-5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition shrink-0 flex items-center gap-2"
            title="실행 중단 (SIGTERM)"
          >
            <span className="inline-block w-2.5 h-2.5 bg-white rounded-sm" />
            중단
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            className="h-[60px] px-5 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition shrink-0"
          >
            {uploading > 0 ? '업로드' : '전송'}
          </button>
        )}
      </div>
    </div>
  );
}
