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

const MAX_SAVE = 15;

type RowStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface TwitchRow {
  twitchId: string;
  login: string;
  displayName: string;
  url: string;
  viewerCount: number;
  email: string | null;
  alreadySaved: boolean;
  status: RowStatus;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function TwitchDiscoveryPanel() {
  const [game, setGame]               = useState('');
  const [mode, setMode]               = useState<'live' | 'clips'>('live');
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState('');
  const [rows, setRows]               = useState<TwitchRow[]>([]);
  const [searched, setSearched]       = useState(false);
  const [maxViewers, setMaxViewers]   = useState<number | null>(null);
  const [sorting, setSorting]         = useState<SortingState>([{ id: 'viewerCount', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [summary, setSummary]         = useState<{ saved: number; failed: number } | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = game.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setSearchError('');
    setSummary(null);
    setRowSelection({});
    try {
      const res = await fetch('/api/outreach/discover-twitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: trimmed, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? 'Search failed — please try again.');
        setRows([]);
      } else {
        const list = (data.channels as Omit<TwitchRow, 'status'>[] | undefined) ?? [];
        setRows(list.map(c => ({ ...c, status: 'idle' as RowStatus })));
        setSearched(true);
      }
    } catch {
      setSearchError('Search failed — please check your connection and try again.');
      setRows([]);
    } finally {
      setSearching(false);
    }
  }

  const filtered = useMemo(() => {
    if (maxViewers === null || maxViewers <= 0) return rows;
    return rows.filter(r => r.viewerCount <= maxViewers);
  }, [rows, maxViewers]);

  const columns = useMemo<ColumnDef<TwitchRow>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => {
        const eligibleRows  = table.getRowModel().rows.filter(r => !r.original.alreadySaved);
        const checkedCount  = eligibleRows.filter(r => r.getIsSelected()).length;
        const allChecked    = eligibleRows.length > 0 && checkedCount === Math.min(eligibleRows.length, MAX_SAVE);
        return (
          <input
            type="checkbox"
            aria-label="Select all visible streamers"
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
          aria-label={`Select ${row.original.displayName}`}
          checked={row.getIsSelected()}
          disabled={row.original.alreadySaved || saving}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'displayName',
      header: 'Streamer',
      cell: ({ row }) => (
        <a
          href={row.original.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:underline"
        >
          {row.original.displayName}
        </a>
      ),
    },
    {
      accessorKey: 'viewerCount',
      header: mode === 'clips' ? 'Top clip views' : 'Live viewers',
      cell: ({ row }) => <span>{fmt(row.original.viewerCount)}</span>,
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
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        if (row.original.alreadySaved && row.original.status === 'idle') {
          return <Badge variant="secondary">Already saved</Badge>;
        }
        if (row.original.status === 'saving') return <Badge variant="secondary">Saving…</Badge>;
        if (row.original.status === 'saved')  return <Badge>Saved</Badge>;
        if (row.original.status === 'failed') return <Badge variant="destructive">Failed</Badge>;
        return null;
      },
      enableSorting: false,
    },
  ], [saving, mode]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => !row.original.alreadySaved,
    getRowId: (row) => row.twitchId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedRows  = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const tooMany       = selectedCount > MAX_SAVE;

  async function handleSave() {
    if (selectedCount === 0 || tooMany || saving) return;
    const selectedIds = new Set(selectedRows.map(r => r.original.twitchId));
    setRows(prev => prev.map(r =>
      selectedIds.has(r.twitchId) ? { ...r, status: 'saving' as RowStatus } : r,
    ));
    setSaving(true);
    setSaveError('');
    setSummary(null);

    try {
      const channels = selectedRows.map(r => r.original);
      const res = await fetch('/api/outreach/save-twitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error ?? 'Save failed — please try again.');
        setRows(prev => prev.map(r =>
          selectedIds.has(r.twitchId) ? { ...r, status: 'idle' as RowStatus } : r,
        ));
        return;
      }

      setRows(prev => prev.map(r => {
        if (!selectedIds.has(r.twitchId)) return r;
        return { ...r, status: 'saved' as RowStatus, alreadySaved: true };
      }));
      setSummary({ saved: data.saved ?? 0, failed: data.failed ?? 0 });
      setRowSelection({});
    } catch {
      setSaveError('Save failed — please try again.');
      setRows(prev => prev.map(r =>
        selectedIds.has(r.twitchId) ? { ...r, status: 'idle' as RowStatus } : r,
      ));
    } finally {
      setSaving(false);
    }
  }

  const saveButtonLabel = saving
    ? `Saving ${selectedCount} streamer${selectedCount === 1 ? '' : 's'}…`
    : selectedCount > 0
      ? `Save ${selectedCount} streamer${selectedCount === 1 ? '' : 's'}`
      : 'Save streamers';

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 w-fit rounded-md border border-gray-700 p-0.5 bg-gray-900">
        <button
          type="button"
          onClick={() => { setMode('live'); setRows([]); setSearched(false); }}
          className={`px-3 py-1 text-sm rounded transition-colors ${mode === 'live' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Live now
        </button>
        <button
          type="button"
          onClick={() => { setMode('clips'); setRows([]); setSearched(false); }}
          className={`px-3 py-1 text-sm rounded transition-colors ${mode === 'clips' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Recent clips
        </button>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-0">
          <Input
            value={game}
            onChange={e => setGame(e.target.value)}
            placeholder="e.g. Hades, Minecraft, Valorant"
            disabled={searching}
            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
          />
        </div>
        <Button type="submit" disabled={!game.trim() || searching}>
          {searching && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {searching ? 'Searching…' : 'Search Twitch'}
        </Button>
      </form>

      {searchError && <p className="text-red-400 text-sm">{searchError}</p>}

      {searched && (
        <div className="space-y-3">
          {/* Filter row */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-gray-400 whitespace-nowrap">{mode === 'clips' ? 'Max clip views' : 'Max live viewers'}</label>
            <Input
              type="number"
              placeholder="e.g. 5000"
              min={0}
              value={maxViewers ?? ''}
              onChange={e => setMaxViewers(e.target.value ? Number(e.target.value) : null)}
              className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
            />
            <span className="text-sm text-gray-400 ml-auto">
              {filtered.length} streamer{filtered.length === 1 ? '' : 's'} found
            </span>
            <Button onClick={handleSave} disabled={selectedCount === 0 || tooMany || saving}>
              {saving && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saveButtonLabel}
            </Button>
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
                        ? 'No live streamers found for that game. Try a different game name.'
                        : 'No streamers match the current filter. Try increasing the max viewers limit.'}
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
                Maximum 15 streamers per save. Deselect some to continue.
              </p>
            )}
            <Button onClick={handleSave} disabled={selectedCount === 0 || tooMany || saving}>
              {saveButtonLabel}
            </Button>
          </div>

          {/* Summary panel */}
          {summary !== null && (
            <div className="rounded-md border border-gray-800 bg-gray-900 p-4 text-sm space-y-1">
              <p className="font-medium text-white">
                Save complete — {summary.saved}/{summary.saved + summary.failed} saved
              </p>
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
