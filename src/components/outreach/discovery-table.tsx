'use client';

import { useState, useMemo } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DiscoveredChannel } from '@/lib/scraper/search-videos';
import EnrichForm from './enrich-form';
import OutreachList from './outreach-list';
import TwitchDiscoveryPanel from './twitch-discovery-panel';

const MAX_SAVE = 15;

type RowStatus = 'idle' | 'saving' | 'saved' | 'partial' | 'failed';

interface EnrichedRow {
  topGames: string[] | null;
  genre: string | null;
  email: string | null;
  subscriberCount: number | null;
  medianViews: number | null;
}

interface DiscoveryRow extends DiscoveredChannel {
  status: RowStatus;
  topGames?: string[] | null;
  genre?: string | null;
  email?: string | null;
  medianViews?: number | null;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function DiscoveryPanel() {
  const [chips, setChips] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [maxSubs, setMaxSubs] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'subscriberCount', desc: false }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [summary, setSummary] = useState<{ succeeded: number; failed: number; partial: number } | null>(null);
  const [autoSaving, setAutoSaving]       = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  function commitChip() {
    const v = inputValue.trim();
    if (!v || chips.includes(v) || chips.length >= 5) return;
    setChips(prev => [...prev, v]);
    setInputValue('');
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // Auto-commit any typed-but-not-yet-chipped keyword so clicking Search
    // without pressing Enter still works (fixes Phase 5 chip-input regression).
    let activeChips = chips;
    const pending = inputValue.trim();
    if (pending && !chips.includes(pending) && chips.length < 5) {
      activeChips = [...chips, pending];
      setChips(activeChips);
      setInputValue('');
    }
    if (activeChips.length === 0 || searching) return;
    setSearching(true);
    setSearchError('');
    setSummary(null);
    setRowSelection({});
    try {
      const res = await fetch('/api/outreach/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: activeChips }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? 'Search failed — please try again. If the problem persists, try a different keyword.');
        setRows([]);
      } else {
        const list = (data.channels as DiscoveredChannel[] | undefined) ?? [];
        setRows(list.map(c => ({ ...c, status: 'idle' as RowStatus })));
        setSearched(true);
      }
    } catch (err) {
      console.error('[discovery] search fetch failed', err);
      setSearchError('Search failed — please check your connection and try again.');
      setRows([]);
    } finally {
      setSearching(false);
    }
  }

  const filtered = useMemo(() => {
    if (maxSubs === null || maxSubs <= 0) return rows;
    return rows.filter(r => r.subscriberCount !== null && r.subscriberCount <= maxSubs);
  }, [rows, maxSubs]);

  const columns = useMemo<ColumnDef<DiscoveryRow>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => {
        const eligibleRows = table.getRowModel().rows.filter(r => !r.original.alreadySaved);
        const checkedCount = eligibleRows.filter(r => r.getIsSelected()).length;
        const allChecked = eligibleRows.length > 0 && checkedCount === Math.min(eligibleRows.length, MAX_SAVE);
        return (
          <input
            type="checkbox"
            aria-label="Select all visible channels"
            checked={allChecked}
            onChange={(e) => {
              if (e.target.checked) {
                const next: RowSelectionState = {};
                let n = 0;
                for (const r of eligibleRows) {
                  if (n >= MAX_SAVE) break;
                  next[r.id] = true;
                  n++;
                }
                setRowSelection(next);
              } else {
                setRowSelection({});
              }
            }}
            disabled={saving}
          />
        );
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          disabled={row.original.alreadySaved || saving}
          onChange={row.getToggleSelectedHandler()}
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
          {row.original.name || row.original.channelId}
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
      id: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email
        ? <a href={`mailto:${row.original.email}`} className="text-blue-400 hover:underline font-mono text-xs">{row.original.email}</a>
        : <span className="text-gray-500">—</span>,
      enableSorting: false,
    },
    {
      id: 'medianViews',
      header: 'Median views',
      cell: ({ row }) => row.original.medianViews != null
        ? <span>{fmt(row.original.medianViews)}</span>
        : <span className="text-gray-500">—</span>,
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        if (row.original.alreadySaved && row.original.status === 'idle') {
          return <Badge variant="secondary">Already saved</Badge>;
        }
        if (row.original.status === 'saving')  return <Badge variant="secondary">Saving…</Badge>;
        if (row.original.status === 'saved')   return <Badge>Saved</Badge>;
        if (row.original.status === 'partial') return <Badge variant="outline" className="text-yellow-400">Partial</Badge>;
        if (row.original.status === 'failed')  return <Badge variant="destructive">Failed</Badge>;
        return null;
      },
      enableSorting: false,
    },
  ], [saving]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => !row.original.alreadySaved,
    getRowId: (row) => row.channelId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const tooMany = selectedCount > MAX_SAVE;

  async function saveBatch(batch: DiscoveryRow[]): Promise<{ succeeded: number; failed: number; partial: number }> {
    const batchIds  = new Set(batch.map(r => r.channelId));
    const urlById   = new Map<string, string>(batch.map(r => [r.channelId, r.url]));
    const urls      = batch.map(r => r.url);

    setRows(prev => prev.map(r =>
      batchIds.has(r.channelId) ? { ...r, status: 'saving' as RowStatus } : r,
    ));

    try {
      const res  = await fetch('/api/outreach/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: urls.join('\n') }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRows(prev => prev.map(r =>
          batchIds.has(r.channelId) ? { ...r, status: 'idle' as RowStatus } : r,
        ));
        return { succeeded: 0, failed: batch.length, partial: 0 };
      }

      const failedUrls  = new Set<string>((data.failed  ?? []).map((x: { url: string }) => x.url));
      const partialUrls = new Set<string>((data.partial ?? []).map((x: { url: string }) => x.url));
      const enrichedMap: Record<string, EnrichedRow> = (data.enriched as Record<string, EnrichedRow> | undefined) ?? {};

      setRows(prev => prev.map(r => {
        if (!batchIds.has(r.channelId)) return r;
        if (failedUrls.has(r.url)) return { ...r, status: 'failed' as RowStatus };
        const url = urlById.get(r.channelId) ?? r.url;
        const e   = enrichedMap[url];
        const patch = e
          ? {
              topGames:        e.topGames,
              genre:           e.genre,
              email:           e.email,
              medianViews:     e.medianViews,
              subscriberCount: e.subscriberCount ?? r.subscriberCount,
            }
          : {};
        if (partialUrls.has(r.url)) return { ...r, ...patch, status: 'partial' as RowStatus, alreadySaved: true };
        return { ...r, ...patch, status: 'saved' as RowStatus, alreadySaved: true };
      }));

      return {
        succeeded: data.succeeded ?? 0,
        failed:    (data.failed   ?? []).length,
        partial:   (data.partial  ?? []).length,
      };
    } catch (err) {
      console.error('[discovery] saveBatch fetch failed', err);
      setRows(prev => prev.map(r =>
        batchIds.has(r.channelId) ? { ...r, status: 'idle' as RowStatus } : r,
      ));
      return { succeeded: 0, failed: batch.length, partial: 0 };
    }
  }

  async function handleSave() {
    if (selectedCount === 0 || tooMany || saving || autoSaving) return;
    setSaving(true);
    setSaveError('');
    setSummary(null);
    const batch = selectedRows.map(r => r.original);
    const result = await saveBatch(batch);
    setSummary(result);
    setRowSelection({});
    setSaving(false);
  }

  async function handleSaveAll() {
    if (autoSaving || saving) return;
    setAutoSaving(true);
    setSaveError('');
    setSummary(null);
    setRowSelection({});

    // Snapshot eligible rows and track saved IDs locally because rows state
    // updates asynchronously — cannot read updated rows mid-loop.
    const savedIds    = new Set<string>(rows.filter(r => r.alreadySaved).map(r => r.channelId));
    const allEligible = rows.filter(r => !r.alreadySaved && r.status === 'idle');
    const total       = Math.ceil(allEligible.length / MAX_SAVE);
    let totalSucceeded = 0, totalFailed = 0, totalPartial = 0;

    for (let i = 0; i < allEligible.length; i += MAX_SAVE) {
      const batch = allEligible.slice(i, i + MAX_SAVE).filter(r => !savedIds.has(r.channelId));
      if (batch.length === 0) continue;
      setBatchProgress({ current: Math.floor(i / MAX_SAVE) + 1, total });
      const result = await saveBatch(batch);
      totalSucceeded += result.succeeded;
      totalFailed    += result.failed;
      totalPartial   += result.partial;
      batch.forEach(r => savedIds.add(r.channelId));
    }

    setSummary({ succeeded: totalSucceeded, failed: totalFailed, partial: totalPartial });
    setBatchProgress(null);
    setAutoSaving(false);
  }

  const searchButtonLabel = searching
    ? 'Searching…'
    : chips.length > 0
      ? `Search ${chips.length} keyword${chips.length === 1 ? '' : 's'}`
      : 'Search channels';

  const saveButtonLabel = saving
    ? `Saving ${selectedCount} channel${selectedCount === 1 ? '' : 's'}…`
    : selectedCount > 0
      ? `Save ${selectedCount} channel${selectedCount === 1 ? '' : 's'}`
      : 'Save channels';

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-0">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {chips.map(chip => (
                <span key={chip} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-800 text-sm text-white">
                  {chip}
                  <button
                    type="button"
                    aria-label={`Remove ${chip}`}
                    onClick={() => setChips(prev => prev.filter(c => c !== chip))}
                    className="text-gray-400 hover:text-white leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitChip(); }
              if (e.key === 'Tab')   { e.preventDefault(); commitChip(); }
            }}
            placeholder={
              chips.length === 0
                ? 'e.g. Hades, Hades gameplay, Hades review'
                : chips.length < 5
                  ? 'Add another keyword…'
                  : ''
            }
            disabled={searching || chips.length >= 5}
            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
          />
          {chips.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">{chips.length}/5 keywords</p>
          )}
        </div>
        <Button type="submit" disabled={(chips.length === 0 && !inputValue.trim()) || searching}>
          {searching && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {searchButtonLabel}
        </Button>
      </form>

      {searchError && <p className="text-red-400 text-sm">{searchError}</p>}

      {/* Results section — only after first search */}
      {searched && (
        <div className="space-y-3">
          {/* Filter row */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-gray-400 whitespace-nowrap">Max subscribers</label>
            <Input
              type="number"
              placeholder="e.g. 10000"
              min={0}
              value={maxSubs ?? ''}
              onChange={e => setMaxSubs(e.target.value ? Number(e.target.value) : null)}
              className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
            />
            <span className="text-sm text-gray-400 ml-auto">
              {filtered.length} channel{filtered.length === 1 ? '' : 's'} found
            </span>
            <Button
              onClick={handleSave}
              disabled={selectedCount === 0 || tooMany || saving || autoSaving}
            >
              {saving && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saveButtonLabel}
            </Button>
            {rows.some(r => !r.alreadySaved && r.status === 'idle') && !autoSaving && !saving && (
              <Button variant="outline" onClick={handleSaveAll} disabled={saving || autoSaving}>
                Save all ({rows.filter(r => !r.alreadySaved && r.status === 'idle').length})
              </Button>
            )}
            {autoSaving && batchProgress && (
              <span className="text-sm text-gray-400">
                Saving batch {batchProgress.current} of {batchProgress.total}…
              </span>
            )}
          </div>

          {/* Table */}
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
                        ? 'No channels found for those keywords. Try different or broader terms.'
                        : 'No channels match the current filter. Try increasing the max-subscribers limit.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <TableRow key={row.id} className="border-gray-800 hover:bg-gray-900">
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

          {/* Save row */}
          <div className="flex items-center justify-end gap-3 flex-wrap">
            {saveError && <p className="text-red-400 text-sm mr-auto">{saveError}</p>}
            {tooMany && (
              <p className="text-red-400 text-sm mr-auto">
                Maximum 15 channels per save. Deselect some to continue.
              </p>
            )}
            <Button
              onClick={handleSave}
              disabled={selectedCount === 0 || tooMany || saving || autoSaving}
            >
              {saving && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saveButtonLabel}
            </Button>
            {rows.some(r => !r.alreadySaved && r.status === 'idle') && !autoSaving && !saving && (
              <Button variant="outline" onClick={handleSaveAll} disabled={saving || autoSaving}>
                Save all ({rows.filter(r => !r.alreadySaved && r.status === 'idle').length})
              </Button>
            )}
            {autoSaving && batchProgress && (
              <span className="text-sm text-gray-400">
                Saving batch {batchProgress.current} of {batchProgress.total}…
              </span>
            )}
          </div>

          {/* Summary panel */}
          {summary !== null && (
            <div className="rounded-md border border-gray-800 bg-gray-900 p-4 text-sm space-y-1">
              <p className="font-medium text-white">
                Save complete — {summary.succeeded}/{summary.succeeded + summary.partial + summary.failed} saved
              </p>
              {summary.partial > 0 && (
                <p className="text-yellow-400">{summary.partial} partial (InnerTube data saved; LLM enrichment failed)</p>
              )}
              {summary.failed > 0 && (
                <p className="text-red-400">{summary.failed} failed</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Renders a two-tab switcher between the Phase 2 EnrichForm and the Phase 3
// DiscoveryPanel. Keeps the page at /dashboard/outreach so DashboardNav's
// exact-match active state still highlights the Outreach tab (Pitfall 6).
export function OutreachTabs() {
  const [tab, setTab] = useState<'discover' | 'enrich' | 'outreach-list' | 'twitch-discover'>('discover');

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-800">
        <button
          type="button"
          onClick={() => setTab('discover')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'discover'
              ? 'border-white text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Discover channels
        </button>
        <button
          type="button"
          onClick={() => setTab('enrich')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'enrich'
              ? 'border-white text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Bulk enrich
        </button>
        <button
          type="button"
          onClick={() => setTab('outreach-list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'outreach-list'
              ? 'border-white text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Outreach list
        </button>
        <button
          type="button"
          onClick={() => setTab('twitch-discover')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'twitch-discover'
              ? 'border-white text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Discover on Twitch
        </button>
      </div>

      {tab === 'discover'        && <DiscoveryPanel />}
      {tab === 'enrich'          && <EnrichForm />}
      {tab === 'outreach-list'   && <OutreachList />}
      {tab === 'twitch-discover' && <TwitchDiscoveryPanel />}
    </div>
  );
}
