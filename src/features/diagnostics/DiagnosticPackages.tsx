import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  diagnosticPackagesApi,
  getApiError,
  type DiagnosticPackageCreate,
  type DiagnosticPackageListItem,
} from "../../lib/api";
import { DiagnosticFilters } from "./DiagnosticFilters";
import { DiagnosticPackageDrawer } from "./DiagnosticPackageDrawer";

type TabKey = "packages" | "filters";
type ModalMode = "add" | "edit";

const EMPTY_FORM: DiagnosticPackageCreate = {
  package_name: "",
  diagnostic_provider: "",
  collection_type: "",
  gender_suitability: "",
  no_of_tests: null,
  report_duration_hours: null,
  price: null,
  original_price: null,
  is_most_popular: false,
  about_text: "",
  bookings_count: null,
};

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function DiagnosticPackages() {
  const [activeTab, setActiveTab] = useState<TabKey>("packages");
  const [rows, setRows] = useState<DiagnosticPackageListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [editing, setEditing] = useState<DiagnosticPackageListItem | null>(null);
  const [form, setForm] = useState<DiagnosticPackageCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPackageId, setDrawerPackageId] = useState<number | null>(null);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticPackagesApi.list();
      setRows(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "packages") {
      void fetchPackages();
    }
  }, [activeTab, fetchPackages]);

  const filteredRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.package_name.localeCompare(b.package_name));
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((row) => row.package_name.toLowerCase().includes(q));
  }, [rows, search]);

  const openCreate = () => {
    setModalMode("add");
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: DiagnosticPackageListItem) => {
    setModalMode("edit");
    setEditing(row);
    setForm({
      package_name: row.package_name,
      diagnostic_provider: row.diagnostic_provider ?? "",
      collection_type: row.collection_type ?? "",
      gender_suitability: row.gender_suitability ?? "",
      no_of_tests: row.no_of_tests ?? null,
      report_duration_hours: row.report_duration_hours ?? null,
      price: row.price ?? null,
      original_price: row.original_price ?? null,
      is_most_popular: !!row.is_most_popular,
      about_text: "",
      bookings_count: null,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openDrawer = (row: DiagnosticPackageListItem) => {
    setDrawerPackageId(row.diagnostic_package_id);
    setDrawerOpen(true);
  };

  const toggleStatus = async (row: DiagnosticPackageListItem) => {
    const next = (row.status ?? "active").toLowerCase() === "active" ? "inactive" : "active";
    try {
      await diagnosticPackagesApi.updateStatus(row.diagnostic_package_id, next);
      await fetchPackages();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleSubmit = async () => {
    if (!form.package_name.trim()) {
      setFormError("Package name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: DiagnosticPackageCreate = {
        package_name: form.package_name.trim(),
        diagnostic_provider: form.diagnostic_provider?.trim() || null,
        collection_type: form.collection_type?.trim() || null,
        gender_suitability: form.gender_suitability?.trim() || null,
        no_of_tests: form.no_of_tests ?? null,
        report_duration_hours: form.report_duration_hours ?? null,
        price: form.price ?? null,
        original_price: form.original_price ?? null,
        is_most_popular: !!form.is_most_popular,
        about_text: form.about_text?.trim() || null,
        bookings_count: form.bookings_count ?? null,
      };
      if (modalMode === "add") {
        await diagnosticPackagesApi.create(payload);
      } else if (editing) {
        await diagnosticPackagesApi.update(editing.diagnostic_package_id, payload);
      }
      setModalOpen(false);
      await fetchPackages();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<DiagnosticPackageListItem>[] = [
    {
      key: "package_name",
      label: "Package name",
      render: (row) => <span className="font-medium text-zinc-900">{row.package_name}</span>,
    },
    { key: "diagnostic_provider", label: "Provider", render: (row) => row.diagnostic_provider ?? "—", hideOnMobile: true },
    { key: "no_of_tests", label: "Tests", render: (row) => row.no_of_tests ?? "—", hideOnMobile: true },
    {
      key: "price",
      label: "Price",
      render: (row) => (row.price != null ? `₹${row.price}` : "—"),
    },
    {
      key: "discount_percent",
      label: "Discount",
      render: (row) =>
        row.discount_percent != null ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            {row.discount_percent}% OFF
          </span>
        ) : (
          "—"
        ),
      hideOnTablet: true,
    },
    {
      key: "gender_suitability",
      label: "Gender",
      render: (row) =>
        row.gender_suitability ? (
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
            {row.gender_suitability}
          </span>
        ) : (
          "—"
        ),
      hideOnTablet: true,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void toggleStatus(row);
          }}
          className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${
            (row.status ?? "").toLowerCase() === "active"
              ? "bg-green-50 text-green-700"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {(row.status ?? "").toLowerCase() === "active" ? "Active" : "Inactive"}
        </button>
      ),
    },
    { key: "collection_type", label: "Collection", render: (row) => row.collection_type ?? "—", hideOnTablet: true },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Diagnostics</h1>
        {activeTab === "packages" && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4" />
            Add Package
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab("packages")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "packages"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Packages
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("filters")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "filters"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Filters
        </button>
      </div>

      {activeTab === "packages" ? (
        <div>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

          <div className="mb-4">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
                placeholder="Search package name..."
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {loading ? (
              <div className="py-14 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={filteredRows}
                keyExtractor={(row) => row.diagnostic_package_id}
                onView={openDrawer}
                onEdit={openEdit}
                firstColumnClickableView
              />
            )}
          </div>
        </div>
      ) : (
        <DiagnosticFilters embedded />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "add" ? "Add Package" : "Edit Package"}
        maxWidthClassName="max-w-2xl"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          {formError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Package name *</label>
              <input
                type="text"
                value={form.package_name}
                onChange={(e) => setForm((prev) => ({ ...prev, package_name: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Provider</label>
              <input
                type="text"
                value={form.diagnostic_provider ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, diagnostic_provider: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Collection type</label>
              <select
                value={form.collection_type ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, collection_type: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Select</option>
                <option value="home_collection">home_collection</option>
                <option value="centre_visit">centre_visit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Gender suitability</label>
              <select
                value={form.gender_suitability ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, gender_suitability: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Select</option>
                <option value="male">male</option>
                <option value="female">female</option>
                <option value="both">both</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">No. of tests</label>
              <input
                type="number"
                value={form.no_of_tests ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, no_of_tests: toNumberOrNull(e.target.value) }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Report duration hours</label>
              <input
                type="number"
                value={form.report_duration_hours ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, report_duration_hours: toNumberOrNull(e.target.value) }))
                }
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Price</label>
              <input
                type="number"
                value={form.price ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, price: toNumberOrNull(e.target.value) }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Original price</label>
              <input
                type="number"
                value={form.original_price ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, original_price: toNumberOrNull(e.target.value) }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Bookings count</label>
              <input
                type="number"
                value={form.bookings_count ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, bookings_count: toNumberOrNull(e.target.value) }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!form.is_most_popular}
                onChange={(e) => setForm((prev) => ({ ...prev, is_most_popular: e.target.checked }))}
              />
              Most popular
            </label>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">About</label>
              <textarea
                value={form.about_text ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, about_text: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-24 focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create Package" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <DiagnosticPackageDrawer
        open={drawerOpen}
        packageId={drawerPackageId}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => void fetchPackages()}
      />
    </div>
  );
}
