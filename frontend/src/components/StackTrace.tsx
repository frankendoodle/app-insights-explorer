import type { ExceptionEntry } from '@/types';

export function StackTrace({ entries }: { entries: ExceptionEntry[] }) {
  return (
    <div>
      {entries.map((entry, i) => (
        <div
          key={i}
          style={{ marginBottom: '1rem', borderLeft: '3px solid #569cd6', paddingLeft: '0.75rem' }}
        >
          <div style={{ color: '#dcdcaa', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            {entry.type}
          </div>
          <div style={{ color: '#ce9178', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            {entry.message}
          </div>
          <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
            {entry.frames.map((frame, fi) => (
              <div key={fi}>
                <span style={{ color: '#888' }}>at </span>
                <span style={{ color: '#4ec9b0' }}>{frame.method}</span>
                {frame.fileName && (
                  <>
                    <span style={{ color: '#888' }}> in </span>
                    <span style={{ color: '#9cdcfe' }}>{frame.fileName}</span>
                    {frame.line > 0 && (
                      <span style={{ color: '#b5cea8' }}>:line {frame.line}</span>
                    )}
                  </>
                )}
                {frame.assembly && (
                  <span style={{ color: '#555' }}> [{frame.assembly}]</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
