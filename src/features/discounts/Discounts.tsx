import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Tag } from "lucide-react";
import {
  discountsApi,
  type DiscountCodePayload,
  type DiscountCodeRow,
  type DiscountScopeMode,
  type DiscountType,
  type PackageApplyMode,
} from "../../lib/api";
import { MultiSelectDropdown } from "../../shared/ui/MultiSelectDropdown";

const emptyForm = (): DiscountCodePayload => ({
  code: "",
  name: "",
  description: "",
  status: "draft",
  discount_type: "percentage",
  percent_value: 10,
  fixed_amount_paise: null,
  max_discount_paise: null,
  hard_ceiling_paise: null,
  min_bill_paise: null,
  combine_with_others: false,
  auto_apply: false,
  audience: "everyone",
  first_purchase_only: false,
  scope_mode: "general",
  scope_keys: [],
  package_apply_mode: "all",
  package_ids: [],
  include_addons: true,
  cities: [],
  valid_from: null,
  valid_to: null,
  max_total_uses: null,
  max_uses_per_user: 1,
  per_user_frequency: "none",
  max_total_discount_paise: null,
  code_kind: "shared",
  min_price_protection: true,
});

function rupeesToPaise(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function paiseToRupees(v: number | null | undefined): string {
  if (v == null) return "";
  return String(v / 100);
}

export function Discounts() {
  const [items, setItems] = useState<DiscountCodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DiscountCodePayload>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [abuseEvents, setAbuseEvents] = useState(0);

  const [orgOptions, setOrgOptions] = useState<{ id: string; label: string }[]>([]);
  const [campOptions, setCampOptions] = useState<{ id: string; label: string }[]>([]);
  const [engagementOptions, setEngagementOptions] = useState<{ id: string; label: string }[]>([]);
  const [packageOptions, setPackageOptions] = useState<{ id: string; label: string }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [packageForFilter, setPackageForFilter] = useState<"public" | "camp" | "">("");
  const [fixedRupees, setFixedRupees] = useState("");
  const [maxDiscountRupees, setMaxDiscountRupees] = useState("");
  const [minBillRupees, setMinBillRupees] = useState("");
  const [budgetRupees, setBudgetRupees] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, summaryRes] = await Promise.all([
        discountsApi.list({
          search: search || undefined,
          status: statusFilter || undefined,
          limit: 100,
        }),
        discountsApi.reportsSummary().catch(() => null),
      ]);
      setItems(listRes.data.data.items || []);
      setTotal(listRes.data.data.total || 0);
      if (summaryRes) setAbuseEvents(summaryRes.data.data.abuse_events_24h || 0);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load discounts");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadScopeOptions = useCallback(async (mode: DiscountScopeMode) => {
    setOptionsLoading(true);
    try {
      if (mode === "organization") {
        const res = await discountsApi.optionsOrganizations();
        setOrgOptions(
          (res.data.data || []).map((o) => ({ id: String(o.id), label: o.label }))
        );
      } else if (mode === "camp") {
        const res = await discountsApi.optionsCamps();
        setCampOptions(
          (res.data.data || []).map((o) => ({ id: String(o.id), label: o.label }))
        );
      } else if (mode === "engagement") {
        const res = await discountsApi.optionsEngagements();
        setEngagementOptions(
          (res.data.data || []).map((o) => ({ id: String(o.id), label: o.label }))
        );
      }
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadPackages = useCallback(async (packageFor?: string) => {
    setOptionsLoading(true);
    try {
      const res = await discountsApi.optionsPackages({
        package_for: packageFor || undefined,
      });
      setPackageOptions(
        (res.data.data || []).map((o) => ({
          id: String(o.id),
          label: `${o.label}${o.price != null ? ` (₹${o.price})` : ""}`,
        }))
      );
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showForm) return;
    if (form.scope_mode !== "general") void loadScopeOptions(form.scope_mode);
    void loadPackages(packageForFilter || undefined);
  }, [showForm, form.scope_mode, packageForFilter, loadScopeOptions, loadPackages]);

  const scopeOptions = useMemo(() => {
    if (form.scope_mode === "organization") return orgOptions;
    if (form.scope_mode === "camp") return campOptions;
    if (form.scope_mode === "engagement") return engagementOptions;
    return [];
  }, [form.scope_mode, orgOptions, campOptions, engagementOptions]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFixedRupees("");
    setMaxDiscountRupees("");
    setMinBillRupees("");
    setBudgetRupees("");
    setShowForm(true);
  };

  const openEdit = (row: DiscountCodeRow) => {
    setEditingId(row.discount_code_id);
    setForm({
      ...emptyForm(),
      ...row,
      scope_keys: row.scope_keys || [],
      package_ids: row.package_ids || [],
      cities: row.cities || [],
    });
    setFixedRupees(paiseToRupees(row.fixed_amount_paise));
    setMaxDiscountRupees(paiseToRupees(row.max_discount_paise));
    setMinBillRupees(paiseToRupees(row.min_bill_paise));
    setBudgetRupees(paiseToRupees(row.max_total_discount_paise));
    setShowForm(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: DiscountCodePayload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        fixed_amount_paise:
          form.discount_type === "fixed" ? rupeesToPaise(fixedRupees) : null,
        max_discount_paise:
          form.discount_type === "percentage_capped" || maxDiscountRupees
            ? rupeesToPaise(maxDiscountRupees)
            : null,
        min_bill_paise: minBillRupees ? rupeesToPaise(minBillRupees) : null,
        max_total_discount_paise: budgetRupees ? rupeesToPaise(budgetRupees) : null,
        scope_keys: form.scope_mode === "general" ? [] : form.scope_keys || [],
        package_ids:
          form.package_apply_mode === "all" ? [] : (form.package_ids || []).map(Number),
      };
      if (editingId) {
        const { code: _c, code_kind: _k, ...patch } = payload;
        await discountsApi.update(editingId, patch);
      } else {
        await discountsApi.create(payload);
      }
      setShowForm(false);
      await loadList();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (
    id: number,
    action: "activate" | "pause" | "disable" | "draft"
  ) => {
    try {
      await discountsApi.setStatus(id, action);
      await loadList();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Status update failed");
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 sm:text-xl">
            <Tag className="h-5 w-5" />
            Discount codes
          </h1>
          <p className="text-sm text-zinc-500">
            {total} codes · abuse events (24h): {abuseEvents}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New code
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or name"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {["draft", "active", "paused", "expired", "finished", "disabled"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">
              {editingId ? "Edit discount" : "Create discount"}
            </h2>
            <button
              type="button"
              className="text-sm text-zinc-500"
              onClick={() => setShowForm(false)}
            >
              Close
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Code</span>
              <input
                required
                disabled={!!editingId}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="HEALTH20"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-700">Applies to context</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {(["general", "organization", "camp", "engagement"] as DiscountScopeMode[]).map(
                (mode) => (
                  <label key={mode} className="flex items-center gap-1.5 capitalize">
                    <input
                      type="radio"
                      name="scope_mode"
                      checked={form.scope_mode === mode}
                      onChange={() =>
                        setForm({ ...form, scope_mode: mode, scope_keys: [] })
                      }
                    />
                    {mode}
                  </label>
                )
              )}
            </div>
            {form.scope_mode !== "general" && (
              <MultiSelectDropdown
                options={scopeOptions}
                value={form.scope_keys || []}
                onChange={(scope_keys) => setForm({ ...form, scope_keys })}
                placeholder={`Select ${form.scope_mode}(s)`}
                loading={optionsLoading}
              />
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-700">Packages</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {(["all", "include", "exclude"] as PackageApplyMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="package_apply_mode"
                    checked={form.package_apply_mode === mode}
                    onChange={() =>
                      setForm({ ...form, package_apply_mode: mode, package_ids: [] })
                    }
                  />
                  {mode === "all"
                    ? "All packages"
                    : mode === "include"
                      ? "Selected only"
                      : "All except selected"}
                </label>
              ))}
            </div>
            {form.package_apply_mode !== "all" && (
              <>
                <select
                  value={packageForFilter}
                  onChange={(e) =>
                    setPackageForFilter(e.target.value as "public" | "camp" | "")
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All package_for</option>
                  <option value="public">public</option>
                  <option value="camp">camp</option>
                </select>
                <MultiSelectDropdown
                  options={packageOptions}
                  value={(form.package_ids || []).map(String)}
                  onChange={(ids) =>
                    setForm({ ...form, package_ids: ids.map((id) => Number(id)) })
                  }
                  placeholder="Select packages"
                  loading={optionsLoading}
                />
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.include_addons}
                onChange={(e) => setForm({ ...form, include_addons: e.target.checked })}
              />
              Include add-ons
            </label>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Type</span>
              <select
                value={form.discount_type}
                onChange={(e) =>
                  setForm({ ...form, discount_type: e.target.value as DiscountType })
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
                <option value="percentage_capped">Percentage capped</option>
              </select>
            </label>
            {(form.discount_type === "percentage" ||
              form.discount_type === "percentage_capped") && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Percent</span>
                <input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={form.percent_value ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, percent_value: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </label>
            )}
            {form.discount_type === "fixed" && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Amount (₹)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={fixedRupees}
                  onChange={(e) => setFixedRupees(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </label>
            )}
            {(form.discount_type === "percentage_capped" ||
              form.discount_type === "percentage") && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Max off (₹)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={maxDiscountRupees}
                  onChange={(e) => setMaxDiscountRupees(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </label>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Valid from</span>
              <input
                type="datetime-local"
                value={form.valid_from ? form.valid_from.slice(0, 16) : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    valid_from: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Valid to</span>
              <input
                type="datetime-local"
                value={form.valid_to ? form.valid_to.slice(0, 16) : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    valid_to: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Min bill (₹)</span>
              <input
                type="number"
                min={0}
                value={minBillRupees}
                onChange={(e) => setMinBillRupees(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Max total uses</span>
              <input
                type="number"
                min={1}
                value={form.max_total_uses ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_total_uses: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Uses / person</span>
              <input
                type="number"
                min={1}
                value={form.max_uses_per_user ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_uses_per_user: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Frequency</span>
              <select
                value={form.per_user_frequency || "none"}
                onChange={(e) => setForm({ ...form, per_user_frequency: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="none">None</option>
                <option value="day">Once a day</option>
                <option value="week">Once a week</option>
                <option value="month">Once a month</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Money limit (₹)</span>
              <input
                type="number"
                min={0}
                value={budgetRupees}
                onChange={(e) => setBudgetRupees(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.auto_apply}
                onChange={(e) => setForm({ ...form, auto_apply: e.target.checked })}
              />
              Auto-apply
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.min_price_protection}
                onChange={(e) =>
                  setForm({ ...form, min_price_protection: e.target.checked })
                }
              />
              Min price protection
            </label>
            <label className="flex items-center gap-2">
              Code kind
              <select
                value={form.code_kind || "shared"}
                onChange={(e) => setForm({ ...form, code_kind: e.target.value })}
                className="rounded-md border border-zinc-300 px-2 py-1"
                disabled={!!editingId}
              >
                <option value="shared">Shared</option>
                <option value="unique_pool">Unique pool</option>
              </select>
            </label>
            {!editingId && (
              <label className="flex items-center gap-2">
                Initial status
                <select
                  value={form.status || "draft"}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Update" : "Create"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Scope</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No discount codes yet
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.discount_code_id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 capitalize">{row.scope_mode}</td>
                  <td className="px-3 py-2">{row.discount_type}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-0.5 text-xs"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                      {row.status !== "active" && (
                        <button
                          type="button"
                          className="rounded border border-zinc-200 px-2 py-0.5 text-xs"
                          onClick={() => void setStatus(row.discount_code_id, "activate")}
                        >
                          Activate
                        </button>
                      )}
                      {row.status === "active" && (
                        <button
                          type="button"
                          className="rounded border border-zinc-200 px-2 py-0.5 text-xs"
                          onClick={() => void setStatus(row.discount_code_id, "pause")}
                        >
                          Pause
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-0.5 text-xs"
                        onClick={() => void setStatus(row.discount_code_id, "disable")}
                      >
                        Disable
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
