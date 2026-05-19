import { useCallback, useRef, useState } from "react";
import Papa from "papaparse";
import { Loader2, Upload, X } from "lucide-react";
import { Modal } from "./Modal";
import { engagementsApi, getApiError } from "../../lib/api";

const BATCH_SIZE = 50;
const REQUIRED_HEADERS = ["id", "phone #"] as const;

export interface AssignParticipantsRow {
  metsights_record_id: string;
  phone: string;
}

export interface AssignParticipantsRowResult {
  metsights_record_id: string;
  phone: string;
  status: string;
  reason?: string | null;
  user_id?: number | null;
  assessment_instance_id?: number | null;
  newly_enrolled?: boolean | null;
}

interface AssignTotals {
  assigned: number;
  enrolled: number;
  skipped: number;
  failed: number;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function parseCsvRows(text: string): AssignParticipantsRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(first.message || "Failed to parse CSV");
  }

  const fields = parsed.meta.fields ?? [];
  const normalizedFields = new Set(fields.map(normalizeHeader));

  for (const required of REQUIRED_HEADERS) {
    if (!normalizedFields.has(required)) {
      throw new Error(`CSV is missing required column: ${required === "phone #" ? "Phone #" : "id"}`);
    }
  }

  const idKey = fields.find((f) => normalizeHeader(f) === "id")!;
  const phoneKey = fields.find((f) => normalizeHeader(f) === "phone #")!;

  const rows: AssignParticipantsRow[] = [];
  for (const record of parsed.data) {
    const metsights_record_id = (record[idKey] ?? "").trim();
    const phone = (record[phoneKey] ?? "").trim();
    if (!metsights_record_id && !phone) continue;
    rows.push({ metsights_record_id, phone });
  }

  if (rows.length === 0) {
    throw new Error("CSV has no data rows");
  }

  return rows;
}

interface AssignParticipantsFromCsvProps {
  engagementId: number;
  engagementName?: string | null;
  onComplete?: () => void;
}

export function AssignParticipantsFromCsv({
  engagementId,
  engagementName,
  onComplete,
}: AssignParticipantsFromCsvProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running" | "completed" | "cancelled" | "error">("idle");
  const [parseError, setParseError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [totals, setTotals] = useState<AssignTotals>({
    assigned: 0,
    enrolled: 0,
    skipped: 0,
    failed: 0,
  });
  const [lastResults, setLastResults] = useState<AssignParticipantsRowResult[]>([]);

  const accumulateResults = useCallback((results: AssignParticipantsRowResult[]) => {
    setLastResults((prev) => [...results, ...prev].slice(0, 20));
    setTotals((prev) => {
      let assigned = prev.assigned;
      let enrolled = prev.enrolled;
      let skipped = prev.skipped;
      let failed = prev.failed;
      for (const r of results) {
        if (r.status === "assigned") {
          assigned += 1;
          if (r.newly_enrolled) enrolled += 1;
        } else if (r.status === "skipped") {
          skipped += 1;
        } else if (r.status === "error") {
          failed += 1;
        }
      }
      return { assigned, enrolled, skipped, failed };
    });
  }, []);

  const runBatches = useCallback(
    async (rows: AssignParticipantsRow[]) => {
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      setProgressOpen(true);
      setPhase("running");
      setParseError(null);
      setRunError(null);
      setTotalRows(rows.length);
      setProcessedRows(0);
      setTotals({ assigned: 0, enrolled: 0, skipped: 0, failed: 0 });
      setLastResults([]);

      try {
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          if (signal.aborted) {
            setPhase("cancelled");
            return;
          }

          const chunk = rows.slice(i, i + BATCH_SIZE);
          const res = await engagementsApi.assignParticipantsBatch(engagementId, { rows: chunk }, { signal });
          const results = res.data.data.results ?? [];
          accumulateResults(results);
          setProcessedRows((prev) => prev + chunk.length);
        }

        setPhase("completed");
        onComplete?.();
      } catch (err) {
        if (signal.aborted) {
          setPhase("cancelled");
          return;
        }
        setRunError(getApiError(err));
        setPhase("error");
      }
    },
    [accumulateResults, engagementId, onComplete]
  );

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    setParseError(null);

    try {
      const text = await file.text();
      const rows = parseCsvRows(text);
      await runBatches(rows);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setPhase("cancelled");
  };

  const handleCloseProgress = () => {
    if (phase === "running") return;
    setProgressOpen(false);
    setPhase("idle");
  };

  const running = phase === "running";
  const progressPct = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => void handleFileChange(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={running}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium disabled:opacity-50"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Assign participants
      </button>
      {parseError && <p className="text-xs text-red-600 w-full">{parseError}</p>}

      <Modal
        open={progressOpen}
        onClose={handleCloseProgress}
        title={`Assign participants${engagementName ? ` — ${engagementName}` : ""}`}
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4 text-sm">
          {phase === "running" && (
            <div className="flex flex-col items-center gap-2 py-2 text-zinc-600">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              <p>
                Processing {processedRows} / {totalRows} rows ({progressPct}%)
              </p>
            </div>
          )}

          {(phase === "completed" || phase === "cancelled" || phase === "error") && (
            <p className="text-zinc-700">
              {phase === "completed" && "Import finished."}
              {phase === "cancelled" && "Import cancelled."}
              {phase === "error" && (runError || "Import failed.")}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-zinc-500">Assigned</dt>
              <dd className="font-medium">{totals.assigned}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Newly enrolled</dt>
              <dd className="font-medium">{totals.enrolled}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Skipped</dt>
              <dd className="font-medium">{totals.skipped}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Failed</dt>
              <dd className="font-medium">{totals.failed}</dd>
            </div>
          </dl>

          {lastResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-zinc-100 rounded-lg text-xs">
              <table className="w-full">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium text-zinc-500">Record</th>
                    <th className="text-left px-2 py-1 font-medium text-zinc-500">Status</th>
                    <th className="text-left px-2 py-1 font-medium text-zinc-500">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResults.map((r, idx) => (
                    <tr key={`${r.metsights_record_id}-${idx}`} className="border-t border-zinc-50">
                      <td className="px-2 py-1 font-mono truncate max-w-[100px]">{r.metsights_record_id}</td>
                      <td className="px-2 py-1">{r.status}</td>
                      <td className="px-2 py-1 text-zinc-500">{r.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {running ? (
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCloseProgress}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs hover:bg-zinc-800"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
