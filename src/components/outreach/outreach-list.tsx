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
import { Loader2, Download, Trash2, RefreshCw } from 'lucide-react';

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
  email: string | null;
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
  const [maxSubs, setMaxSubs] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastEnrichedAt', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [toolbarError, setToolbarError] = useState('');

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
    if (maxSubs !== null && maxSubs > 0 && r.subscriberCount !== null && r.subscriberCount > maxSubs) return false;
    return true;
  }), [rows, genreFilter, minMedianViews, maxSubs]);

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
          email:           e.email,
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
      cell: ({ row }) => row.original.email
        ? <a href={`mailto:${row.original.email}`} className="text-blue-400 hover:underline font-mono text-xs">{row.original.email}</a>
        : <span className="text-gray-500">—</span>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const enriching = row.original.status === 'enriching';
        return (
          <div className="flex gap-2">
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
  ], [handleReenrich, handleDelete]);

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
    const headers = ['Channel name', 'URL', 'Subscribers', 'Top games', 'Genre', 'Median views', 'Last enriched', 'Email'];
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

        {/* Max subscribers */}
        <Input
          type="number"
          placeholder="Max subscribers"
          min={0}
          value={maxSubs ?? ''}
          onChange={e => setMaxSubs(e.target.value ? Number(e.target.value) : null)}
          className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />

        <span className="text-sm text-gray-400 ml-auto">
          {filtered.length} channel{filtered.length === 1 ? '' : 's'}
        </span>

        {selectedCount > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete {selectedCount} channel{selectedCount === 1 ? '' : 's'}
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="h-4 w-4 mr-1" />
          Export CSV
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
