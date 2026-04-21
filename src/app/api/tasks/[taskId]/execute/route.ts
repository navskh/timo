import { NextRequest } from 'next/server';
import { ensureDb } from '@/lib/db';
import { executeTask } from '@/lib/executor';
import { sseEncode, sseResponse } from '@/lib/sse';

type Ctx = { params: Promise<{ taskId: string }> };

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;

  return sseResponse(async (controller) => {
    try {
      await executeTask(taskId, (ev) => {
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
