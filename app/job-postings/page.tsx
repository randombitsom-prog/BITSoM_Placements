"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400 uppercase tracking-wide">BITSoM Placements</p>
            <h1 className="text-3xl font-semibold">Job Postings</h1>
            <p className="text-slate-300 max-w-xl">
              Real-time postings fetched directly from the BITSoM Pinecone knowledge base. Use the
              search below to filter by company, role, or location.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-900 bg-white shadow-lg hover:shadow-slate-200 transition"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="relative">
          <Input
            placeholder="Search by company, role, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400"
          />
        </div>

        {isLoading && (
          <Card className="bg-slate-800/80 border-slate-700">
            <CardContent className="py-10 text-center text-slate-300">Loading job postings...</CardContent>
          </Card>
        )}

        {error && (
          <Card className="bg-red-900/40 border-red-700">
            <CardContent className="py-8 text-center text-red-200">{error}</CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((listing) => (
              <Card
                key={listing.id}
                className="bg-slate-800/80 border-slate-700 shadow-lg hover:border-orange-400 transition flex flex-col"
              >
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg text-white">
                        {listing.company || "Unknown Company"}
                      </CardTitle>
                      <p className="text-sm text-slate-300">{listing.role || "Role TBD"}</p>
                    </div>
                    {listing.jobPackage && (
                      <Badge className="bg-orange-500 text-white whitespace-nowrap">
                        {listing.jobPackage}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                    <Badge
                      className={
                        listing.isOpen
                          ? "bg-emerald-600 text-white px-3"
                          : "bg-slate-600 text-slate-100 px-3"
                      }
                    >
                      {listing.isOpen ? "Open" : "Closed"}
                    </Badge>
                    {listing.location && <Badge variant="outline">{listing.location}</Badge>}
                    {listing.functionSector && (
                      <Badge variant="outline" className="text-slate-300 border-slate-600">
                        {listing.functionSector}
                      </Badge>
                    )}
                    {listing.clusterDay && (
                      <Badge variant="outline" className="text-slate-300 border-slate-600">
                        {listing.clusterDay}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-slate-300 space-y-3 flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {listing.publishDate && (
                      <div>
                        <p className="text-xs text-slate-500">Publish Date</p>
                        <p>{listing.publishDate}</p>
                      </div>
                    )}
                    {listing.deadline && (
                      <div>
                        <p className="text-xs text-slate-500">Application Deadline</p>
                        <p>{listing.deadline}</p>
                      </div>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-slate-400 text-sm">
                    {listing.description?.slice(0, 500) || "Description unavailable."}
                  </p>
                </CardContent>
                {listing.sourceUrl && (
                  <div className="px-6 pb-4">
                    <Link
                      href={listing.sourceUrl}
                      target="_blank"
                      className="text-orange-300 text-sm hover:text-orange-200 underline"
                    >
                      View on {listing.sourceName || "BITSoM Placement Portal"}
                    </Link>
                  </div>
                )}
              </Card>
            ))}
            {!filtered.length && (
              <Card className="bg-slate-800/80 border-slate-700 col-span-full">
                <CardContent className="py-10 text-center text-slate-300">
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

