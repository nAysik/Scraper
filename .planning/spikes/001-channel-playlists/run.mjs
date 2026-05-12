// Spike 001: Does youtubei.js return channel playlists with usable video counts?
//
// Run: node .planning/spikes/001-channel-playlists/run.mjs [channelId]
// Default channel: Northernlion (UC3tNpTOHsTnkmbwztCs30sA)

import { Innertube } from 'youtubei.js';

const channelId = process.argv[2] ?? 'UC3tNpTOHsTnkmbwztCs30sA'; // Northernlion

console.log(`\nFetching playlists for channel: ${channelId}\n`);

const yt = await Innertube.create({ retrieve_player: false });
const channel = await yt.getChannel(channelId);

if (!channel.has_playlists) {
  console.log('no playlists tab on this channel');
  process.exit(0);
}

const playlistTab = await channel.getPlaylists();
const items = playlistTab.playlists ?? [];

console.log(`has_playlists = true`);
console.log(`Items on first page: ${items.length}\n`);

// Parse LockupView shape for playlists (new YouTube response shape, same pattern as videos tab):
//   title:      item.metadata.title.text
//   videoCount: item.content_image.primary_thumbnail.overlays[0].badges[0].text  ("68 videos")
function parseLockupPlaylist(item) {
  const title = item.metadata?.title?.text ?? '';
  const playlistId = item.content_id ?? '';
  const overlays = item.content_image?.primary_thumbnail?.overlays ?? [];
  let countText = '';
  for (const o of overlays) {
    const badge = o.badges?.[0]?.text ?? '';
    if (badge && /\d/.test(badge)) { countText = badge; break; }
  }
  const count = countText ? parseInt(countText.replace(/[^0-9]/g, ''), 10) : null;
  return { title, playlistId, count, countText };
}

const rows = items.slice(0, 30).map(parseLockupPlaylist);

console.log('Playlists (first 30):');
console.log('─'.repeat(70));
for (const r of rows) {
  const c = r.count != null ? String(r.count).padStart(5) : '    ?';
  console.log(`  [${c}] ${r.title || '(no title)'}`);
}
console.log('─'.repeat(70));

const withCount = rows.filter(r => r.count != null);
const withTitle = rows.filter(r => r.title.length > 0);
console.log(`\n${withTitle.length}/${rows.length} playlists have a title`);
console.log(`${withCount.length}/${rows.length} playlists have a parseable video count`);

if (withCount.length > 0) {
  const sorted = [...rows].filter(r => r.count != null).sort((a, b) => b.count - a.count);
  console.log('\nTop 10 by video count (potential top-games signal):');
  sorted.slice(0, 10).forEach((r, i) => console.log(`  ${i+1}. ${r.title} — ${r.count} videos`));
}
