"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ChatBot from '@/components/dashboard/ChatBot';
import { Search, TrendingUp, Users, Building2, IndianRupee, Award, Briefcase, UserCheck, UserX, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type PlacementStats = {
  ppos: number;
  campusPlaced: number;
  offCampusPlaced: number;
  totalPlaced: number;
  totalPPIs: number;
  totalUnplaced: number;
  highestCTC: number;
  averageCTC: number;
  lowestCTC: number;
};

type CompanyOffer = {
  company: string;
  offers: number;
};

type SheetRow = Record<string, string | number>;

const DEFAULT_STATS: PlacementStats = {
  ppos: 0,
  campusPlaced: 0,
  offCampusPlaced: 0,
  totalPlaced: 0,
  totalPPIs: 0,
  totalUnplaced: 0,
  highestCTC: 0,
  averageCTC: 0,
  lowestCTC: 0,
};

const SHEET_ID = process.env.NEXT_PUBLIC_BITSOM_SHEET_ID || '1sNESQWi2MQlIXuJ99zshKkFGw3bIoG7IgbYizqaaRIo';
const placementsSheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

const normalizeNumber = (value: string | number | undefined) => {
  if (value === undefined || value === null) return NaN;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : NaN;
};

const parseGvizResponse = (text: string): SheetRow[] => {
  const jsonText = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const data = JSON.parse(jsonText);
  const cols = data.table.cols.map((col: any, idx: number) => col.label || `col_${idx}`);
  return data.table.rows
    .map((row: any): SheetRow | null => {
      if (!row || !row.c) return null;
      const obj: SheetRow = {};
      row.c.forEach((cell: any, idx: number) => {
        obj[cols[idx]] = cell?.v ?? '';
      });
      return obj;
    })
    .filter((row: SheetRow | null): row is SheetRow => Boolean(row));
};

const buildStatsFromRows = (rows: SheetRow[]): PlacementStats => {
  if (!rows.length) return DEFAULT_STATS;

  let ppos = 0;
  let campusPlaced = 0;
  let offCampusPlaced = 0;
  let totalPPIs = 0;
  let totalUnplaced = 0;

  const ctcValues: number[] = [];

  rows.forEach((row) => {
    const status = String(row['Status'] || row['status'] || '').toLowerCase();
    const company = String(row['Company'] || row['company'] || '').trim();
    const ctc = normalizeNumber(row['CTC'] || row['ctc']);

    if (!Number.isNaN(ctc)) {
      ctcValues.push(ctc);
    }

    if (status.includes('ppo')) ppos += 1;
    else if (status.includes('off')) offCampusPlaced += 1;
    else if (status.includes('campus')) campusPlaced += 1;

    if (status.includes('ppi')) totalPPIs += 1;

    if (
      !status ||
      (!status.includes('ppo') && !status.includes('campus') && !status.includes('off'))
    ) {
      totalUnplaced += 1;
    }
  });

  const placedTotal = ppos + campusPlaced + offCampusPlaced;

  const highestCTC = ctcValues.length ? Math.max(...ctcValues) : DEFAULT_STATS.highestCTC;
  const lowestCTC = ctcValues.length ? Math.min(...ctcValues) : DEFAULT_STATS.lowestCTC;
  const averageCTC = ctcValues.length
    ? parseFloat((ctcValues.reduce((sum, val) => sum + val, 0) / ctcValues.length).toFixed(2))
    : DEFAULT_STATS.averageCTC;

  return {
    ppos,
    campusPlaced,
    offCampusPlaced,
    totalPlaced: placedTotal,
    totalPPIs,
    totalUnplaced,
    highestCTC,
    averageCTC,
    lowestCTC,
  };
};

const buildCompanyOffers = (rows: SheetRow[]): CompanyOffer[] => {
  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const company = String(row['Company'] || row['company'] || '').trim();
    if (!company) return;
    counts[company] = (counts[company] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([company, offers]) => ({ company, offers }))
    .sort((a, b) => b.offers - a.offers);
};

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [placementStats, setPlacementStats] = useState<PlacementStats>(DEFAULT_STATS);
  const [companyOffers, setCompanyOffers] = useState<CompanyOffer[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check authentication
    if (typeof window !== 'undefined') {
      const isAuthenticated = localStorage.getItem('isAuthenticated');
      if (!isAuthenticated) {
        router.push('/login');
      }
    }
  }, [router]);

  useEffect(() => {
    const fetchSheet = async () => {
      try {
        const response = await fetch(placementsSheetUrl);
        const text = await response.text();
        const rows = parseGvizResponse(text);
        setPlacementStats(buildStatsFromRows(rows));
        setCompanyOffers(buildCompanyOffers(rows));
      } catch (error) {
        console.error('Failed to load sheet data', error);
        setLoadError('Unable to load the latest placement data.');
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchSheet();
  }, []);

  const filteredCompanies = useMemo(() => {
    return companyOffers.filter(item =>
      item.company.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [companyOffers, searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      {/* Header */}
      <header className="bg-white/80 border-b border-orange-200 shadow-lg backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
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
                BITSoM Placement Dashboard
              </h1>
              <p className="text-sm text-slate-600">
                Real-time placement statistics and career opportunities
              </p>
              <p className="text-xs text-slate-500 mt-1">Batch of 2026</p>
            </div>
            <Link
              href="/job-postings"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/60 transition"
            >
              Job Postings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <div
        className={`max-w-[1400px] mx-auto p-6 flex flex-col xl:flex-row gap-6 transition-all duration-300 ${
          isChatExpanded ? 'xl:items-center xl:justify-center' : ''
        }`}
      >
        {/* Main Content - 2/3 width */}
        <div
          className={`flex-1 space-y-6 transition-all duration-300 ${
            isChatExpanded ? 'max-w-4xl w-full mx-auto' : ''
          }`}
        >
          {/* Key Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm text-orange-100">Total Placed</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Users className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl text-white mb-1">{placementStats.totalPlaced}</div>
                <p className="text-xs text-orange-100">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-300 rounded-full"></span>
                    Campus: {placementStats.campusPlaced}
                  </span>
                  {' • '}
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-300 rounded-full"></span>
                    Off: {placementStats.offCampusPlaced}
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm text-blue-100">PPO's</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Award className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl text-white mb-1">{placementStats.ppos}</div>
                <p className="text-xs text-blue-100">Pre-Placement Offers</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm text-emerald-100">Average CTC</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <IndianRupee className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl text-white mb-1">{placementStats.averageCTC} <span className="text-xl">LPA</span></div>
                <p className="text-xs text-emerald-100">
                  Range: {placementStats.lowestCTC} - {placementStats.highestCTC} LPA
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm text-purple-100">Highest CTC</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl text-white mb-1">{placementStats.highestCTC} <span className="text-xl">LPA</span></div>
                <p className="text-xs text-purple-100">Top package offered</p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Stats Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Placement Breakdown */}
            <Card className="bg-white/80 border-orange-200 shadow-xl backdrop-blur-sm">
              <CardHeader className="border-b border-orange-100">
                <CardTitle className="text-slate-800 flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-orange-600" />
                  Placement Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl hover:border-blue-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <Award className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">PPO's</span>
                    </div>
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-lg px-4 py-1">{placementStats.ppos}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-green-100/50 border border-green-200 rounded-xl hover:border-green-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500 rounded-lg">
                        <UserCheck className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Campus Placed</span>
                    </div>
                    <Badge className="bg-green-600 hover:bg-green-700 text-lg px-4 py-1">{placementStats.campusPlaced}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl hover:border-emerald-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500 rounded-lg">
                        <Building2 className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Off Campus Placed</span>
                    </div>
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-lg px-4 py-1">{placementStats.offCampusPlaced}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-orange-100/50 border border-orange-200 rounded-xl hover:border-orange-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500 rounded-lg">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Total Placed</span>
                    </div>
                    <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-lg px-4 py-1">{placementStats.totalPlaced}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Stats */}
            <Card className="bg-white/80 border-orange-200 shadow-xl backdrop-blur-sm">
              <CardHeader className="border-b border-orange-100">
                <CardTitle className="text-slate-800 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                  Additional Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-xl hover:border-yellow-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-500 rounded-lg">
                        <Briefcase className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Total PPI's</span>
                    </div>
                    <Badge className="bg-yellow-600 hover:bg-yellow-700 text-lg px-4 py-1">{placementStats.totalPPIs}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-red-100/50 border border-red-200 rounded-xl hover:border-red-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-500 rounded-lg">
                        <UserX className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Total Unplaced</span>
                    </div>
                    <Badge variant="destructive" className="text-lg px-4 py-1">{placementStats.totalUnplaced}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-teal-50 to-teal-100/50 border border-teal-200 rounded-xl hover:border-teal-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-teal-500 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Highest CTC</span>
                    </div>
                    <Badge className="bg-teal-600 hover:bg-teal-700 text-lg px-4 py-1">{placementStats.highestCTC} LPA</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl hover:border-cyan-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-500 rounded-lg">
                        <IndianRupee className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-slate-700">Average CTC</span>
                    </div>
                    <Badge className="bg-cyan-600 hover:bg-cyan-700 text-lg px-4 py-1">{placementStats.averageCTC} LPA</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Company Offers Table */}
          <Card className="bg-white/80 border-orange-200 shadow-xl backdrop-blur-sm">
            <CardHeader className="border-b border-orange-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-800 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-orange-600" />
                  Company-wise Offers
                </CardTitle>
                <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-lg px-4 py-1">
                  Total: {placementStats.totalPlaced}
                </Badge>
              </div>
              <div className="flex gap-3 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search companies..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white border-orange-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-orange-400 h-11"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[200px] bg-white border-orange-200 text-slate-800 h-11">
                    <SelectValue placeholder="Filter by..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-orange-200 text-slate-800">
                    <SelectItem value="all">All Companies</SelectItem>
                    <SelectItem value="high">High Offers (5+)</SelectItem>
                    <SelectItem value="medium">Medium Offers (2-4)</SelectItem>
                    <SelectItem value="low">Single Offers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="bg-orange-50/80 sticky top-0 z-10">
                    <TableRow className="border-orange-200 hover:bg-orange-50">
                      <TableHead className="text-slate-700 h-12">Company Name</TableHead>
                      <TableHead className="text-right text-slate-700 h-12">Number of Offers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingData && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-slate-500 py-6">
                          Loading latest data...
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoadingData && !filteredCompanies.length && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-slate-500 py-6">
                          {loadError || 'No companies match the current filters.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoadingData &&
                      filteredCompanies
                        .filter(item => {
                          if (filterType === 'high') return item.offers >= 5;
                          if (filterType === 'medium') return item.offers >= 2 && item.offers <= 4;
                          if (filterType === 'low') return item.offers === 1;
                          return true;
                        })
                        .map((item, index) => (
                          <TableRow 
                            key={index} 
                            className="border-orange-100 hover:bg-orange-50/50 transition-colors"
                          >
                            <TableCell className="text-slate-700 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
                                {item.company}
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-4">
                              <Badge 
                                className={
                                  item.offers >= 10 
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 px-4 py-1' 
                                    : item.offers >= 5 
                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-1' 
                                    : item.offers >= 3
                                    ? 'bg-blue-600 px-4 py-1'
                                    : 'bg-slate-500 px-3 py-1'
                                }
                              >
                                {item.offers}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ChatBot - 1/3 width */}
        <div className="w-full lg:w-[420px]">
          <ChatBot onExpandChange={setIsChatExpanded} />
        </div>
      </div>
    </div>
  );
}

