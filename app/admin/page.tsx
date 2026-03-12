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
  BarChart3,
  List,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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
  const [filterYoe, setFilterYoe] = useState("all");
  const [ctcMin, setCtcMin] = useState("any");
  const [ctcMax, setCtcMax] = useState("any");
  const [editRow, setEditRow] = useState<RowWithIndex | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "records">("overview");
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewFilter, setOverviewFilter] = useState("all");
  const [overviewCompany, setOverviewCompany] = useState("all");
  const [overviewIndustry, setOverviewIndustry] = useState("all");
  const [overviewCtcMin, setOverviewCtcMin] = useState("any");
  const [overviewCtcMax, setOverviewCtcMax] = useState("any");
  const [breakdownFilter, setBreakdownFilter] = useState<
    "ppo" | "campus" | "off" | "total" | "ppi" | "unplaced" | null
  >(null);
  const [selectedIndustryFilter, setSelectedIndustryFilter] = useState<string | null>(null);

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

  const yoeColumn = useMemo(() => {
    return columns.find(
      (c) =>
        /^yoe$/i.test(c?.trim() ?? "") ||
        /years?\s*of\s*experience/i.test(c ?? "") ||
        /^years$/i.test(c?.trim() ?? "")
    ) ?? null;
  }, [columns]);

  const yoeOptions = useMemo(() => {
    if (!yoeColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = String(r[yoeColumn] ?? "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [rows, yoeColumn]);

  const displayColumns = useMemo(() => {
    return columns.filter((col) => {
      const trimmed = (col ?? "").trim();
      if (!trimmed) return false;
      if (/^col_\d+$/.test(trimmed)) return false;
      return true;
    });
  }, [columns]);

  const placementStats = useMemo(
    () => buildStatsFromRows(rows),
    [rows]
  );

  const nameColumn = useMemo(
    () =>
      columns.find(
        (c) =>
          /^name$/i.test(c?.trim() ?? "") ||
          /student\s*name/i.test(c ?? "") ||
          /name\s*of\s*student/i.test(c ?? "")
      ) ?? columns[0],
    [columns]
  );

  const { highestCtcRows, lowestCtcRows } = useMemo(() => {
    const high = placementStats.highestCTC;
    const low = placementStats.lowestCTC;
    const highest: RowWithIndex[] = [];
    const lowest: RowWithIndex[] = [];
    rows.forEach((row) => {
      const ctc = normalizeNumber(row["CTC"] ?? row["ctc"]);
      if (Number.isNaN(ctc)) return;
      if (ctc === high) highest.push(row);
      if (ctc === low) lowest.push(row);
    });
    return { highestCtcRows: highest, lowestCtcRows: lowest };
  }, [rows, placementStats.highestCTC, placementStats.lowestCTC]);

  const getRowLabel = (row: RowWithIndex) => {
    const name = nameColumn ? String(row[nameColumn] ?? "").trim() : "";
    const company = String(row["Company"] ?? row["company"] ?? "").trim();
    if (name && company) return `${name} (${company})`;
    if (name) return name;
    if (company) return company;
    return "—";
  };

  type IndustryStat = {
    industry: string;
    totalPlaced: number;
    avgCtc: number;
    medianCtc: number;
    minCtc: number;
    maxCtc: number;
  };

  const industryStats = useMemo((): IndustryStat[] => {
    const industryKey = columns.find(
      (c) => (c ?? "").toLowerCase() === "industry"
    ) ?? "Industry";
    const byIndustry = new Map<
      string,
      { count: number; ctcs: number[] }
    >();
    rows.forEach((row) => {
      const status = String(row["Status"] ?? row["status"] ?? "").toLowerCase();
      const isPlaced =
        status.includes("ppo") ||
        status.includes("campus") ||
        status.includes("off");
      if (!isPlaced) return;
      const industry = String(row[industryKey] ?? "").trim() || "—";
      const ctc = normalizeNumber(row["CTC"] ?? row["ctc"]);
      const entry = byIndustry.get(industry) ?? { count: 0, ctcs: [] };
      entry.count += 1;
      if (!Number.isNaN(ctc)) entry.ctcs.push(ctc);
      byIndustry.set(industry, entry);
    });
    return Array.from(byIndustry.entries())
      .map(([industry, { count, ctcs }]) => {
        const sorted = [...ctcs].sort((a, b) => a - b);
        const n = sorted.length;
        const medianCtc =
          n === 0
            ? 0
            : n % 2 === 1
              ? sorted[Math.floor(n / 2)]
              : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
        const avgCtc =
          n === 0 ? 0 : sorted.reduce((s, v) => s + v, 0) / n;
        const minCtc = n === 0 ? 0 : sorted[0];
        const maxCtc = n === 0 ? 0 : sorted[n - 1];
        return {
          industry,
          totalPlaced: count,
          avgCtc: parseFloat(avgCtc.toFixed(2)),
          medianCtc: parseFloat(medianCtc.toFixed(2)),
          minCtc,
          maxCtc,
        };
      })
      .sort((a, b) => b.totalPlaced - a.totalPlaced);
  }, [rows, columns]);

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
        if (overviewCompany && overviewCompany !== "all") {
          if (item.company !== overviewCompany) return false;
        }
        return true;
      })
      .filter((item) => {
        if (overviewFilter === "high") return item.offers >= 5;
        if (overviewFilter === "medium") return item.offers >= 2 && item.offers <= 4;
        if (overviewFilter === "low") return item.offers === 1;
        return true;
      })
      .filter((item) => {
        if (overviewIndustry && overviewIndustry !== "all") {
          if ((item.industry ?? "").trim().toLowerCase() !== overviewIndustry.toLowerCase())
            return false;
        }
        return true;
      })
      .filter((item) => {
        const avg = item.averageCTC;
        if (overviewCtcMin && overviewCtcMin !== "any") {
          const min = parseFloat(overviewCtcMin);
          if (!Number.isNaN(min) && avg < min) return false;
        }
        if (overviewCtcMax && overviewCtcMax !== "any") {
          const max = parseFloat(overviewCtcMax);
          if (!Number.isNaN(max) && avg > max) return false;
        }
        return true;
      });
  }, [companyOffers, overviewSearch, overviewCompany, overviewFilter, overviewIndustry, overviewCtcMin, overviewCtcMax]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const status = String(row["Status"] ?? row["status"] ?? "").toLowerCase();
      const company = String(row["Company"] ?? row["company"] ?? "").toLowerCase();
      const industry = String(
        row["Industry"] ?? row["industry"] ?? ""
      ).toLowerCase();
      const ctc = normalizeNumber(row["CTC"] ?? row["ctc"]);

      if (breakdownFilter) {
        const isPpo = status.includes("ppo");
        const isOff = status.includes("off");
        const isCampus = status.includes("campus") && !isPpo && !isOff;
        const isPlaced = isPpo || isOff || isCampus;
        const isPpi = status.includes("ppi");
        const isUnplaced =
          !status ||
          (!status.includes("ppo") && !status.includes("campus") && !status.includes("off"));
        if (breakdownFilter === "ppo" && !isPpo) return false;
        if (breakdownFilter === "off" && !isOff) return false;
        if (breakdownFilter === "campus" && !isCampus) return false;
        if (breakdownFilter === "total" && !isPlaced) return false;
        if (breakdownFilter === "ppi" && !isPpi) return false;
        if (breakdownFilter === "unplaced" && !isUnplaced) return false;
      }
      if (selectedIndustryFilter) {
        const rowIndustry = String(row["Industry"] ?? row["industry"] ?? "").trim();
        if (rowIndustry.toLowerCase() !== selectedIndustryFilter.toLowerCase()) return false;
      }

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
      if (filterYoe && filterYoe !== "all" && yoeColumn) {
        const rowYoe = String(row[yoeColumn] ?? "").trim().toLowerCase();
        if (rowYoe !== filterYoe.toLowerCase()) return false;
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
    breakdownFilter,
    selectedIndustryFilter,
    search,
    filterStatus,
    filterCompany,
    filterIndustry,
    filterYoe,
    yoeColumn,
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
    } catch {
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <button
                type="button"
                onClick={() => {
                  setBreakdownFilter("total");
                  setActiveTab("records");
                }}
                className="text-left cursor-pointer rounded-xl border-0 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2"
              >
                <Card className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-none h-full">
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
              </button>
              <button
                type="button"
                onClick={() => {
                  setBreakdownFilter("ppo");
                  setActiveTab("records");
                }}
                className="text-left cursor-pointer rounded-xl border-0 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2"
              >
                <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-none h-full">
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
              </button>
              <button
                type="button"
                onClick={() => {
                  setBreakdownFilter("total");
                  setActiveTab("records");
                }}
                className="text-left cursor-pointer rounded-xl border-0 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2"
              >
                <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-none h-full">
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
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setBreakdownFilter("total");
                      setActiveTab("records");
                    }}
                    className="text-left cursor-pointer rounded-xl border-0 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 w-full"
                  >
                    <Card className="relative overflow-hidden bg-gradient-to-br from-slate-500 to-slate-600 border-0 shadow-none h-full">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                        <CardTitle className="text-sm text-slate-200">Lowest CTC</CardTitle>
                        <div className="p-2 bg-white/20 rounded-lg">
                          <TrendingUp className="h-5 w-5 text-white rotate-180" />
                        </div>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-4xl text-white mb-1">
                          {placementStats.lowestCTC} <span className="text-xl">LPA</span>
                        </div>
                        <p className="text-xs text-slate-200">Lowest package</p>
                      </CardContent>
                    </Card>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium mb-1">Lowest CTC ({placementStats.lowestCTC} LPA):</p>
                  {lowestCtcRows.length === 0 ? (
                    <p className="text-muted-foreground">No data</p>
                  ) : (
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      {lowestCtcRows.map((row, i) => (
                        <li key={i}>{getRowLabel(row)}</li>
                      ))}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setBreakdownFilter("total");
                      setActiveTab("records");
                    }}
                    className="text-left cursor-pointer rounded-xl border-0 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-2 w-full"
                  >
                    <Card className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-none h-full">
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
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium mb-1">Highest CTC ({placementStats.highestCTC} LPA):</p>
                  {highestCtcRows.length === 0 ? (
                    <p className="text-muted-foreground">No data</p>
                  ) : (
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      {highestCtcRows.map((row, i) => (
                        <li key={i}>{getRowLabel(row)}</li>
                      ))}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Placement breakdown + metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-white/90 border-orange-200 shadow-xl">
                <CardHeader className="border-b border-orange-100">
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-orange-600" />
                    Placement Breakdown
                  </CardTitle>
                  <p className="text-sm text-slate-500 font-normal mt-1">
                    Click a category to view those students in Individual records.
                  </p>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFilter("ppo");
                        setActiveTab("records");
                      }}
                      className="w-full flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-slate-700">PPO&apos;s</span>
                      <Badge className="bg-blue-600">{placementStats.ppos}</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFilter("campus");
                        setActiveTab("records");
                      }}
                      className="w-full flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 hover:border-green-300 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-slate-700">Campus Placed</span>
                      <Badge className="bg-green-600">{placementStats.campusPlaced}</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFilter("off");
                        setActiveTab("records");
                      }}
                      className="w-full flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-slate-700">Off Campus Placed</span>
                      <Badge className="bg-emerald-600">{placementStats.offCampusPlaced}</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFilter("total");
                        setActiveTab("records");
                      }}
                      className="w-full flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 hover:border-orange-300 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-slate-700">Total Placed</span>
                      <Badge className="bg-orange-600">{placementStats.totalPlaced}</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFilter("ppi");
                        setActiveTab("records");
                      }}
                      className="w-full flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 hover:border-yellow-300 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-slate-700">Total PPI&apos;s</span>
                      <Badge className="bg-yellow-600">{placementStats.totalPPIs}</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownFilter("unplaced");
                        setActiveTab("records");
                      }}
                      className="w-full flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-slate-700">Total Unplaced</span>
                      <Badge variant="destructive">{placementStats.totalUnplaced}</Badge>
                    </button>
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
                <CardContent className="pt-6 space-y-6">
                  <h4 className="text-sm font-semibold text-slate-800">Stats by Industry</h4>
                  <p className="text-xs text-slate-500 -mt-2">
                    Click a segment or row to view those students in Individual records.
                  </p>
                  {industryStats.length > 0 ? (
                    <>
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={industryStats.map((s) => ({
                                name: s.industry || "—",
                                value: s.totalPlaced,
                              }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="value"
                              onClick={(data: { name?: string; value?: number }) => {
                                if (data?.name != null) {
                                  const industry = industryStats.find(
                                    (s) => (s.industry || "—") === data.name
                                  )?.industry ?? data.name;
                                  setSelectedIndustryFilter(industry === "—" ? null : industry);
                                  setActiveTab("records");
                                }
                              }}
                              style={{ cursor: "pointer" }}
                            >
                              {industryStats.map((s, idx) => {
                                const name = s.industry || "—";
                                const isSelected =
                                  selectedIndustryFilter != null &&
                                  name.toLowerCase() === selectedIndustryFilter.toLowerCase();
                                const COLORS = [
                                  "#ea580c",
                                  "#2563eb",
                                  "#16a34a",
                                  "#ca8a04",
                                  "#9333ea",
                                  "#0891b2",
                                  "#dc2626",
                                  "#64748b",
                                ];
                                return (
                                  <Cell
                                    key={idx}
                                    fill={COLORS[idx % COLORS.length]}
                                    opacity={isSelected ? 1 : 0.85}
                                    stroke={isSelected ? "#0f172a" : undefined}
                                    strokeWidth={isSelected ? 2 : 0}
                                  />
                                );
                              })}
                            </Pie>
                            <RechartsTooltip
                              formatter={(value: number, name: string) => {
                                const pct =
                                  placementStats.totalPlaced > 0
                                    ? ((value / placementStats.totalPlaced) * 100).toFixed(1)
                                    : "0";
                                return `${name}: ${value} placed (${pct}%)`;
                              }}
                              contentStyle={{ borderRadius: "8px", border: "1px solid #fed7aa" }}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="max-h-[320px] overflow-auto border border-orange-100 rounded-lg">
                        <Table>
                          <TableHeader className="bg-orange-50/80">
                            <TableRow className="border-orange-200">
                              <TableHead className="text-slate-700 text-xs">Industry</TableHead>
                              <TableHead className="text-right text-slate-700 text-xs">Placed</TableHead>
                              <TableHead className="text-right text-slate-700 text-xs">Avg CTC</TableHead>
                              <TableHead className="text-right text-slate-700 text-xs">Median CTC</TableHead>
                              <TableHead className="text-right text-slate-700 text-xs">Min CTC</TableHead>
                              <TableHead className="text-right text-slate-700 text-xs">Highest CTC</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {industryStats.map((s, idx) => {
                              const name = s.industry || "—";
                              const isSelected =
                                selectedIndustryFilter != null &&
                                name.toLowerCase() === selectedIndustryFilter.toLowerCase();
                              return (
                                <TableRow
                                  key={idx}
                                  className={`border-orange-100 cursor-pointer hover:bg-orange-50/70 ${
                                    isSelected ? "bg-orange-100" : ""
                                  }`}
                                  onClick={() => {
                                    setSelectedIndustryFilter(name === "—" ? null : s.industry);
                                    setActiveTab("records");
                                  }}
                                >
                                  <TableCell className="text-slate-700 font-medium text-sm py-2">
                                    {s.industry}
                                  </TableCell>
                                  <TableCell className="text-right text-slate-600 text-sm py-2">
                                    {s.totalPlaced}
                                  </TableCell>
                                  <TableCell className="text-right text-slate-600 text-sm py-2">
                                    {s.avgCtc > 0 ? `${s.avgCtc} LPA` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-slate-600 text-sm py-2">
                                    {s.medianCtc > 0 ? `${s.medianCtc} LPA` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-slate-600 text-sm py-2">
                                    {s.minCtc > 0 ? `${s.minCtc} LPA` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-slate-600 text-sm py-2">
                                    {s.maxCtc > 0 ? `${s.maxCtc} LPA` : "—"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 py-4">No industry data</p>
                  )}
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
                <div className="flex flex-wrap gap-3 mt-4">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search companies..."
                      value={overviewSearch}
                      onChange={(e) => setOverviewSearch(e.target.value)}
                      className="pl-9 bg-white border-orange-200"
                    />
                  </div>
                  <Select value={overviewCompany} onValueChange={setOverviewCompany}>
                    <SelectTrigger className="w-[200px] bg-white border-orange-200">
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
                  <Select value={overviewFilter} onValueChange={setOverviewFilter}>
                    <SelectTrigger className="w-[180px] bg-white border-orange-200">
                      <SelectValue placeholder="Offers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All companies</SelectItem>
                      <SelectItem value="high">High (5+)</SelectItem>
                      <SelectItem value="medium">Medium (2–4)</SelectItem>
                      <SelectItem value="low">Single offer</SelectItem>
                    </SelectContent>
                  </Select>
                  {industryOptions.length > 0 && (
                    <Select value={overviewIndustry} onValueChange={setOverviewIndustry}>
                      <SelectTrigger className="w-[200px] bg-white border-orange-200">
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
                  )}
                  <Select value={overviewCtcMin} onValueChange={setOverviewCtcMin}>
                    <SelectTrigger className="w-[140px] bg-white border-orange-200">
                      <SelectValue placeholder="CTC Min" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">CTC Min</SelectItem>
                      {[0, 5, 10, 15, 20, 25, 30, 40, 50].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}+ LPA
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={overviewCtcMax} onValueChange={setOverviewCtcMax}>
                    <SelectTrigger className="w-[140px] bg-white border-orange-200">
                      <SelectValue placeholder="CTC Max" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">CTC Max</SelectItem>
                      {[10, 15, 20, 25, 30, 40, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          Up to {n} LPA
                        </SelectItem>
                      ))}
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

            {breakdownFilter && (
              <div className="mt-4 flex items-center justify-between gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <span className="text-sm text-slate-700">
                  Showing only:{" "}
                  <strong>
                    {breakdownFilter === "ppo" && "PPO's"}
                    {breakdownFilter === "campus" && "Campus Placed"}
                    {breakdownFilter === "off" && "Off Campus Placed"}
                    {breakdownFilter === "total" && "Total Placed"}
                    {breakdownFilter === "ppi" && "Total PPI's"}
                    {breakdownFilter === "unplaced" && "Total Unplaced"}
                  </strong>{" "}
                  ({filteredRows.length} student{filteredRows.length !== 1 ? "s" : ""})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBreakdownFilter(null)}
                  className="border-orange-300 text-orange-700 hover:bg-orange-100"
                >
                  Show all records
                </Button>
              </div>
            )}
            {selectedIndustryFilter && (
              <div className="mt-4 flex items-center justify-between gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <span className="text-sm text-slate-700">
                  Showing only industry: <strong>{selectedIndustryFilter}</strong> ({filteredRows.length} student{filteredRows.length !== 1 ? "s" : ""})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIndustryFilter(null)}
                  className="border-orange-300 text-orange-700 hover:bg-orange-100"
                >
                  Show all records
                </Button>
              </div>
            )}

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
              {yoeOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-slate-600 text-sm font-medium">YoE</Label>
                  <Select value={filterYoe} onValueChange={setFilterYoe}>
                    <SelectTrigger className="bg-white border-orange-200">
                      <SelectValue placeholder="YoE" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All YoE</SelectItem>
                      {yoeOptions.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
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
            <div className="max-h-[70vh] overflow-auto px-6">
              {loading && (
                <div className="p-8 text-center text-slate-500">
                  Loading...
                </div>
              )}
              {error && (
                <div className="p-8 text-center text-red-600">{error}</div>
              )}
              {!loading && !error && (
                <div className="rounded-lg border border-orange-100 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-orange-50/80 sticky top-0 z-10">
                      <TableRow className="border-orange-200">
                        {displayColumns.map((col, idx) => (
                          <TableHead
                            key={col}
                            className={`text-slate-700 whitespace-nowrap ${idx === 0 ? "pl-4" : ""} ${idx === displayColumns.length - 1 ? "pr-4" : ""}`}
                          >
                            {col}
                          </TableHead>
                        ))}
                        <TableHead className="w-[80px] text-slate-700 pr-4">
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
                          {displayColumns.map((col, idx) => (
                            <TableCell
                              key={col}
                              className={`text-slate-700 py-2 whitespace-nowrap max-w-[200px] truncate ${idx === 0 ? "pl-4" : ""} ${idx === displayColumns.length - 1 ? "pr-4" : ""}`}
                              title={String(row[col] ?? "")}
                            >
                              {String(row[col] ?? "")}
                            </TableCell>
                          ))}
                          <TableCell className="py-2 pr-4">
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
                </div>
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
              displayColumns.map((col) => {
                const value = (editForm[col] ?? "").trim();
                const isStatus = (col ?? "").trim().toLowerCase() === "status";
                const isIndustry = (col ?? "").trim().toLowerCase() === "industry";
                const isYoe = yoeColumn != null && col === yoeColumn;
                const EMPTY_SELECT = "__empty__";
                if (isStatus) {
                  const options = [...new Set([...statusOptions, value].filter(Boolean))].sort();
                  return (
                    <div key={col} className="grid grid-cols-3 items-center gap-2">
                      <Label className="text-right">{col}</Label>
                      <Select
                        value={value || EMPTY_SELECT}
                        onValueChange={(v) =>
                          setEditForm((prev) => ({ ...prev, [col]: v === EMPTY_SELECT ? "" : v }))
                        }
                      >
                        <SelectTrigger className="col-span-2">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>—</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (isIndustry) {
                  const options = [...new Set([...industryOptions, value].filter(Boolean))].sort();
                  return (
                    <div key={col} className="grid grid-cols-3 items-center gap-2">
                      <Label className="text-right">{col}</Label>
                      <Select
                        value={value || EMPTY_SELECT}
                        onValueChange={(v) =>
                          setEditForm((prev) => ({ ...prev, [col]: v === EMPTY_SELECT ? "" : v }))
                        }
                      >
                        <SelectTrigger className="col-span-2">
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>—</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (isYoe) {
                  const options = [...new Set([...yoeOptions, value].filter(Boolean))].sort();
                  return (
                    <div key={col} className="grid grid-cols-3 items-center gap-2">
                      <Label className="text-right">{col}</Label>
                      <Select
                        value={value || EMPTY_SELECT}
                        onValueChange={(v) =>
                          setEditForm((prev) => ({ ...prev, [col]: v === EMPTY_SELECT ? "" : v }))
                        }
                      >
                        <SelectTrigger className="col-span-2">
                          <SelectValue placeholder="Select YoE" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>—</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                return (
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
                );
              })}
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
