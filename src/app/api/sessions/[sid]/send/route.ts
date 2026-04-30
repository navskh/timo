import { NextRequest } from 'next/server';
import { ensureDb } from '@/lib/db';
import { runChatTurn } from '@/lib/chat-engine';
import { sseEncode, sseResponse } from '@/lib/sse';
import type { IAttachment } from '@/types';

type Ctx = { params: Promise<{ sid: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  const body = await req.json();
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const rawAttachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const attachments: IAttachment[] = rawAttachments
    .filter((a: unknown): a is IAttachment =>
      !!a && typeof a === 'object' &&
      typeof (a as { path?: unknown }).path === 'string' &&
      typeof (a as { url?: unknown }).url === 'string')
    .slice(0, 20);

  if (!text && attachments.length === 0) {
    return new Response(JSON.stringify({ error: 'text 또는 attachments 중 하나는 필요' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return sseResponse(async (controller) => {
    // Heartbeat keeps the connection alive across long quiet periods (single
    // tool calls running for minutes — large builds, big file reads, etc.).
    // Without this, idle-timeout layers somewhere between WebKit and the Node
    // sidecar can drop the stream and the chat appears to "just stop".
    const HEARTBEAT_BYTES = new TextEncoder().encode(': keepalive\n\n');
    const hb = setInterval(() => {
      try { controller.enqueue(HEARTBEAT_BYTES); }
      catch { /* controller already closed — no-op */ }
    }, 15000);

    try {
      await runChatTurn(sid, text, (ev) => {
        controller.enqueue(sseEncode(ev.type, ev));
      }, attachments);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      controller.enqueue(sseEncode('error', { message }));
    } finally {
      clearInterval(hb);
      controller.enqueue(sseEncode('done', {}));
      controller.close();
    }
  });
}
