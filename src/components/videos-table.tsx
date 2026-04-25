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
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export interface VideoRow {
  id: string;
  youtubeId: string;
  title: string;
  channelName: string;
  subscriberCount: number;
  viewCount: number;
  outlierScore: number;
  niche: string | null;
  publishedAt: string;
  isShort: boolean;
}

interface Props {
  videos: VideoRow[];
  niches: { id: string; name: string }[];
  defaultSort?: 'outlierScore' | 'viewCount';
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 5) return <Badge className="bg-orange-500 text-white">🔥 {score.toFixed(1)}x</Badge>;
  if (score >= 3) return <Badge className="bg-yellow-500 text-gray-900">{score.toFixed(1)}x</Badge>;
  return <Badge variant="secondary">{score.toFixed(1)}x</Badge>;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function VideosTable({ videos, niches, defaultSort = 'outlierScore' }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: defaultSort, desc: true }]);
  const [minScore, setMinScore] = useState(0);
  const [maxSubs, setMaxSubs] = useState(50_000_000);
  const [selectedNiche, setSelectedNiche] = useState('all');

  const filtered = useMemo(() => {
    return videos.filter(v => {
      if (v.outlierScore < minScore) return false;
      if (v.subscriberCount > maxSubs) return false;
      if (selectedNiche !== 'all' && v.niche !== selectedNiche) return false;
      return true;
    });
  }, [videos, minScore, maxSubs, selectedNiche]);

  const columns = useMemo<ColumnDef<VideoRow>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.isShort && (
            <span className="shrink-0 rounded bg-purple-600 px-1.5 py-0.5 text-xs text-white">Short</span>
          )}
          <a
            href={
              row.original.isShort
                ? `https://youtube.com/shorts/${row.original.youtubeId}`
                : `https://youtube.com/watch?v=${row.original.youtubeId}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline max-w-xs block truncate"
          >
            {row.original.title}
          </a>
        </span>
      ),
    },
    {
      accessorKey: 'channelName',
      header: 'Channel',
    },
    {
      accessorKey: 'subscriberCount',
      header: 'Subscribers',
      cell: ({ getValue }) => fmt(getValue() as number),
    },
    {
      accessorKey: 'viewCount',
      header: 'Views',
      cell: ({ getValue }) => fmt(getValue() as number),
    },
    {
      accessorKey: 'outlierScore',
      header: 'Score',
      cell: ({ getValue }) => <ScoreBadge score={getValue() as number} />,
    },
    {
      accessorKey: 'niche',
      header: 'Niche',
      cell: ({ getValue }) => (
        <span className="text-gray-300 text-sm">{(getValue() as string) ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'publishedAt',
      header: 'Published',
      cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
    },
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Min score</label>
          <Input
            type="number"
            value={minScore}
            min={0}
            step={0.5}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-24 bg-gray-800 border-gray-700 text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Max subscribers</label>
          <Input
            type="number"
            value={maxSubs}
            min={0}
            step={1000}
            onChange={e => setMaxSubs(Number(e.target.value))}
            className="w-32 bg-gray-800 border-gray-700 text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Niche</label>
          <Select value={selectedNiche} onValueChange={(v) => setSelectedNiche(v ?? 'all')}>
            <SelectTrigger className="w-44 bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="All niches" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              <SelectItem value="all">All niches</SelectItem>
              {niches.map(n => (
                <SelectItem key={n.id} value={n.name}>{n.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-gray-500 text-sm ml-auto self-end">
          {filtered.length} results
        </span>
      </div>

      <div className="rounded-md border border-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="border-gray-800 hover:bg-gray-900">
                {hg.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className="text-gray-400 cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-gray-500 py-8">
                  No results yet.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  className={`border-gray-800 ${
                    row.original.outlierScore >= 5 ? 'bg-orange-950/20' : 'hover:bg-gray-900'
                  }`}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="text-gray-200">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
