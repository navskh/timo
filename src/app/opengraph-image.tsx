import { ImageResponse } from 'next/og';

export const alt = 'TIMO — Think · Idea-Manager · Operation';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          backgroundColor: '#0a0a0c',
          backgroundImage: 'radial-gradient(circle at 20% 0%, #2a1a4a 0%, #0a0a0c 55%)',
          display: 'flex',
          flexDirection: 'column',
          padding: '88px 96px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          color: '#fafafa',
        }}
      >
        <div
          style={{
            color: '#a78bfa',
            fontSize: 28,
            letterSpacing: '0.32em',
            fontWeight: 600,
            marginBottom: 28,
          }}
        >
          THINK · IDEA-MANAGER · OPERATION
        </div>
        <div
          style={{
            fontSize: 224,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            background: 'linear-gradient(90deg, #ffffff 0%, #c4b5fd 100%)',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: 36,
          }}
        >
          TIMO
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: '#e5e5e5',
            lineHeight: 1.2,
            maxWidth: 1000,
          }}
        >
          Local-first AI executor.
        </div>
        <div
          style={{
            fontSize: 30,
            color: '#a3a3a3',
            marginTop: 18,
          }}
        >
          Brain dump → tasks → auto-run loop. Spawns your Claude / Gemini / Codex CLI.
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 96,
            fontSize: 22,
            color: '#737373',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: '#8b5cf6', fontSize: 28 }}>●</span>
          github.com/navskh/timo
        </div>
      </div>
    ),
    { ...size },
  );
}
