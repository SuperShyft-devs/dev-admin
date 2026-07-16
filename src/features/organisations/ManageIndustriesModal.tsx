import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  industriesApi,
  getApiError,
  type Industry,
} from "../../lib/api";

interface ManageIndustriesModalProps {
  open: boolean;
  onClose: () => void;
}

type FormMode = "add" | "edit";

const EMPTY_FORM = {
  industry: "",
};

export function ManageIndustriesModal({ open, onClose }: ManageIndustriesModalProps) {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [editing, setEditing] = useState<Industry | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deletingIndustry, setDeletingIndustry] = useState<Industry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchIndustries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await industriesApi.getAll();
      setIndustries(res.data.data);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setFormOpen(false);
    setDeletingIndustry(null);
    void fetchIndustries();
  }, [open, fetchIndustries]);

  const filtered = useMemo(() => {
    if (!search.trim()) return industries;
    const q = search.trim().toLowerCase();
    return industries.filter(
      (row) =>
        row.industry.toLowerCase().includes(q) ||
        row.industry_key.toLowerCase().includes(q)
    );
  }, [industries, search]);

  const openAdd = () => {
    setFormMode("add");
    setEditing(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: Industry) => {
    setFormMode("edit");
    setEditing(row);
    setFormData({
      industry: row.industry,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.industry.trim()) {
      setFormError("Industry name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === "add") {
        await industriesApi.create({ industry: formData.industry.trim() });
      } else if (formMode === "edit" && editing) {
        await industriesApi.update(editing.id, { industry: formData.industry.trim() });
      }
      setFormOpen(false);
      await fetchIndustries();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingIndustry) return;
    setDeleting(true);
    try {
      await industriesApi.delete(deletingIndustry.id);
      setDeletingIndustry(null);
      await fetchIndustries();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Manage Industries" maxWidthClassName="max-w-3xl">
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              placeholder="Search by name or key…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Industry
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {loading && (
          <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm">Loading industries…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-500">
            {industries.length === 0
              ? "No industries yet. Add one to get started."
              : "No results match your search."}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600">Industry Name</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600">Industry Key</th>
                  <th className="px-3 sm:px-4 py-3 text-right font-medium text-zinc-600 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800 font-medium">{row.industry}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 font-mono text-xs">{row.industry_key}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingIndustry(row)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Add / Edit Form Modal */}
      {formOpen && (
        <Modal
          open={formOpen}
          onClose={() => {
            if (!submitting) setFormOpen(false);
          }}
          title={formMode === "add" ? "Add Industry" : "Edit Industry"}
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                {formError}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Industry Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                placeholder="e.g. Information Technology"
                disabled={submitting}
                autoFocus
              />
              {formMode === "add" && (
                <p className="mt-1 text-xs text-zinc-500">
                  The industry key will be generated automatically.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100 mt-6">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {formMode === "add" ? "Add Industry" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingIndustry && (
        <Modal
          open={!!deletingIndustry}
          onClose={() => {
            if (!deleting) setDeletingIndustry(null);
          }}
          title="Delete Industry"
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Are you sure you want to delete <strong className="text-zinc-900">{deletingIndustry.industry}</strong>? 
              This action cannot be undone. It may fail if this industry is currently assigned to an organization.
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100 mt-6">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingIndustry(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Industry
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
