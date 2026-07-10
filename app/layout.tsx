import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whitelist App",
  description: "Web application for managing whitelists and allocations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-950 text-white flex">
        <aside className="w-64 bg-gray-900 border-r border-gray-800 p-6 flex flex-col gap-4">
          <div className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-8">
            Admin Panel
          </div>
          <nav className="flex flex-col gap-2">
            <a href="/" className="px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Export Holders</a>
            <a href="/whitelist" className="px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Whitelist Manager</a>
            <a href="/allocation" className="px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Community Allocation</a>
          </nav>
        </aside>
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
