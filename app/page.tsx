"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogIn } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex flex-col">
      <header className="bg-white/80 border-b border-orange-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white rounded-lg shadow-md">
              <Image
                src="/bitsom-logo.png"
                alt="BITSoM Logo"
                width={40}
                height={40}
                className="h-10 w-auto"
              />
            </div>
            <span className="text-lg font-semibold text-slate-800">
              BITSoM Placements
            </span>
          </div>
          <Link href="/admin/login">
            <Button
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-400"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Login as Admin
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-orange-700 bg-clip-text text-transparent mb-3">
            BITSoM Placement Dashboard
          </h1>
          <p className="text-slate-600 mb-8">
            View real-time placement statistics for Batch of 2026.
          </p>
          <Link href="/dashboard">
            <Button
              size="lg"
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg"
            >
              <LayoutDashboard className="h-5 w-5 mr-2" />
              View Dashboard
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
