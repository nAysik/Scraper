'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Keywords Scraper', href: '/dashboard' },
  { label: 'Top Viral Charts', href: '/dashboard/charts' },
  { label: 'Niche Insights', href: '/dashboard/niches' },
  { label: 'Outreach', href: '/dashboard/outreach' },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-gray-800 px-6">
      {tabs.map(tab => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-white text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
