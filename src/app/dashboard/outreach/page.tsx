// src/app/dashboard/outreach/page.tsx
// Phase 2 minimal version — hosts the EnrichForm only.
// Phase 4 (DASH-*) expands this with a filterable table and CSV export below the form.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EnrichForm from '@/components/outreach/enrich-form';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Outreach Enrichment</h1>
        <p className="text-sm text-gray-400 mt-1">
          Paste up to 15 YouTube channel URLs (one per line). We&apos;ll fetch each
          channel&apos;s last 10 videos, extract the top 3 games and primary genre,
          and save the result to your outreach list.
        </p>
      </div>
      <EnrichForm />
    </div>
  );
}
