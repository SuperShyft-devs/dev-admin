import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { usePageHeader } from "../../layouts/PageHeaderActions";
import { Modal } from "../../shared/ui/Modal";
import {
  diagnosticTestGroupsApi,
  getApiError,
  uploadsApi,
  type DiagnosticTestGroupStandalone,
} from "../../lib/api";
import { DiagnosticTestGroupFormFields } from "./DiagnosticTestGroupFormFields";
import {
  buildJoinGroupMemberLines,
  buildTestGroupPayload,
  EMPTY_TEST_GROUP_FORM,
  resolveGroupDefaultTestGroupId,
  testGroupToForm,
  type TestGroupFormState,
} from "./diagnosticTestGroupFormData";
import { DIAGNOSTICS_TEST_GROUPS_LIST } from "./diagnosticsCatalogPaths";
import { TestGroupProviderSwitcher } from "./TestGroupProviderSwitcher";
import { diagnosticProviderDisplayLabel } from "./providerParameterKeys";

type FormPageMode = "add" | "edit";

const LIST_BACK = DIAGNOSTICS_TEST_GROUPS_LIST;

function parseGroupId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseJoinDefaultId(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function DiagnosticTestGroupFormPage({ mode }: { mode: FormPageMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { groupId: groupIdParam } = useParams<{ groupId: string }>();
  const groupId = mode === "edit" ? parseGroupId(groupIdParam) : null;
  const joinDefaultId = mode === "add" ? parseJoinDefaultId(searchParams.get("join_default_id")) : null;

  const [loading, setLoading] = useState(mode === "edit" || joinDefaultId != null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TestGroupFormState>({ ...EMPTY_TEST_GROUP_FORM });
  const [groupKeyManuallyEdited, setGroupKeyManuallyEdited] = useState(mode === "edit");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinParentName, setJoinParentName] = useState<string | null>(null);
  const [joinDefaultGroupId, setJoinDefaultGroupId] = useState<number | null>(null);
  const [joinGroupMembers, setJoinGroupMembers] = useState<
    ReturnType<typeof buildJoinGroupMemberLines>
  >([]);
  const [copyTestsChoiceOpen, setCopyTestsChoiceOpen] = useState(false);
  const [editDetail, setEditDetail] = useState<DiagnosticTestGroupStandalone | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  const backTo = useMemo(() => {
    if (mode === "add" && joinDefaultId) return `/diagnostics/test-groups/${joinDefaultId}`;
    if (mode === "edit" && groupId) return `/diagnostics/test-groups/${groupId}`;
    return LIST_BACK;
  }, [mode, groupId, joinDefaultId]);

  const headerConfig = useMemo(() => {
    if (mode === "add" && joinDefaultId) {
      return {
        title: "Add test group variant",
        subtitle: joinParentName ? `Same profile as ${joinParentName}` : "Same profile as existing group",
        backTo,
      };
    }
    if (mode === "add") {
      return { title: "New test group", subtitle: "Create catalog test group", backTo: LIST_BACK };
    }
    return {
      title: groupName ? `Edit · ${groupName}` : "Edit test group",
      subtitle: groupId ? `Group #${groupId}` : undefined,
      backTo,
    };
  }, [mode, groupName, groupId, backTo, joinDefaultId, joinParentName]);

  usePageHeader(headerConfig);

  const loadJoinParent = useCallback(async () => {
    if (!joinDefaultId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestGroupsApi.get(joinDefaultId);
      const parent = res.data.data;
      setJoinParentName(parent.group_name);
      setJoinDefaultGroupId(resolveGroupDefaultTestGroupId(parent));
      setJoinGroupMembers(buildJoinGroupMemberLines(parent));
      setForm((prev) => ({
        ...prev,
        group_name: parent.group_name,
        package_for: (parent.package_for as "public" | "camp") ?? prev.package_for,
      }));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [joinDefaultId]);

  const loadForEdit = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestGroupsApi.get(groupId);
      const detail = res.data.data;
      setEditDetail(detail);
      setFormDirty(false);
      setGroupName(detail.group_name);
      setForm(testGroupToForm(detail));
      setGroupKeyManuallyEdited(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (mode === "add" && joinDefaultId) void loadJoinParent();
  }, [mode, joinDefaultId, loadJoinParent]);

  useEffect(() => {
    if (mode === "edit") void loadForEdit();
  }, [mode, loadForEdit]);

  useEffect(() => {
    if (!groupId || mode !== "edit") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await diagnosticTestGroupsApi.getTests(groupId);
        const tests = res.data.data ?? [];
        let sum = 0;
        for (const t of tests) {
          if (t.original_price != null && Number.isFinite(t.original_price)) sum += t.original_price;
        }
        if (!cancelled && sum > 0) {
          setForm((f) => ({ ...f, original_price: String(sum) }));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, mode]);

  const handleImageUpload = async (file?: File) => {
    if (!file) return;
    setImageUploading(true);
    setFormError(null);
    try {
      const res = await uploadsApi.uploadPackageImage(file);
      setForm((prev) => ({ ...prev, test_group_image: res.data.data.url }));
      setFormDirty(true);
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setImageUploading(false);
    }
  };

  const executeCreate = async (copyTests: boolean) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = buildTestGroupPayload(form, "add", {
        sameAsGroupId: joinDefaultId,
        copyTestsFromGroupId: copyTests && joinDefaultGroupId != null ? joinDefaultGroupId : null,
      });
      const res = await diagnosticTestGroupsApi.create(payload);
      const id = res.data.data.group_id;
      setCopyTestsChoiceOpen(false);
      navigate(`/diagnostics/test-groups/${id}`);
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.group_name.trim()) {
      setFormError("Group name is required.");
      return;
    }
    if (mode === "add" && joinDefaultId) {
      setCopyTestsChoiceOpen(true);
      return;
    }
    const payload = buildTestGroupPayload(form, mode);
    if (!payload.group_key) {
      setFormError("Group key is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (mode === "add") {
        await executeCreate(false);
        return;
      }
      if (!groupId) return;
      await diagnosticTestGroupsApi.update(groupId, payload);
      navigate(`/diagnostics/test-groups/${groupId}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; packages?: Array<{ package_name: string }> };
        let message = data.message ?? getApiError(err);
        if (data.packages?.length) {
          message = `${message} (${data.packages.map((p) => p.package_name).join(", ")})`;
        }
        setFormError(message);
      } else {
        setFormError(getApiError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "edit" && !groupId) {
    return (
      <div className="p-6 text-sm text-zinc-600">
        Invalid group id.{" "}
        <Link to={LIST_BACK} className="underline">Back to list</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-700">
        {error}{" "}
        <Link to={backTo} className="underline">Go back</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full min-w-0 pb-24">
      {mode === "edit" && groupId && editDetail ? (
        <TestGroupProviderSwitcher
          currentGroupId={groupId}
          detail={editDetail}
          mode="edit"
          isDirty={formDirty}
          onSetDefaultComplete={() => void loadForEdit()}
          onGroupDeleted={() => void loadForEdit()}
          labCount={1 + (editDetail.same_test_groups?.length ?? 0)}
        />
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="space-y-4"
      >
        {formError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>
        )}
        {mode === "add" && joinDefaultId && joinParentName ? (
          <div className="text-sm text-zinc-700 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 space-y-2">
            <p>
              This variant will use the same profile group as{" "}
              <span className="font-medium text-zinc-900">{joinParentName}</span>.
            </p>
            {joinGroupMembers.length > 0 ? (
              <ul className="space-y-1">
                {joinGroupMembers.map((member) => (
                  <li key={member.group_id} className="text-xs text-zinc-600">
                    {diagnosticProviderDisplayLabel(member.diagnostic_provider)} · {member.group_name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <DiagnosticTestGroupFormFields
          form={form}
          setForm={(action) => {
            setFormDirty(true);
            setForm(action);
          }}
          groupKeyManuallyEdited={groupKeyManuallyEdited}
          setGroupKeyManuallyEdited={setGroupKeyManuallyEdited}
          imageUploading={imageUploading}
          onImageUpload={handleImageUpload}
        />
        <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-zinc-50/95 border-t border-zinc-200 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Saving..." : mode === "add" ? "Create test group" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>

      <Modal
        open={copyTestsChoiceOpen}
        onClose={() => !submitting && setCopyTestsChoiceOpen(false)}
        title="Copy tests from default variant?"
      >
        <p className="text-sm text-zinc-600 mb-4">
          Copy tests and filter chips from the default lab&apos;s variant, or start empty and configure later.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void executeCreate(true)}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium disabled:opacity-50"
          >
            Create with same tests
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void executeCreate(false)}
            className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium disabled:opacity-50"
          >
            Create without tests
          </button>
        </div>
      </Modal>
    </div>
  );
}
