import { NextRequest } from 'next/server';
import { ensureDb } from '@/lib/db';
import { runChatTurn } from '@/lib/chat-engine';
import { sseEncode, sseResponse } from '@/lib/sse';

type Ctx = { params: Promise<{ sid: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  const body = await req.json();
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ error: 'text required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return sseResponse(async (controller) => {
    try {
      await runChatTurn(sid, text, (ev) => {
        controller.enqueue(sseEncode(ev.type, ev));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      controller.enqueue(sseEncode('error', { message }));
    } finally {
      controller.enqueue(sseEncode('done', {}));
      controller.close();
    }
  });
}
