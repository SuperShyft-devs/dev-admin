import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { fetchAllPages } from "../../lib/fetchAllPages";
import {
  campReportSectionsApi,
  getApiError,
  type CampReportSection,
} from "../../lib/api";

interface ManageReportSectionsModalProps {
  open: boolean;
  onClose: () => void;
}

type FormMode = "add" | "edit";

const EMPTY_FORM = {
  section: "",
  section_key: "",
  description: "",
};

export function ManageReportSectionsModal({ open, onClose }: ManageReportSectionsModalProps) {
  const [sections, setSections] = useState<CampReportSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [editing, setEditing] = useState<CampReportSection | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deletingSection, setDeletingSection] = useState<CampReportSection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllPages<CampReportSection>((page, limit) =>
        campReportSectionsApi.list({ page, limit })
      );
      setSections(rows);
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
    setDeletingSection(null);
    void fetchSections();
  }, [open, fetchSections]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.trim().toLowerCase();
    return sections.filter(
      (row) =>
        row.section.toLowerCase().includes(q) ||
        row.section_key.toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q)
    );
  }, [sections, search]);

  const openAdd = () => {
    setFormMode("add");
    setEditing(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: CampReportSection) => {
    setFormMode("edit");
    setEditing(row);
    setFormData({
      section: row.section,
      section_key: row.section_key,
      description: row.description ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.section.trim() || !formData.section_key.trim()) {
      setFormError("Section and section key are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        section: formData.section.trim(),
        section_key: formData.section_key.trim(),
        description: formData.description.trim() || null,
      };
      if (formMode === "add") {
        await campReportSectionsApi.create(payload);
      } else if (editing) {
        await campReportSectionsApi.update(editing.report_sections, payload);
      }
      setFormOpen(false);
      await fetchSections();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingSection) return;
    setDeleting(true);
    try {
      await campReportSectionsApi.delete(deletingSection.report_sections);
      setDeletingSection(null);
      await fetchSections();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Manage Report Sections" maxWidthClassName="max-w-4xl">
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              placeholder="Search by section, key, or description…"
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
            Add Section
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {loading && (
          <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm">Loading report sections…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-500">
            {sections.length === 0
              ? "No report sections yet. Add one to get started."
              : "No results match your search."}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600">Section</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600">Section Key</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600">Description</th>
                  <th className="px-3 sm:px-4 py-3 text-right font-medium text-zinc-600 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.report_sections} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800 font-medium">{row.section}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 font-mono text-xs">{row.section_key}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600">{row.description || "—"}</td>
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
                          onClick={() => setDeletingSection(row)}
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

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={formMode === "add" ? "Add Report Section" : "Edit Report Section"}
        maxWidthClassName="max-w-lg"
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Section</label>
            <input
              type="text"
              value={formData.section}
              onChange={(e) => setFormData((f) => ({ ...f, section: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Section Key</label>
            <input
              type="text"
              value={formData.section_key}
              onChange={(e) => setFormData((f) => ({ ...f, section_key: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {formMode === "add" ? "Add" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deletingSection}
        onClose={() => setDeletingSection(null)}
        title="Delete Report Section"
        maxWidthClassName="max-w-md"
      >
        <p className="text-sm text-zinc-600 mb-4">
          Delete section <span className="font-medium text-zinc-900">{deletingSection?.section}</span>?
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeletingSection(null)}
            className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </Modal>
    </>
  );
}
