'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface EnrichResponse {
  succeeded: number;
  failed:    Array<{ url: string; reason: string }>;
  partial:   Array<{ url: string; reason: string }>;
}

const MAX_BATCH = 15;

export default function EnrichForm() {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<EnrichResponse | null>(null);
  const [error, setError]     = useState('');

  // Cheap client-side line count (server re-validates)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tooMany = lines.length > MAX_BATCH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0 || tooMany) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/outreach/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Enrich failed');
      } else {
        setResult(data as EnrichResponse);
        setText('');   // CONTEXT.md D-06: form clears on success
      }
    } catch (err) {
      console.error('[enrich-form] fetch failed', err);
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste channel URLs, one per line (max 15)"
        rows={6}
        disabled={loading}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 font-mono text-sm"
      />

      <p className="text-gray-400 text-xs">
        {lines.length} URL{lines.length !== 1 ? 's' : ''} entered
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading || lines.length === 0 || tooMany}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Enriching {lines.length}…
            </span>
          ) : (
            lines.length === 0 ? 'Enrich channels' : `Enrich ${lines.length} channel${lines.length !== 1 ? 's' : ''}`
          )}
        </Button>

        {tooMany && (
          <p className="text-red-400 text-sm">Maximum 15 channels per batch.</p>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {result && <SummaryPanel data={result} />}
    </form>
  );
}

function SummaryPanel({ data }: { data: EnrichResponse }) {
  const total = data.succeeded + data.partial.length + data.failed.length;

  return (
    <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm">
      <p className="font-medium text-white">Enrichment complete — {total} processed</p>

      <div className="mt-2 flex gap-4">
        <span className="text-green-400">Succeeded: {data.succeeded}</span>
        <span className="text-yellow-400">Partial: {data.partial.length}</span>
        <span className="text-red-400">Failed: {data.failed.length}</span>
      </div>

      {(data.failed.length > 0 || data.partial.length > 0) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-200">
            Show details
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {data.partial.map(p => (
              <li key={`p-${p.url}`} className="text-yellow-300">
                <code className="font-mono">{p.url}</code> — llm_failed (saved without games/genre)
              </li>
            ))}
            {data.failed.map(f => (
              <li key={`f-${f.url}`} className="text-red-300">
                <code className="font-mono">{f.url}</code> — {f.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
