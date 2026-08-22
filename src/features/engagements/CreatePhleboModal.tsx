import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getApiError,
  onboardingAssistantsApi,
  type CreatePhleboExistingUser,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";

type CreatePhleboModalProps = {
  open: boolean;
  onClose: () => void;
  engagementId: number;
  onSuccess: () => void | Promise<void>;
};

function formatUserName(user: CreatePhleboExistingUser): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || `User ${user.user_id}`;
}

export function CreatePhleboModal({
  open,
  onClose,
  engagementId,
  onSuccess,
}: CreatePhleboModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<CreatePhleboExistingUser | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setPhone("");
      setSubmitting(false);
      setError(null);
      setPendingUser(null);
    }
  }, [open]);

  const submit = async (confirmExisting: boolean) => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError("First name and phone are required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await onboardingAssistantsApi.createPhlebo(engagementId, {
        name: trimmedName,
        phone: trimmedPhone,
        confirm_existing: confirmExisting,
      });
      const data = res.data.data;

      if (data.status === "confirmation_required") {
        setPendingUser(data.existing_user);
        return;
      }

      await onSuccess();
      onClose();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmExisting = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onboardingAssistantsApi.createPhlebo(engagementId, {
        name: name.trim(),
        phone: phone.trim(),
        confirm_existing: true,
      });
      await onSuccess();
      onClose();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Phlebo"
      maxWidthClassName="max-w-md"
      zIndexClassName="z-[60]"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Already a user. Add this phlebo to this engagement?
            </p>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-2">
              <p className="text-sm font-medium text-zinc-900">{formatUserName(pendingUser)}</p>
              <p className="text-sm text-zinc-600">{pendingUser.phone ?? "—"}</p>
              {pendingUser.employee?.role && (
                <p className="text-xs text-zinc-500">Role: {pendingUser.employee.role}</p>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => void handleConfirmExisting()}
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Adding…" : "OK"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingUser(null);
                  setError(null);
                }}
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
          >
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="phlebo-name">
                First Name *
              </label>
              <input
                id="phlebo-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                placeholder="First name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="phlebo-phone">
                Phone *
              </label>
              <input
                id="phlebo-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                placeholder="+91 9999999999"
                required
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Creating…" : "Create and Add"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
