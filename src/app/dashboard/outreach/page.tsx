// src/app/dashboard/outreach/page.tsx
// Phase 3 — server-component shell with auth gate; delegates to <OutreachTabs>
// which switches between the Discover and Bulk-Enrich client experiences.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OutreachTabs } from '@/components/outreach/discovery-table';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Channel Discovery</h1>
        <p className="text-sm text-gray-400 mt-1">
          Search for YouTube channels by game or keyword. Select up to 15 and save
          them to your outreach list — enrichment runs automatically on save.
        </p>
      </div>
      <OutreachTabs />
    </div>
  );
}
