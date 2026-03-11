"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  getPlacementsSheetUrl,
  parseGvizResponse,
  getColumnsFromRows,
  type SheetRow,
} from "@/lib/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Building2,
  LogOut,
  Search,
  Pencil,
  ArrowLeft,
  Users,
  Award,
  IndianRupee,
  TrendingUp,
  Briefcase,
  UserCheck,
  UserX,
  BarChart3,
  List,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type RowWithIndex = SheetRow & { __index: number };

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
  averageCTC: number;
  industry: string;
};

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

const normalizeNumber = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return NaN;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : NaN;
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
    const status = String(row["Status"] ?? row["status"] ?? "").toLowerCase();
    const ctc = normalizeNumber(row["CTC"] ?? row["ctc"]);
    if (!Number.isNaN(ctc)) ctcValues.push(ctc);
    if (status.includes("ppo")) ppos += 1;
    else if (status.includes("off")) offCampusPlaced += 1;
    else if (status.includes("campus")) campusPlaced += 1;
    if (status.includes("ppi")) totalPPIs += 1;
    if (
      !status ||
      (!status.includes("ppo") && !status.includes("campus") && !status.includes("off"))
    ) {
      totalUnplaced += 1;
    }
  });
  const placedTotal = ppos + campusPlaced + offCampusPlaced;
  const highestCTC = ctcValues.length ? Math.max(...ctcValues) : 0;
  const lowestCTC = ctcValues.length ? Math.min(...ctcValues) : 0;
  const averageCTC = ctcValues.length
    ? parseFloat((ctcValues.reduce((s, v) => s + v, 0) / ctcValues.length).toFixed(2))
    : 0;
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
  const ctcSums: Record<string, number> = {};
  const ctcCounts: Record<string, number> = {};
  const industryByCompany: Record<string, string> = {};
  rows.forEach((row) => {
    const status = String(row["Status"] ?? row["status"] ?? "").toLowerCase();
    const company = String(row["Company"] ?? row["company"] ?? "").trim();
    const ctc = normalizeNumber(row["CTC"] ?? row["ctc"]);
    const industry = String(row["Industry"] ?? row["industry"] ?? "").trim();
    if (!company) return;
    if (status.includes("ppi")) return;
    if (
      !status ||
      (!status.includes("ppo") && !status.includes("campus") && !status.includes("off"))
    ) {
      return;
    }
    counts[company] = (counts[company] ?? 0) + 1;
    if (industry && !industryByCompany[company]) industryByCompany[company] = industry;
    if (!Number.isNaN(ctc)) {
      ctcSums[company] = (ctcSums[company] ?? 0) + ctc;
      ctcCounts[company] = (ctcCounts[company] ?? 0) + 1;
    }
  });
  return Object.entries(counts)
    .map(([company, offers]) => ({
      company,
      offers,
      averageCTC:
        ctcCounts[company] && ctcSums[company]
          ? parseFloat((ctcSums[company] / ctcCounts[company]).toFixed(2))
          : 0,
      industry: industryByCompany[company] ?? "",
    }))
    .sort((a, b) => b.offers - a.offers);
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RowWithIndex[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterIndustry, setFilterIndustry] = useState("all");
  const [ctcMin, setCtcMin] = useState("any");
  const [ctcMax, setCtcMax] = useState("any");
  const [editRow, setEditRow] = useState<RowWithIndex | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "records">("overview");
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewFilter, setOverviewFilter] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = getPlacementsSheetUrl();
      const res = await fetch(url);
      const text = await res.text();
      const parsed = parseGvizResponse(text);
      const withIndex: RowWithIndex[] = parsed.map((r, i) => ({ ...r, __index: i }));
      setRows(withIndex);
      setColumns(getColumnsFromRows(parsed));
    } catch (e) {
      console.error(e);
      setError("Failed to load sheet data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const s = String(r["Status"] ?? r["status"] ?? "").trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [rows]);

  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = String(r["Company"] ?? r["company"] ?? "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [rows]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const i = String(r["Industry"] ?? r["industry"] ?? "").trim();
      if (i) set.add(i);
    });
    return Array.from(set).sort();
  }, [rows]);

  const placementStats = useMemo(
    () => buildStatsFromRows(rows),
    [rows]
  );

  const companyOffers = useMemo(
    () => buildCompanyOffers(rows),
    [rows]
  );

  const filteredCompanyOffers = useMemo(() => {
    return companyOffers
      .filter((item) =>
        item.company.toLowerCase().includes(overviewSearch.toLowerCase())
      )
      .filter((item) => {
        if (overviewFilter === "high") return item.offers >= 5;
        if (overviewFilter === "medium") return item.offers >= 2 && item.offers <= 4;
        if (overviewFilter === "low") return item.offers === 1;
        return true;
      });
  }, [companyOffers, overviewSearch, overviewFilter]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const status = String(row["Status"] ?? row["status"] ?? "").toLowerCase();
      const company = String(row["Company"] ?? row["company"] ?? "").toLowerCase();
      const industry = String(
        row["Industry"] ?? row["industry"] ?? ""
      ).toLowerCase();
      const ctc = normalizeNumber(row["CTC"] ?? row["ctc"]);

      if (search) {
        const searchLower = search.toLowerCase();
        const matches = columns.some(
          (col) =>
            String(row[col] ?? "").toLowerCase().includes(searchLower)
        );
        if (!matches) return false;
      }
      if (filterStatus && filterStatus !== "all") {
        if (!status.includes(filterStatus.toLowerCase())) return false;
      }
      if (filterCompany && filterCompany !== "all") {
        if (company !== filterCompany.toLowerCase()) return false;
      }
      if (filterIndustry && filterIndustry !== "all") {
        if (industry !== filterIndustry.toLowerCase()) return false;
      }
      if (ctcMin && ctcMin !== "any") {
        const min = parseFloat(ctcMin);
        if (!Number.isNaN(min) && ctc < min) return false;
      }
      if (ctcMax && ctcMax !== "any") {
        const max = parseFloat(ctcMax);
        if (!Number.isNaN(max) && ctc > max) return false;
      }
      return true;
    });
  }, [
    rows,
    search,
    filterStatus,
    filterCompany,
    filterIndustry,
    ctcMin,
    ctcMax,
    columns,
  ]);

  const openEdit = (row: RowWithIndex) => {
    const form: Record<string, string> = {};
    columns.forEach((col) => {
      const v = row[col];
      form[col] = v !== undefined && v !== null ? String(v) : "";
    });
    setEditForm(form);
    setEditRow(row);
    setSaveError(null);
  };

  const closeEdit = () => {
    setEditRow(null);
    setEditForm({});
    setSaveError(null);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/sheet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: editRow.__index,
          updates: editForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to update sheet");
        return;
      }
      closeEdit();
      await fetchData();
    } catch (e) {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      <header className="bg-white/80 border-b border-orange-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div className="flex items-center gap-2">
              <Image
                src="/bitsom-logo.png"
                alt="BITSoM"
                width={32}
                height={32}
              />
              <span className="font-semibold text-slate-800">
                Admin – Student Data
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-orange-300 text-orange-700"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-1 p-1 bg-white/80 rounded-lg border border-orange-200 shadow-inner w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-orange-500 text-white shadow"
                : "text-slate-600 hover:bg-orange-50 hover:text-slate-800"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("records")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "records"
                ? "bg-orange-500 text-white shadow"
                : "text-slate-600 hover:bg-orange-50 hover:text-slate-800"
            }`}
          >
            <List className="h-4 w-4" />
            Individual records
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Key stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className="text-sm text-orange-100">Total Placed</CardTitle>
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-4xl text-white mb-1">{placementStats.totalPlaced}</div>
                  <p className="text-xs text-orange-100">
                    Campus: {placementStats.campusPlaced} • Off: {placementStats.offCampusPlaced}
                  </p>
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className="text-sm text-blue-100">PPO&apos;s</CardTitle>
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-4xl text-white mb-1">{placementStats.ppos}</div>
                  <p className="text-xs text-blue-100">Pre-Placement Offers</p>
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className="text-sm text-emerald-100">Average CTC</CardTitle>
                  <div className="p-2 bg-white/20 rounded-lg">
                    <IndianRupee className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-4xl text-white mb-1">
                    {placementStats.averageCTC} <span className="text-xl">LPA</span>
                  </div>
                  <p className="text-xs text-emerald-100">
                    Range: {placementStats.lowestCTC} – {placementStats.highestCTC} LPA
                  </p>
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className="text-sm text-purple-100">Highest CTC</CardTitle>
                  <div className="p-2 bg-white/20 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-4xl text-white mb-1">
                    {placementStats.highestCTC} <span className="text-xl">LPA</span>
                  </div>
                  <p className="text-xs text-purple-100">Top package</p>
                </CardContent>
              </Card>
            </div>

            {/* Placement breakdown + metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-white/90 border-orange-200 shadow-xl">
                <CardHeader className="border-b border-orange-100">
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-orange-600" />
                    Placement Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-slate-700">PPO&apos;s</span>
                      <Badge className="bg-blue-600">{placementStats.ppos}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-slate-700">Campus Placed</span>
                      <Badge className="bg-green-600">{placementStats.campusPlaced}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-slate-700">Off Campus Placed</span>
                      <Badge className="bg-emerald-600">{placementStats.offCampusPlaced}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <span className="text-slate-700">Total Placed</span>
                      <Badge className="bg-orange-600">{placementStats.totalPlaced}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/90 border-orange-200 shadow-xl">
                <CardHeader className="border-b border-orange-100">
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-orange-600" />
                    Additional Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <span className="text-slate-700">Total PPI&apos;s</span>
                      <Badge className="bg-yellow-600">{placementStats.totalPPIs}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                      <span className="text-slate-700">Total Unplaced</span>
                      <Badge variant="destructive">{placementStats.totalUnplaced}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Company-wise offers */}
            <Card className="bg-white/90 border-orange-200 shadow-xl">
              <CardHeader className="border-b border-orange-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-orange-600" />
                    Company-wise Offers
                  </CardTitle>
                  <Badge className="bg-orange-600">Total: {placementStats.totalPlaced}</Badge>
                </div>
                <div className="flex gap-3 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search companies..."
                      value={overviewSearch}
                      onChange={(e) => setOverviewSearch(e.target.value)}
                      className="pl-9 bg-white border-orange-200"
                    />
                  </div>
                  <Select value={overviewFilter} onValueChange={setOverviewFilter}>
                    <SelectTrigger className="w-[180px] bg-white border-orange-200">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All companies</SelectItem>
                      <SelectItem value="high">High (5+)</SelectItem>
                      <SelectItem value="medium">Medium (2–4)</SelectItem>
                      <SelectItem value="low">Single offer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader className="bg-orange-50/80 sticky top-0 z-10">
                      <TableRow className="border-orange-200">
                        <TableHead className="text-slate-700 pl-6">Company</TableHead>
                        <TableHead className="text-slate-700">Industry</TableHead>
                        <TableHead className="text-right text-slate-700">Offers</TableHead>
                        <TableHead className="text-right text-slate-700 pr-6">Avg CTC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                            Loading...
                          </TableCell>
                        </TableRow>
                      )}
                      {!loading && filteredCompanyOffers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                            No companies match the filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {!loading &&
                        filteredCompanyOffers.map((item, idx) => (
                          <TableRow key={idx} className="border-orange-100 hover:bg-orange-50/50">
                            <TableCell className="py-3 pl-6 font-medium text-slate-700">
                              {item.company}
                            </TableCell>
                            <TableCell className="py-3 text-slate-600">
                              {item.industry || "—"}
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <Badge
                                className={
                                  item.offers >= 10
                                    ? "bg-orange-600"
                                    : item.offers >= 5
                                      ? "bg-orange-500"
                                      : "bg-slate-500"
                                }
                              >
                                {item.offers}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 text-right pr-6">
                              {item.averageCTC > 0 ? (
                                <span className="font-medium text-slate-700">{item.averageCTC} LPA</span>
                              ) : (
                                <span className="text-slate-400">N/A</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "records" && (
        <Card className="bg-white/90 border-orange-200 shadow-xl">
          <CardHeader className="border-b border-orange-100">
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Building2 className="h-5 w-5 text-orange-600" />
              Individual placement records
            </CardTitle>
            <p className="text-sm text-slate-500">
              Filter and edit data. Changes are saved to the Google Sheet.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-sm font-medium">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search all columns..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-white border-orange-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-sm font-medium">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="bg-white border-orange-200">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s.toLowerCase()}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-sm font-medium">Company</Label>
                <Select value={filterCompany} onValueChange={setFilterCompany}>
                  <SelectTrigger className="bg-white border-orange-200">
                    <SelectValue placeholder="Company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All companies</SelectItem>
                    {companyOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {industryOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-slate-600 text-sm font-medium">Industry</Label>
                  <Select value={filterIndustry} onValueChange={setFilterIndustry}>
                    <SelectTrigger className="bg-white border-orange-200">
                      <SelectValue placeholder="Industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All industries</SelectItem>
                      {industryOptions.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-sm font-medium">CTC min (LPA)</Label>
                <Select value={ctcMin} onValueChange={setCtcMin}>
                  <SelectTrigger className="bg-white border-orange-200">
                    <SelectValue placeholder="CTC min (LPA)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {[0, 5, 10, 15, 20, 25, 30, 40, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}+ LPA
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-sm font-medium">CTC max (LPA)</Label>
                <Select value={ctcMax} onValueChange={setCtcMax}>
                  <SelectTrigger className="bg-white border-orange-200">
                    <SelectValue placeholder="CTC max (LPA)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {[10, 15, 20, 25, 30, 40, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Up to {n} LPA
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-auto">
              {loading && (
                <div className="p-8 text-center text-slate-500">
                  Loading...
                </div>
              )}
              {error && (
                <div className="p-8 text-center text-red-600">{error}</div>
              )}
              {!loading && !error && (
                <Table>
                  <TableHeader className="bg-orange-50/80 sticky top-0 z-10">
                    <TableRow className="border-orange-200">
                      {columns.map((col) => (
                        <TableHead
                          key={col}
                          className="text-slate-700 whitespace-nowrap"
                        >
                          {col}
                        </TableHead>
                      ))}
                      <TableHead className="w-[80px] text-slate-700">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow
                        key={row.__index}
                        className="border-orange-100 hover:bg-orange-50/50"
                      >
                        {columns.map((col) => (
                          <TableCell
                            key={col}
                            className="text-slate-700 py-2 whitespace-nowrap max-w-[200px] truncate"
                            title={String(row[col] ?? "")}
                          >
                            {String(row[col] ?? "")}
                          </TableCell>
                        ))}
                        <TableCell className="py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(row)}
                            className="text-orange-600 hover:text-orange-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
        )}

      </div>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit row (sheet row index: {editRow?.__index ?? ""})</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {editRow &&
              columns.map((col) => (
                <div key={col} className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-right">{col}</Label>
                  <Input
                    className="col-span-2"
                    value={editForm[col] ?? ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, [col]: e.target.value }))
                    }
                  />
                </div>
              ))}
            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {saving ? "Saving..." : "Save to sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
