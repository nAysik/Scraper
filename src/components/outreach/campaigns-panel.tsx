'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Send, Trash2, Eye, Plus, ArrowLeft } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'sending' | 'sent';
  createdAt: string;
  sentCount: number;
  clickedCount: number;
  totalCount: number;
}

interface CampaignSend {
  id: string;
  youtubeId: string;
  email: string;
  channelName: string;
  status: 'pending' | 'sent' | 'failed' | 'clicked';
  sentAt: string | null;
  clickedAt: string | null;
}

interface OutreachChannel {
  youtubeId: string;
  name: string;
  email: string | null;
  topGames: string[] | null;
  genre: string | null;
  platform: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === 'clicked') return <Badge className="bg-green-600 text-white">Clicked</Badge>;
  if (status === 'sent')    return <Badge variant="secondary">Sent</Badge>;
  if (status === 'failed')  return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function substitutePreview(template: string, ch: OutreachChannel): string {
  return template
    .replace(/\{\{ChannelName\}\}/g, ch.name)
    .replace(/\{\{TopGames\}\}/g,    (ch.topGames ?? []).join(', ') || '—')
    .replace(/\{\{Genre\}\}/g,       ch.genre ?? '—')
    .replace(/\{\{Platform\}\}/g,    ch.platform ?? 'YouTube');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CampaignsPanel() {
  type View = 'list' | 'compose' | 'detail';
  const [view, setView] = useState<View>('list');

  // List state
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError]     = useState('');

  // Detail state
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);
  const [sends, setSends]                   = useState<CampaignSend[]>([]);
  const [detailLoading, setDetailLoading]   = useState(false);

  // Compose state
  const [channels, setChannels]               = useState<OutreachChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName]       = useState('');
  const [subject, setSubject]                 = useState('');
  const [bodyText, setBodyText]               = useState('');
  const [bodyHtml, setBodyHtml]               = useState('');
  const [creating, setCreating]               = useState(false);
  const [sending, setSending]                 = useState(false);
  const [sendResult, setSendResult]           = useState<{ sent: number; failed: number } | null>(null);
  const [composeError, setComposeError]       = useState('');

  // Load campaigns when showing list
  useEffect(() => {
    if (view !== 'list') return;
    setListLoading(true);
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []))
      .catch(() => setListError('Failed to load campaigns.'))
      .finally(() => setListLoading(false));
  }, [view]);

  // Load channels with emails for compose
  useEffect(() => {
    if (view !== 'compose') return;
    setChannelsLoading(true);
    fetch('/api/outreach/channels')
      .then(r => r.json())
      .then(d => setChannels((d.channels ?? []).filter((c: OutreachChannel) => c.email)))
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, [view]);

  // Preview uses first selected channel
  const previewChannel = useMemo(() => {
    const id = Array.from(selectedIds)[0];
    return channels.find(c => c.youtubeId === id) ?? null;
  }, [selectedIds, channels]);

  function toggleChannel(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelectedIds(
      selectedIds.size === channels.length
        ? new Set()
        : new Set(channels.map(c => c.youtubeId))
    );
  }

  async function handleCreateAndSend() {
    if (!campaignName.trim() || !subject.trim() || selectedIds.size === 0) return;
    setCreating(true);
    setComposeError('');
    setSendResult(null);

    try {
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             campaignName.trim(),
          subjectTemplate:  subject,
          bodyTextTemplate: bodyText,
          bodyHtmlTemplate: bodyHtml || `<pre style="font-family:sans-serif;white-space:pre-wrap">${bodyText}</pre>`,
          channelIds:       Array.from(selectedIds),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setComposeError(createData.error ?? 'Failed to create campaign.'); return; }

      const campaignId = createData.campaignId as string;
      setCreating(false);
      setSending(true);

      const sendRes  = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' });
      const sendData = await sendRes.json();
      if (!sendRes.ok) { setComposeError(sendData.error ?? 'Send failed.'); return; }

      setSendResult({ sent: sendData.sent as number, failed: sendData.failed as number });
      setTimeout(() => { setView('list'); resetCompose(); }, 2000);
    } catch {
      setComposeError('An unexpected error occurred. Please try again.');
    } finally {
      setCreating(false);
      setSending(false);
    }
  }

  function resetCompose() {
    setCampaignName(''); setSubject(''); setBodyText(''); setBodyHtml('');
    setSelectedIds(new Set()); setSendResult(null); setComposeError('');
  }

  async function handleDelete(id: string) {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  async function handleViewDetail(campaign: Campaign) {
    setDetailCampaign(campaign);
    setDetailLoading(true);
    setView('detail');
    const res  = await fetch(`/api/campaigns/${campaign.id}/sends`);
    const data = await res.json();
    setSends(data.sends ?? []);
    setDetailLoading(false);
  }

  const estimatedMinutes = Math.ceil((selectedIds.size * 12) / 60);

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          </span>
          <Button size="sm" onClick={() => { resetCompose(); setView('compose'); }}>
            <Plus className="h-4 w-4 mr-1" />New campaign
          </Button>
        </div>

        {listError && <p className="text-red-400 text-sm">{listError}</p>}

        {listLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="animate-spin h-5 w-5 text-gray-400" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <p>No campaigns yet.</p>
            <p className="text-xs mt-1">Create one to start sending personalised outreach emails.</p>
          </div>
        ) : (
          <div className="rounded-md border border-gray-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs">Name</TableHead>
                  <TableHead className="text-gray-400 text-xs">Recipients</TableHead>
                  <TableHead className="text-gray-400 text-xs">Sent</TableHead>
                  <TableHead className="text-gray-400 text-xs">Clicked</TableHead>
                  <TableHead className="text-gray-400 text-xs">Status</TableHead>
                  <TableHead className="text-gray-400 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow key={c.id} className="border-gray-800 hover:bg-gray-900">
                    <TableCell className="py-2 text-white font-medium">{c.name}</TableCell>
                    <TableCell className="py-2 text-gray-300">{c.totalCount}</TableCell>
                    <TableCell className="py-2 text-gray-300">{c.sentCount}</TableCell>
                    <TableCell className="py-2 text-green-400 font-medium">{c.clickedCount}</TableCell>
                    <TableCell className="py-2">
                      {c.status === 'sent'    && <Badge variant="secondary">Sent</Badge>}
                      {c.status === 'sending' && <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1 inline" />Sending</Badge>}
                      {c.status === 'draft'   && <Badge variant="outline">Draft</Badge>}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleViewDetail(c)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (view === 'detail' && detailCampaign) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => setView('list')}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <span className="text-white font-medium">{detailCampaign.name}</span>
          <span className="text-gray-400 text-sm">
            {detailCampaign.sentCount} sent · {detailCampaign.clickedCount} clicked
          </span>
        </div>

        {detailLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="animate-spin h-5 w-5 text-gray-400" />
          </div>
        ) : (
          <div className="rounded-md border border-gray-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs">Channel</TableHead>
                  <TableHead className="text-gray-400 text-xs">Email</TableHead>
                  <TableHead className="text-gray-400 text-xs">Status</TableHead>
                  <TableHead className="text-gray-400 text-xs">Sent at</TableHead>
                  <TableHead className="text-gray-400 text-xs">Clicked at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sends.map(s => (
                  <TableRow key={s.id} className="border-gray-800 hover:bg-gray-900">
                    <TableCell className="py-2 text-white">{s.channelName}</TableCell>
                    <TableCell className="py-2 text-gray-300 font-mono text-xs">{s.email}</TableCell>
                    <TableCell className="py-2">{statusBadge(s.status)}</TableCell>
                    <TableCell className="py-2 text-gray-400 text-sm">
                      {s.sentAt ? new Date(s.sentAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-green-400 text-sm">
                      {s.clickedAt ? new Date(s.clickedAt).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  // ── COMPOSE VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setView('list')}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <span className="text-white font-medium">New campaign</span>
      </div>

      {/* Campaign name */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-wide">Campaign name</label>
        <Input
          value={campaignName}
          onChange={e => setCampaignName(e.target.value)}
          placeholder="e.g. Hades launch wave 1"
          className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />
      </div>

      {/* Recipients */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Recipients</label>
          <span className="text-sm text-gray-400">
            {channels.length} channels with emails · {selectedIds.size} selected
          </span>
        </div>
        {channelsLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="animate-spin h-4 w-4 text-gray-400" />
          </div>
        ) : (
          <div className="rounded-md border border-gray-800 overflow-hidden max-h-56 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === channels.length && channels.length > 0}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="text-gray-400 text-xs">Channel</TableHead>
                  <TableHead className="text-gray-400 text-xs">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map(c => (
                  <TableRow
                    key={c.youtubeId}
                    className="border-gray-800 hover:bg-gray-900 cursor-pointer"
                    onClick={() => toggleChannel(c.youtubeId)}
                  >
                    <TableCell className="py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.youtubeId)}
                        onChange={() => toggleChannel(c.youtubeId)}
                        onClick={e => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="py-1.5 text-white text-sm">{c.name}</TableCell>
                    <TableCell className="py-1.5 text-gray-400 font-mono text-xs">{c.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Template */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-wide">
          Template — variables: {'{{ChannelName}}'}, {'{{TopGames}}'}, {'{{Genre}}'}, {'{{Platform}}'}
        </label>
        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject: e.g. Collab opportunity for {{ChannelName}}"
          className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />
        <Textarea
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          placeholder={"Hi {{ChannelName}},\n\nI came across your channel covering {{TopGames}}...\n\nBest,\nYour Name"}
          rows={8}
          className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 font-mono text-sm"
        />
      </div>

      {/* Live preview */}
      {previewChannel && (subject || bodyText) && (
        <div className="rounded-md border border-gray-700 bg-gray-900 p-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Preview — {previewChannel.name}
          </p>
          {subject && (
            <p className="text-white text-sm font-medium">
              {substitutePreview(subject, previewChannel)}
            </p>
          )}
          {bodyText && (
            <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans">
              {substitutePreview(bodyText, previewChannel)}
            </pre>
          )}
        </div>
      )}

      {/* Send */}
      {composeError && <p className="text-red-400 text-sm">{composeError}</p>}

      {sendResult ? (
        <div className="rounded-md border border-gray-800 bg-gray-900 p-4 text-sm">
          <p className="font-medium text-white">
            Send complete — {sendResult.sent} sent
            {sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleCreateAndSend}
            disabled={!campaignName.trim() || !subject.trim() || selectedIds.size === 0 || creating || sending}
          >
            {(creating || sending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {creating
              ? 'Creating…'
              : sending
                ? `Sending… (~${estimatedMinutes} min)`
                : <><Send className="h-4 w-4 mr-1" />Create & send ({selectedIds.size})</>
            }
          </Button>
          {sending && (
            <span className="text-xs text-gray-500">
              Sending at 12 s/email — one.com rate limit
            </span>
          )}
        </div>
      )}
    </div>
  );
}
