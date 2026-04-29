import { NextRequest, NextResponse } from 'next/server';
import { isRunning, getStreamingBlocks } from '@/lib/chat-state';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ sid: string }> };

/**
 * Snapshot of the in-flight assistant turn for this session, used by the chat
 * page to render mid-stream progress when the user navigates back to a
 * session that's still producing a response.
 *
 * `running` flips to false the moment chat-engine clears the buffer in its
 * `finally` block; the client should stop polling and reload the persisted
 * messages from /api/sessions/[sid]/messages at that point.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { sid } = await params;
  return NextResponse.json({
    running: isRunning(sid),
    blocks: getStreamingBlocks(sid),
  });
}
