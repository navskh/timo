import { NextResponse } from 'next/server';
import { listRunning } from '@/lib/chat-state';

/** Lightweight polling endpoint: which sessions currently have an active turn. */
export async function GET() {
  return NextResponse.json({ running: listRunning() });
}
