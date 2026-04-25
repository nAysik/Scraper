import DashboardNav from '@/components/dashboard-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">YouTube Niche Finder</h1>
        <form action="/api/auth/signout" method="post">
          <button className="text-sm text-gray-400 hover:text-white">Sign out</button>
        </form>
      </header>

      <DashboardNav />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
