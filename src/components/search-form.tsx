'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ScrapeResult {
  channelsScraped: number;
  videosUpserted: number;
}

export default function SearchForm({ onComplete }: { onComplete?: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState('');

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Scrape failed');
      } else {
        setResult(data as ScrapeResult);
        onComplete?.();
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleScrape} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="e.g. personal finance, ai tools, fitness..."
          disabled={loading}
          className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 flex-1"
        />
        <Button type="submit" disabled={loading || !keyword.trim()}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Scraping…
            </span>
          ) : 'Scrape'}
        </Button>
      </div>

      {result && (
        <p className="text-green-400 text-sm">
          Done — {result.channelsScraped} channels scraped, {result.videosUpserted} videos added.
        </p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </form>
  );
}
