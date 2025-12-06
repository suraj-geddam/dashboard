import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, Upload, Settings, MessageSquare } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DashBoard",
  description: "Analyze your DoorDash orders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen bg-gray-50">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <h1 className="text-2xl font-bold text-[#FF3008]">DashBoard</h1>
            </div>
            <nav className="flex-1 p-4 space-y-2">
              <Link href="/" className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-red-50 hover:text-[#FF3008] rounded-lg transition-colors">
                <LayoutDashboard size={20} />
                <span className="font-medium">Dashboard</span>
              </Link>
              <Link href="/upload" className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-red-50 hover:text-[#FF3008] rounded-lg transition-colors">
                <Upload size={20} />
                <span className="font-medium">Upload Data</span>
              </Link>
              <Link href="/query" className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-red-50 hover:text-[#FF3008] rounded-lg transition-colors">
                <MessageSquare size={20} />
                <span className="font-medium">Ask AI</span>
              </Link>
              <Link href="/settings" className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-red-50 hover:text-[#FF3008] rounded-lg transition-colors">
                <Settings size={20} />
                <span className="font-medium">Settings</span>
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-8 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
