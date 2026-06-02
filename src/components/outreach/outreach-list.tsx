'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Download, Trash2, RefreshCw, ExternalLink } from 'lucide-react';

type OutreachRowStatus = 'idle' | 'enriching' | 'partial' | 'failed';

interface OutreachRow {
  youtubeId: string;
  name: string;
  url: string;
  subscriberCount: number | null;
  topGames: string[] | null;
  genre: string | null;
  medianViews: number | null;
  lastEnrichedAt: string | null;
  lastVideoAt: string | null;
  email: string | null;
  platform: string;
  hasHiddenEmail: boolean | null;
  contacted:      boolean;
  priorityScore:  number | null;
  priorityReason: string | null;
  status: OutreachRowStatus;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function OutreachList() {
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [minMedianViews, setMinMedianViews] = useState<number | null>(null);
  const [minSubs, setMinSubs] = useState<number | null>(null);
  const [maxSubs, setMaxSubs] = useState<number | null>(null);
  const [maxInactiveDays, setMaxInactiveDays] = useState<number | null>(null);
  const [gamingOnly, setGamingOnly] = useState(false);
  const [hideContacted, setHideContacted] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastEnrichedAt', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [toolbarError, setToolbarError] = useState('');
  const [editingEmailId, setEditingEmailId]   = useState<string | null>(null);
  const [editingEmailVal, setEditingEmailVal] = useState('');
  const [reEnrichingAll, setReEnrichingAll] = useState(false);
  const [reEnrichAllProgress, setReEnrichAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [scoring, setScoring]             = useState(false);
  const [scoreForm, setScoreForm]         = useState(false);
  const [gameName, setGameName]           = useState('');
  const [comparables, setComparables]     = useState('');
  const [scoreProgress, setScoreProgress] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetch('/api/outreach/channels')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const list: OutreachRow[] = (data.channels ?? []).map((c: Omit<OutreachRow, 'status'>) => ({
          ...c,
          platform:      (c as OutreachRow).platform      ?? 'youtube',
          hasHiddenEmail:  (c as OutreachRow).hasHiddenEmail  ?? null,
          contacted:       (c as OutreachRow).contacted ?? false,
          priorityScore:  (c as OutreachRow).priorityScore  ?? null,
          priorityReason: (c as OutreachRow).priorityReason ?? null,
          status: 'idle' as OutreachRowStatus,
        }));
        setRows(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to load outreach channels — please refresh the page.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const genres = useMemo(
    () => Array.from(new Set(rows.map(r => r.genre).filter((g): g is string => Boolean(g)))).sort(),
    [rows],
  );

  const filtered = useMemo(() => rows.filter(r => {
    if (genreFilter && r.genre !== genreFilter) return false;
    if (minMedianViews !== null && (r.medianViews === null || r.medianViews < minMedianViews)) return false;
    if (minSubs !== null && minSubs > 0 && (r.subscriberCount === null || r.subscriberCount < minSubs)) return false;
    if (maxSubs !== null && maxSubs > 0 && r.subscriberCount !== null && r.subscriberCount > maxSubs) return false;
    if (maxInactiveDays !== null) {
      const cutoff = Date.now() - maxInactiveDays * 24 * 60 * 60 * 1000;
      if (!r.lastVideoAt || new Date(r.lastVideoAt).getTime() < cutoff) return false;
    }
    if (hideContacted && r.contacted) return false;
    if (gamingOnly && r.platform === 'youtube') {
      // 'Other' = GPT's fallback when channel has no clear gaming category → treat as non-gaming
      if (r.genre === 'Other') return false;
      // Also hide channels with no genre and no game titles at all
      const hasGames = r.topGames && r.topGames.length > 0;
      if (!r.genre && !hasGames) return false;
    }
    return true;
  }), [rows, genreFilter, minMedianViews, minSubs, maxSubs, maxInactiveDays, gamingOnly, hideContacted]);

  const handleReenrich = useCallback(async (row: OutreachRow) => {
    setRows(prev => prev.map(r => r.youtubeId === row.youtubeId ? { ...r, status: 'enriching' } : r));
    setToolbarError('');
    try {
      const res = await fetch('/api/outreach/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: row.url }),
      });
      const data = await res.json();
      const failedUrls  = new Set<string>((data.failed  ?? []).map((x: { url: string }) => x.url));
      const partialUrls = new Set<string>((data.partial ?? []).map((x: { url: string }) => x.url));
      const enrichedMap = (data.enriched ?? {}) as Record<string, {
        topGames: string[] | null; genre: string | null; email: string | null;
        subscriberCount: number | null; medianViews: number | null;
      }>;

      setRows(prev => prev.map(r => {
        if (r.youtubeId !== row.youtubeId) return r;
        if (failedUrls.has(row.url)) {
          // Reset to idle after brief failed state
          setTimeout(() => setRows(p => p.map(x => x.youtubeId === row.youtubeId && x.status === 'failed' ? { ...x, status: 'idle' } : x)), 2000);
          return { ...r, status: 'failed' };
        }
        const e = enrichedMap[row.url];
        const patch = e ? {
          topGames:        e.topGames,
          genre:           e.genre,
          // Keep manually-entered email if enrichment found nothing
          email:           e.email ?? r.email,
          subscriberCount: e.subscriberCount ?? r.subscriberCount,
          medianViews:     e.medianViews,
          lastEnrichedAt:  new Date().toISOString(),
        } : {};
        if (partialUrls.has(row.url)) {
          setTimeout(() => setRows(p => p.map(x => x.youtubeId === row.youtubeId && x.status === 'partial' ? { ...x, status: 'idle' } : x)), 2000);
          return { ...r, ...patch, status: 'partial' };
        }
        return { ...r, ...patch, status: 'idle' };
      }));
    } catch {
      setRows(prev => prev.map(r => r.youtubeId === row.youtubeId ? { ...r, status: 'idle' } : r));
      setToolbarError('Re-enrich failed — please try again.');
    }
  }, []);

  async function handleReenrichAll() {
    if (reEnrichingAll) return;
    setReEnrichingAll(true);
    setToolbarError('');

    const eligible = rows.filter(r => r.platform === 'youtube' && r.status === 'idle');
    const BATCH = 15;
    const total = Math.ceil(eligible.length / BATCH);

    for (let i = 0; i < eligible.length; i += BATCH) {
      const batch = eligible.slice(i, i + BATCH);
      setReEnrichAllProgress({ current: Math.floor(i / BATCH) + 1, total });

      const batchIds    = new Set(batch.map(r => r.youtubeId));
      const urlById     = new Map(batch.map(r => [r.youtubeId, r.url]));
      const urls        = batch.map(r => r.url);

      setRows(prev => prev.map(r => batchIds.has(r.youtubeId) ? { ...r, status: 'enriching' as OutreachRowStatus } : r));

      try {
        const res  = await fetch('/api/outreach/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: urls.join('\n') }),
        });
        const data = await res.json();

        if (!res.ok) {
          setRows(prev => prev.map(r => batchIds.has(r.youtubeId) ? { ...r, status: 'idle' as OutreachRowStatus } : r));
          continue;
        }

        const failedUrls  = new Set<string>((data.failed  ?? []).map((x: { url: string }) => x.url));
        const partialUrls = new Set<string>((data.partial ?? []).map((x: { url: string }) => x.url));
        const enrichedMap = (data.enriched ?? {}) as Record<string, {
          topGames: string[] | null; genre: string | null; email: string | null;
          subscriberCount: number | null; medianViews: number | null;
        }>;

        setRows(prev => prev.map(r => {
          if (!batchIds.has(r.youtubeId)) return r;
          const url = urlById.get(r.youtubeId) ?? r.url;
          if (failedUrls.has(url)) return { ...r, status: 'idle' as OutreachRowStatus };
          const e     = enrichedMap[url];
          const patch = e ? {
            topGames:        e.topGames,
            genre:           e.genre,
            // Keep manually-entered email if enrichment found nothing
            email:           e.email ?? r.email,
            subscriberCount: e.subscriberCount ?? r.subscriberCount,
            medianViews:     e.medianViews,
            lastEnrichedAt:  new Date().toISOString(),
          } : {};
          if (partialUrls.has(url)) return { ...r, ...patch, status: 'idle' as OutreachRowStatus };
          return { ...r, ...patch, status: 'idle' as OutreachRowStatus };
        }));
      } catch {
        setRows(prev => prev.map(r => batchIds.has(r.youtubeId) ? { ...r, status: 'idle' as OutreachRowStatus } : r));
      }
    }

    setReEnrichAllProgress(null);
    setReEnrichingAll(false);
  }

  async function handleScoreAll() {
    if (scoring || !gameName.trim() || !comparables.trim()) return;
    setScoring(true);
    setScoreProgress('Scoring…');
    try {
      const res = await fetch('/api/outreach/score-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName: gameName.trim(), comparables: comparables.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScoreProgress(`Error: ${data.error ?? 'Scoring failed'}`);
        return;
      }
      setScoreProgress('Refreshing…');
      const refreshRes = await fetch('/api/outreach/channels');
      const refreshData = await refreshRes.json();
      const list: OutreachRow[] = (refreshData.channels ?? []).map((c: Omit<OutreachRow, 'status'>) => ({
        ...c,
        platform:      (c as OutreachRow).platform ?? 'youtube',
        hasHiddenEmail:  (c as OutreachRow).hasHiddenEmail  ?? null,
        priorityScore:  (c as OutreachRow).priorityScore  ?? null,
        priorityReason: (c as OutreachRow).priorityReason ?? null,
        status: 'idle' as OutreachRowStatus,
      }));
      setRows(list);
      setSorting([{ id: 'priorityScore', desc: true }]);
      setScoreProgress(`Done — ${data.scored as number} scored`);
      setScoreForm(false);
    } catch {
      setScoreProgress('Error — please try again.');
    } finally {
      setScoring(false);
    }
  }

  const handleDelete = useCallback(async (youtubeId: string) => {
    const backup = rows.find(r => r.youtubeId === youtubeId);
    setRows(prev => prev.filter(r => r.youtubeId !== youtubeId));
    setRowSelection(prev => { const n = { ...prev }; delete n[youtubeId]; return n; });
    setToolbarError('');
    try {
      const res = await fetch(`/api/outreach/channels/${youtubeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      if (backup) setRows(prev => [backup, ...prev]);
      setToolbarError('Delete failed — please try again.');
    }
  }, [rows]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Object.keys(rowSelection);
    if (ids.length === 0) return;
    const backups = rows.filter(r => ids.includes(r.youtubeId));
    setRows(prev => prev.filter(r => !ids.includes(r.youtubeId)));
    setRowSelection({});
    setToolbarError('');
    try {
      const res = await fetch('/api/outreach/channels/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows(prev => [...backups, ...prev]);
      setToolbarError('Some channels could not be deleted — please try again.');
    }
  }, [rows, rowSelection]);

  const columns = useMemo<ColumnDef<OutreachRow>[]>(() => [
    {
      id: 'select',
      header: ({ table: t }) => {
        const allSelected = t.getIsAllPageRowsSelected();
        return (
          <input
            type="checkbox"
            aria-label="Select all visible channels"
            checked={allSelected}
            onChange={t.getToggleAllPageRowsSelectedHandler()}
          />
        );
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          disabled={row.original.status === 'enriching'}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      enableSorting: false,
    },
    {
      id: 'contacted',
      header: 'Contacted',
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.original.contacted}
          aria-label={`Mark ${row.original.name} as contacted`}
          onChange={async (e) => {
            const val = e.target.checked;
            setRows(prev => prev.map(r =>
              r.youtubeId === row.original.youtubeId ? { ...r, contacted: val } : r
            ));
            await fetch(`/api/outreach/channels/${encodeURIComponent(row.original.youtubeId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contacted: val }),
            });
          }}
          className="w-4 h-4 cursor-pointer"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Channel name',
      cell: ({ row }) => (
        <a
          href={row.original.url.startsWith('http') ? row.original.url : `https://${row.original.url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        >
          {row.original.name || row.original.youtubeId}
        </a>
      ),
    },
    {
      accessorKey: 'subscriberCount',
      header: 'Subscribers',
      sortingFn: (a, b) => {
        const av = a.original.subscriberCount ?? Number.POSITIVE_INFINITY;
        const bv = b.original.subscriberCount ?? Number.POSITIVE_INFINITY;
        return av - bv;
      },
      cell: ({ row }) => row.original.subscriberCount === null
        ? <span className="text-gray-500">—</span>
        : <span>{fmt(row.original.subscriberCount)}</span>,
    },
    {
      id: 'topGames',
      header: 'Top games',
      cell: ({ row }) => row.original.topGames && row.original.topGames.length > 0
        ? <span className="text-gray-200 text-sm">{row.original.topGames.join(', ')}</span>
        : <span className="text-gray-500">—</span>,
      enableSorting: false,
    },
    {
      id: 'genre',
      header: 'Genre',
      cell: ({ row }) => row.original.genre
        ? <Badge variant="secondary">{row.original.genre}</Badge>
        : <span className="text-gray-500">—</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'priorityScore',
      header: 'Score',
      sortingFn: (a, b) => {
        const av = a.original.priorityScore ?? -1;
        const bv = b.original.priorityScore ?? -1;
        return av - bv;
      },
      cell: ({ row }) => {
        const score  = row.original.priorityScore;
        const reason = row.original.priorityReason ?? '';
        if (score === null) return <span className="text-gray-500">—</span>;
        if (score >= 8) return <span title={reason}><Badge className="bg-green-700 text-white cursor-help">HIGH {score}</Badge></span>;
        if (score >= 5) return <span title={reason}><Badge className="bg-yellow-600 text-white cursor-help">MED {score}</Badge></span>;
        return <span title={reason}><Badge variant="destructive" className="cursor-help">LOW {score}</Badge></span>;
      },
    },
    {
      accessorKey: 'medianViews',
      header: 'Median views',
      cell: ({ row }) => row.original.medianViews != null
        ? <span>{fmt(row.original.medianViews)}</span>
        : <span className="text-gray-500">—</span>,
    },
    {
      accessorKey: 'lastEnrichedAt',
      header: 'Last enriched',
      cell: ({ row }) => row.original.lastEnrichedAt
        ? <span className="text-sm text-gray-300">{new Date(row.original.lastEnrichedAt).toLocaleDateString()}</span>
        : <span className="text-gray-500">—</span>,
    },
    {
      id: 'email',
      header: 'Email',
      cell: ({ row }) => {
        const id = row.original.youtubeId;
        if (editingEmailId === id) {
          return (
            <input
              autoFocus
              type="email"
              value={editingEmailVal}
              onChange={e => setEditingEmailVal(e.target.value)}
              onBlur={async () => {
                const newEmail = editingEmailVal.trim();
                setEditingEmailId(null);
                if (newEmail === (row.original.email ?? '')) return;
                const res = await fetch(`/api/outreach/channels/${encodeURIComponent(id)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: newEmail || null }),
                });
                if (res.ok) {
                  setRows(prev => prev.map(r => r.youtubeId === id ? { ...r, email: newEmail || null } : r));
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setEditingEmailId(null); }
              }}
              className="bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-0.5 w-48 font-mono focus:outline-none focus:border-gray-400"
            />
          );
        }
        return row.original.email
          ? (
            <button
              type="button"
              onClick={() => { setEditingEmailId(id); setEditingEmailVal(row.original.email ?? ''); }}
              className="text-blue-400 hover:underline font-mono text-xs text-left"
            >
              {row.original.email}
            </button>
          )
          : (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setEditingEmailId(id); setEditingEmailVal(''); }}
                className="text-gray-600 hover:text-gray-400 text-xs italic"
              >
                Add email
              </button>
              {row.original.platform === 'youtube' && row.original.hasHiddenEmail === true && (
                <a
                  href={`${row.original.url}/about`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Hidden business email — open About page and click the reveal button"
                >
                  <Badge variant="outline" className="text-purple-400 cursor-pointer text-xs">
                    Hidden email ↗
                  </Badge>
                </a>
              )}
              {row.original.platform === 'youtube' && row.original.hasHiddenEmail === null && (
                <a
                  href={`${row.original.url}/about`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open YouTube About page to find email"
                  className="text-gray-600 hover:text-gray-300"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {/* hasHiddenEmail === false: confirmed no hidden email, no icon shown */}
            </span>
          );
      },
      enableSorting: false,
    },
    {
      id: 'platform',
      header: 'Platform',
      cell: ({ row }) => row.original.platform === 'twitch'
        ? <Badge variant="secondary" className="text-purple-400">Twitch</Badge>
        : <Badge variant="secondary">YouTube</Badge>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const enriching = row.original.status === 'enriching';
        return (
          <div className="flex gap-2">
            {row.original.platform !== 'twitch' && (
              <Button
                size="sm"
                variant="outline"
                disabled={enriching}
                onClick={() => handleReenrich(row.original)}
              >
                {enriching
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Enriching…</>
                  : <><RefreshCw className="h-4 w-4 mr-1" />Re-enrich</>}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={enriching}
              onClick={() => handleDelete(row.original.youtubeId)}
            >
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [handleReenrich, handleDelete, editingEmailId, editingEmailVal]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => row.original.status !== 'enriching',
    getRowId: (row) => row.youtubeId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Declared AFTER `table` so it can reference table.getRowModel()
  function handleExportCsv() {
    const headers = ['Channel name', 'URL', 'Subscribers', 'Top games', 'Genre', 'Median views', 'Last enriched', 'Email', 'Platform'];
    const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rowsData = table.getRowModel().rows.map(r => {
      const o = r.original;
      return [
        o.name,
        o.url,
        o.subscriberCount?.toString() ?? '',
        (o.topGames ?? []).join(' | '),
        o.genre ?? '',
        o.medianViews?.toString() ?? '',
        o.lastEnrichedAt ? new Date(o.lastEnrichedAt).toLocaleDateString() : '',
        o.email ?? '',
        o.platform ?? 'youtube',
      ].map(escapeCell).join(',');
    });
    const csv = [headers.map(escapeCell).join(','), ...rowsData].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach-channels-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportNotion() {
    const notionRows = table.getRowModel().rows.filter(r => r.original.email);
    const headers = ['channel', 'contact', 'contact method', 'contact person', 'date contacted', 'steam key sent', 'comment'];
    const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const data = notionRows.map(r => {
      const o = r.original;
      return [
        o.name,
        o.email ?? '',
        'Email',
        '',
        '',
        '',
        '',
      ].map(escapeCell).join(',');
    });
    const csv = [headers.map(escapeCell).join(','), ...data].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notion-outreach-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Genre filter */}
        <Select value={genreFilter} onValueChange={(v) => setGenreFilter(v ?? '')}>
          <SelectTrigger className="w-44 bg-gray-900 border-gray-700 text-white">
            <SelectValue placeholder="Genre: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All genres</SelectItem>
            {genres.map(g => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Min median views */}
        <Input
          type="number"
          placeholder="Min median views"
          min={0}
          value={minMedianViews ?? ''}
          onChange={e => setMinMedianViews(e.target.value ? Number(e.target.value) : null)}
          className="w-40 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />

        {/* Min subscribers */}
        <Input
          type="number"
          placeholder="Min subscribers"
          min={0}
          value={minSubs ?? ''}
          onChange={e => setMinSubs(e.target.value ? Number(e.target.value) : null)}
          className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />

        {/* Max subscribers */}
        <Input
          type="number"
          placeholder="Max subscribers"
          min={0}
          value={maxSubs ?? ''}
          onChange={e => setMaxSubs(e.target.value ? Number(e.target.value) : null)}
          className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />

        <Input
          type="number"
          placeholder="e.g. 90"
          min={1}
          value={maxInactiveDays ?? ''}
          onChange={e => setMaxInactiveDays(e.target.value ? Number(e.target.value) : null)}
          className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />
        {maxInactiveDays !== null && (
          <span className="text-xs text-gray-500 whitespace-nowrap">days active</span>
        )}

        <Button
          variant={gamingOnly ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setGamingOnly(v => !v)}
        >
          Gaming only
        </Button>

        <Button
          variant={hideContacted ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setHideContacted(v => !v)}
        >
          Hide contacted
        </Button>

        {/* Score all inline form */}
        {!scoreForm && (
          <Button variant="outline" size="sm" onClick={() => setScoreForm(true)} disabled={scoring}>
            Score all
          </Button>
        )}
        {scoreForm && !scoring && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={gameName}
              onChange={e => setGameName(e.target.value)}
              placeholder="Your game, e.g. RealmWalker"
              className="w-44 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
            />
            <Input
              value={comparables}
              onChange={e => setComparables(e.target.value)}
              placeholder="Similar games, e.g. Hades, Slay the Spire"
              className="w-56 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
            />
            <Button size="sm" onClick={handleScoreAll} disabled={!gameName.trim() || !comparables.trim()}>
              Run scoring
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setScoreForm(false); setScoreProgress(''); }}>
              Cancel
            </Button>
          </div>
        )}
        {scoring && (
          <span className="text-sm text-gray-400 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />{scoreProgress}
          </span>
        )}
        {!scoring && scoreProgress && !scoreForm && (
          <span className="text-sm text-gray-400">{scoreProgress}</span>
        )}

        <span className="text-sm text-gray-400 ml-auto">
          {filtered.length} channel{filtered.length === 1 ? '' : 's'}
        </span>

        {selectedCount > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete {selectedCount} channel{selectedCount === 1 ? '' : 's'}
          </Button>
        )}

        {!reEnrichingAll && rows.some(r => r.platform === 'youtube' && r.status === 'idle') && (
          <Button variant="outline" size="sm" onClick={handleReenrichAll}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Re-enrich all ({rows.filter(r => r.platform === 'youtube' && r.status === 'idle').length})
          </Button>
        )}
        {reEnrichingAll && reEnrichAllProgress && (
          <span className="text-sm text-gray-400 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Batch {reEnrichAllProgress.current}/{reEnrichAllProgress.total}…
          </span>
        )}

        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="h-4 w-4 mr-1" />
          Export CSV
        </Button>

        <Button variant="outline" size="sm" onClick={handleExportNotion}>
          <Download className="h-4 w-4 mr-1" />
          Export for Notion
        </Button>
      </div>

      {/* Toolbar errors */}
      {toolbarError && <p className="text-red-400 text-sm">{toolbarError}</p>}
      {loadError    && <p className="text-red-400 text-sm">{loadError}</p>}

      {/* Loading state */}
      {loading && (
        <div className="py-12 flex justify-center">
          <Loader2 className="animate-spin h-5 w-5 text-gray-400" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="rounded-md border border-gray-800 overflow-hidden">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(hg => (
                <TableRow key={hg.id} className="border-gray-800 hover:bg-transparent">
                  {hg.headers.map(header => (
                    <TableHead
                      key={header.id}
                      className="text-gray-400 text-xs"
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-gray-500 py-8">
                    {rows.length === 0
                      ? (
                        <div className="space-y-1">
                          <p>No outreach channels yet.</p>
                          <p className="text-xs">Save channels from the Discover tab to populate this list.</p>
                        </div>
                      )
                      : (
                        <div className="space-y-1">
                          <p>No channels match the current filters.</p>
                          <p className="text-xs">Try clearing the genre filter or adjusting the view/subscriber thresholds.</p>
                        </div>
                      )}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.id}
                    className={`border-gray-800 hover:bg-gray-900 ${row.original.status === 'enriching' ? 'opacity-50' : ''}`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
