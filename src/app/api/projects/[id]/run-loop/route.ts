import { NextRequest } from 'next/server';
import { ensureDb } from '@/lib/db';
import { runProjectLoop } from '@/lib/loop-runner';
import { sseEncode, sseResponse } from '@/lib/sse';

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;

  return sseResponse(async (controller) => {
    try {
      await runProjectLoop(id, (ev) => {
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
