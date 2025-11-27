"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type PlacementListing = {
  id: string;
  company: string;
  role: string;
  location?: string;
  jobPackage?: string;
  clusterDay?: string;
  functionSector?: string;
  publishDate?: string;
  deadline?: string;
  sourceName?: string;
  sourceUrl?: string;
  description?: string;
  isOpen?: boolean;
};

export default function JobPostingsPage() {
  const [listings, setListings] = useState<PlacementListing[]>([]);
  const [filtered, setFiltered] = useState<PlacementListing[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListings = async () => {
      try {
        const res = await fetch("/api/placements");
        if (!res.ok) throw new Error("Failed to load placements");
        const data = await res.json();
        setListings(data.data || []);
        setFiltered(data.data || []);
      } catch (err) {
        console.error(err);
        setError("Unable to load job postings right now.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchListings();
  }, []);

  useEffect(() => {
    const query = search.toLowerCase();
    setFiltered(
      listings.filter(
        (listing) =>
          listing.company.toLowerCase().includes(query) ||
          listing.role.toLowerCase().includes(query) ||
          (listing.location || "").toLowerCase().includes(query)
      )
    );
  }, [search, listings]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      <header className="bg-white/80 border-b border-orange-200 shadow-lg backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
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
            <div className="flex-1">
              <h1 className="text-2xl bg-gradient-to-r from-slate-800 to-orange-700 bg-clip-text text-transparent">
                BITSoM Placement Job Postings
              </h1>
              <p className="text-sm text-slate-600">
                Live openings curated from the BITSoM placement portal
              </p>
              <p className="text-xs text-slate-500 mt-1">Batch of 2026</p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/60 transition"
            >
              Dashboard / Chatbot
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="bg-white/80 border border-orange-100 rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Open Roles</h2>
          <p className="text-sm text-slate-600 mb-4">
            Search by company, role or location to find relevant BITSoM placement opportunities.
          </p>
          <Input
            placeholder="Search by company, role, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border-orange-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400"
          />
        </div>

        {isLoading && (
          <Card className="bg-white/80 border-orange-100 shadow-lg">
            <CardContent className="py-10 text-center text-slate-500">
              Loading job postings...
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="bg-red-100 border-red-300">
            <CardContent className="py-8 text-center text-red-700">{error}</CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((listing) => (
              <Card
                key={listing.id}
                className="bg-white/90 border border-orange-100 shadow-lg hover:border-orange-300 transition flex flex-col"
              >
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg text-slate-900">
                        {listing.company || "Unknown Company"}
                      </CardTitle>
                      <p className="text-sm text-slate-600">{listing.role || "Role TBD"}</p>
                    </div>
                    {listing.jobPackage && (
                      <></>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <Badge
                      className={
                        listing.isOpen
                          ? "bg-emerald-600 text-white px-3"
                          : "bg-red-600 text-white px-3"
                      }
                    >
                      {listing.isOpen ? "Open" : "Closed"}
                    </Badge>
                    {listing.location && <Badge variant="outline">{listing.location}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-slate-300 space-y-3 flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {listing.publishDate && (
                      <div>
                        <p className="text-xs text-slate-500">Publish Date</p>
                        <p className="text-slate-700">{listing.publishDate}</p>
                      </div>
                    )}
                    {listing.deadline && (
                      <div>
                        <p className="text-xs text-slate-500">Application Deadline</p>
                        <p className="text-slate-700">{listing.deadline}</p>
                      </div>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-slate-600 text-sm">
                    {listing.description?.slice(0, 500) || "Description unavailable."}
                  </p>
                </CardContent>
              </Card>
            ))}
            {!filtered.length && (
              <Card className="bg-white/90 border-orange-100 col-span-full">
                <CardContent className="py-10 text-center text-slate-500">
                  No postings match your search.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

