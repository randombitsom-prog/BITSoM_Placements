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
  Briefcase,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
} from "lucide-react";

type RowWithIndex = SheetRow & { __index: number };

const normalizeNumber = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return NaN;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : NaN;
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
  const [industrySectionOpen, setIndustrySectionOpen] = useState(true);
  const [companyIndustry, setCompanyIndustry] = useState<Record<string, string>>({});
  const [industryBulkSaving, setIndustryBulkSaving] = useState(false);
  const [industryBulkMessage, setIndustryBulkMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [industryLookupLoading, setIndustryLookupLoading] = useState(false);
  const [industryLookupMessage, setIndustryLookupMessage] = useState<{
    type: "success" | "error";
    text: string;
    details?: Record<string, string>;
  } | null>(null);

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

  const companyToCurrentIndustry = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const c = String(r["Company"] ?? r["company"] ?? "").trim();
      const i = String(r["Industry"] ?? r["industry"] ?? "").trim();
      if (c && !map.has(c) && i) map.set(c, i);
    });
    return Object.fromEntries(map);
  }, [rows]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const i = String(r["Industry"] ?? r["industry"] ?? "").trim();
      if (i) set.add(i);
    });
    return Array.from(set).sort();
  }, [rows]);

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

  const hasIndustryColumn = columns.some(
    (c) => (c || "").toLowerCase() === "industry"
  );

  const applyIndustryByCompany = async () => {
    const updates: Record<string, string> = {};
    companyOptions.forEach((company) => {
      const industry = (companyIndustry[company] ?? "").trim();
      if (industry) updates[company] = industry;
    });
    if (Object.keys(updates).length === 0) {
      setIndustryBulkMessage({
        type: "error",
        text: "Enter at least one industry to apply.",
      });
      return;
    }
    setIndustryBulkSaving(true);
    setIndustryBulkMessage(null);
    try {
      const res = await fetch("/api/admin/sheet/industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIndustryBulkMessage({
          type: "error",
          text: data.error || "Failed to update sheet",
        });
        return;
      }
      setIndustryBulkMessage({
        type: "success",
        text: data.message || `Updated ${data.updatedCount ?? 0} row(s).`,
      });
      await fetchData();
    } catch (e) {
      setIndustryBulkMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIndustryBulkSaving(false);
    }
  };

  const lookupIndustriesOnline = async () => {
    setIndustryLookupLoading(true);
    setIndustryLookupMessage(null);
    setIndustryBulkMessage(null);
    try {
      const res = await fetch("/api/admin/sheet/industry/lookup", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setIndustryLookupMessage({
          type: "error",
          text: data.error || "Lookup failed",
        });
        return;
      }
      setIndustryLookupMessage({
        type: "success",
        text: data.message || `Updated ${data.updatedCount ?? 0} row(s).`,
        details: data.updates,
      });
      await fetchData();
    } catch (e) {
      setIndustryLookupMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIndustryLookupLoading(false);
    }
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
        {hasIndustryColumn && (
          <Card className="bg-white/90 border-orange-200 shadow-xl">
            <CardHeader
              className="border-b border-orange-100 cursor-pointer hover:bg-orange-50/50 transition-colors"
              onClick={() => setIndustrySectionOpen((o) => !o)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Briefcase className="h-5 w-5 text-orange-600" />
                  Set industry by company (one-time bulk)
                </CardTitle>
                {industrySectionOpen ? (
                  <ChevronUp className="h-5 w-5 text-slate-500" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-500" />
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Set industry for each company once; all rows with that company
                will be updated in the sheet.
              </p>
            </CardHeader>
            {industrySectionOpen && (
              <CardContent className="pt-4">
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={lookupIndustriesOnline}
                      disabled={industryLookupLoading}
                      className="bg-slate-700 hover:bg-slate-800 text-white"
                    >
                      {industryLookupLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Looking up companies online…
                        </>
                      ) : (
                        <>
                          <Globe className="h-4 w-4 mr-2" />
                          Look up industries online and update sheet
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-slate-500">
                      Uses web search + AI to research each company and fill Industry once.
                    </span>
                  </div>
                  {industryLookupMessage && (
                    <div
                      className={
                        industryLookupMessage.type === "success"
                          ? "text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2"
                          : "text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
                      }
                    >
                      <p>{industryLookupMessage.text}</p>
                      {industryLookupMessage.details &&
                        Object.keys(industryLookupMessage.details).length > 0 && (
                          <p className="mt-2 text-xs opacity-90">
                            Mapped:{" "}
                            {Object.entries(industryLookupMessage.details)
                              .map(([c, i]) => `${c} → ${i}`)
                              .join("; ")}
                          </p>
                        )}
                    </div>
                  )}
                </div>

                <p className="text-sm text-slate-600 mb-3">
                  Or set industries manually below and apply:
                </p>
                {industryBulkMessage && (
                  <p
                    className={
                      industryBulkMessage.type === "success"
                        ? "text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-4"
                        : "text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4"
                    }
                  >
                    {industryBulkMessage.text}
                  </p>
                )}
                <div className="max-h-[300px] overflow-auto border border-orange-100 rounded-lg">
                  <Table>
                    <TableHeader className="bg-orange-50/80">
                      <TableRow className="border-orange-200">
                        <TableHead className="text-slate-700">Company</TableHead>
                        <TableHead className="text-slate-700">
                          Current industry
                        </TableHead>
                        <TableHead className="text-slate-700">
                          Set industry (applies to all rows)
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyOptions.map((company) => (
                        <TableRow
                          key={company}
                          className="border-orange-100 hover:bg-orange-50/30"
                        >
                          <TableCell className="font-medium text-slate-700">
                            {company}
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {companyToCurrentIndustry[company] || "—"}
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="e.g. Consulting, E-commerce"
                              value={companyIndustry[company] ?? ""}
                              onChange={(e) =>
                                setCompanyIndustry((prev) => ({
                                  ...prev,
                                  [company]: e.target.value,
                                }))
                              }
                              className="max-w-xs bg-white border-orange-200"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  onClick={applyIndustryByCompany}
                  disabled={industryBulkSaving}
                  className="mt-4 bg-orange-600 hover:bg-orange-700"
                >
                  {industryBulkSaving
                    ? "Updating sheet..."
                    : "Apply industry to sheet (all matching rows)"}
                </Button>
              </CardContent>
            )}
          </Card>
        )}

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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search all columns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white border-orange-200"
                />
              </div>
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
              {industryOptions.length > 0 && (
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
              )}
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
