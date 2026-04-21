/** Helper for Server-Sent Events response streams. */
export function sseEncode(event: string, data: unknown): Uint8Array {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

export function sseResponse(
  init: (controller: ReadableStreamDefaultController<Uint8Array>) => void | Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await init(controller);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(sseEncode('error', { message }));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
