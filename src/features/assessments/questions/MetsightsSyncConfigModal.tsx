import { useEffect, useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import {
  questionnaireQuestionsApi,
  type MetsightsSyncConfig,
  type QuestionnaireQuestion,
  getApiError,
} from "../../../lib/api";
import {
  PULL_STRATEGIES,
  PUSH_STRATEGIES,
  STRATEGY_HAS_JSON_PARAMS,
  ToggleSwitch,
} from "./questionUi";

interface MetsightsSyncConfigModalProps {
  open: boolean;
  onClose: () => void;
  question: QuestionnaireQuestion | null;
  onSaved: (updated: QuestionnaireQuestion) => void;
}

export function MetsightsSyncConfigModal({
  open,
  onClose,
  question,
  onSaved,
}: MetsightsSyncConfigModalProps) {
  const [syncConfig, setSyncConfig] = useState<MetsightsSyncConfig>({});
  const [syncPullParamsJson, setSyncPullParamsJson] = useState("");
  const [syncPushParamsJson, setSyncPushParamsJson] = useState("");
  const [syncSaving, setSyncSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !question) return;
    const config = question.metsights_sync ?? {};
    setSyncConfig(config);
    setSyncError(null);
    const { pull, push } = config;
    const pullExtra = pull ? { ...pull } : {};
    delete pullExtra.enabled;
    delete pullExtra.strategy;
    setSyncPullParamsJson(Object.keys(pullExtra).length > 0 ? JSON.stringify(pullExtra, null, 2) : "");
    const pushExtra = push ? { ...push } : {};
    delete pushExtra.enabled;
    delete pushExtra.strategy;
    setSyncPushParamsJson(Object.keys(pushExtra).length > 0 ? JSON.stringify(pushExtra, null, 2) : "");
  }, [open, question]);

  const updateSyncPull = (patch: Record<string, unknown>) => {
    setSyncConfig((prev) => ({
      ...prev,
      pull: { ...prev.pull, ...patch },
    }));
  };

  const updateSyncPush = (patch: Record<string, unknown>) => {
    setSyncConfig((prev) => ({
      ...prev,
      push: { ...prev.push, ...patch },
    }));
  };

  const handleSave = async () => {
    if (!question) return;
    setSyncSaving(true);
    setSyncError(null);
    try {
      let pullParams: Record<string, unknown> = {};
      if (syncPullParamsJson.trim()) {
        try {
          pullParams = JSON.parse(syncPullParamsJson);
        } catch {
          throw new Error("Pull params: invalid JSON");
        }
      }
      let pushParams: Record<string, unknown> = {};
      if (syncPushParamsJson.trim()) {
        try {
          pushParams = JSON.parse(syncPushParamsJson);
        } catch {
          throw new Error("Push params: invalid JSON");
        }
      }
      const finalConfig: MetsightsSyncConfig = {
        pull: {
          enabled: syncConfig.pull?.enabled ?? false,
          strategy: syncConfig.pull?.strategy ?? "",
          ...pullParams,
        },
        push: {
          enabled: syncConfig.push?.enabled ?? false,
          strategy: syncConfig.push?.strategy ?? "",
          ...pushParams,
        },
      };
      const res = await questionnaireQuestionsApi.updateMetsightsSync(question.question_id, finalConfig);
      onSaved(res.data.data);
      onClose();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : getApiError(error));
    } finally {
      setSyncSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Configure Metsights Sync" maxWidthClassName="max-w-2xl">
      <div className="space-y-5">
        {syncError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{syncError}</div>
        )}

        <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Pull Configuration</h3>
            <ToggleSwitch
              enabled={!!syncConfig.pull?.enabled}
              onToggle={() => updateSyncPull({ enabled: !syncConfig.pull?.enabled })}
              ariaLabel="Toggle pull sync"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-600 mb-1">Strategy</label>
            <select
              value={syncConfig.pull?.strategy ?? ""}
              onChange={(e) => {
                updateSyncPull({ strategy: e.target.value, enabled: false });
                setSyncPullParamsJson("");
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            >
              <option value="">Select strategy</option>
              {PULL_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {syncConfig.pull?.strategy && STRATEGY_HAS_JSON_PARAMS.has(syncConfig.pull.strategy) && (
            <div>
              <label className="block text-xs text-zinc-600 mb-1">Additional params (JSON)</label>
              <textarea
                value={syncPullParamsJson}
                onChange={(e) => {
                  setSyncPullParamsJson(e.target.value);
                  updateSyncPull({ enabled: false });
                }}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder={`e.g. {"unit_codes": ["kg"], "buckets": [...]}`}
              />
            </div>
          )}
        </div>

        <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Push Configuration</h3>
            <ToggleSwitch
              enabled={!!syncConfig.push?.enabled}
              onToggle={() => updateSyncPush({ enabled: !syncConfig.push?.enabled })}
              ariaLabel="Toggle push sync"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-600 mb-1">Strategy</label>
            <select
              value={syncConfig.push?.strategy ?? ""}
              onChange={(e) => {
                updateSyncPush({ strategy: e.target.value, enabled: false });
                setSyncPushParamsJson("");
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            >
              <option value="">Select strategy</option>
              {PUSH_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {syncConfig.push?.strategy && STRATEGY_HAS_JSON_PARAMS.has(syncConfig.push.strategy) && (
            <div>
              <label className="block text-xs text-zinc-600 mb-1">Additional params (JSON)</label>
              <textarea
                value={syncPushParamsJson}
                onChange={(e) => {
                  setSyncPushParamsJson(e.target.value);
                  updateSyncPush({ enabled: false });
                }}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder={`e.g. {"choice_map": {...}, "bucket_map": {...}}`}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={syncSaving}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {syncSaving ? "Saving..." : "Save Sync Config"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
