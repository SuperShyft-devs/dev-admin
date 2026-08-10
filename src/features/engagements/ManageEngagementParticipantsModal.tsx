import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  engagementsApi,
  getApiError,
  participantsApi,
  type EngagementListItem,
  type Participant,
} from "../../lib/api";

const PAGE_LIMIT = 100;

function formatEngagementLabel(e: EngagementListItem): string {
  const name = (e.engagement_name ?? e.engagement_code ?? "").trim();
  const base = name || `Engagement #${e.engagement_id}`;
  return `${base} (#${e.engagement_id})`;
}

function formatEngagementSecondary(e: EngagementListItem): string | null {
  const parts = [e.engagement_code, e.city].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

function participantDisplayName(p: Participant): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.phone || p.email || `User #${p.user_id}`;
}

function matchesEngagementQuery(engagement: EngagementListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    engagement.engagement_name,
    engagement.engagement_code,
    engagement.city,
    String(engagement.engagement_id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

async function fetchAllEngagements(): Promise<EngagementListItem[]> {
  const all: EngagementListItem[] = [];
  let page = 1;
  let total = Infinity;

  while (all.length < total) {
    const res = await engagementsApi.list({
      page,
      limit: PAGE_LIMIT,
      sort_by: "engagement_id",
      sort_dir: "desc",
    });
    const chunk = res.data.data ?? [];
    total = Number(res.data.meta?.total ?? chunk.length);
    all.push(...chunk);
    if (chunk.length === 0) break;
    page += 1;
  }

  return all;
}

async function fetchAllParticipants(engagementId: number): Promise<Participant[]> {
  const all: Participant[] = [];
  let page = 1;
  let total = Infinity;

  while (all.length < total) {
    const res = await participantsApi.byEngagementId(engagementId, {
      page,
      limit: PAGE_LIMIT,
    });
    const chunk = res.data.data ?? [];
    total = Number(res.data.meta?.total ?? chunk.length);
    all.push(...chunk);
    if (chunk.length === 0) break;
    page += 1;
  }

  return all;
}

type ManageEngagementParticipantsModalProps = {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export function ManageEngagementParticipantsModal({
  open,
  onClose,
  onChanged,
}: ManageEngagementParticipantsModalProps) {
  const [sourceQuery, setSourceQuery] = useState("");
  const [allEngagements, setAllEngagements] = useState<EngagementListItem[]>([]);
  const [engagementsLoading, setEngagementsLoading] = useState(false);
  const [engagementsError, setEngagementsError] = useState<string | null>(null);
  const [sourceEngagement, setSourceEngagement] = useState<EngagementListItem | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  const [targetQuery, setTargetQuery] = useState("");
  const [targetEngagement, setTargetEngagement] = useState<EngagementListItem | null>(null);

  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [emptySourceEngagement, setEmptySourceEngagement] = useState<EngagementListItem | null>(null);

  const resetAll = useCallback(() => {
    setSourceQuery("");
    setAllEngagements([]);
    setEngagementsError(null);
    setSourceEngagement(null);
    setParticipants([]);
    setParticipantsError(null);
    setSelectedParticipant(null);
    setTargetQuery("");
    setTargetEngagement(null);
    setMoveConfirmOpen(false);
    setMoveError(null);
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setEmptySourceEngagement(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetAll();
      return;
    }

    let cancelled = false;
    setEngagementsLoading(true);
    setEngagementsError(null);
    void fetchAllEngagements()
      .then((rows) => {
        if (!cancelled) setAllEngagements(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setEngagementsError(getApiError(err));
          setAllEngagements([]);
        }
      })
      .finally(() => {
        if (!cancelled) setEngagementsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, resetAll]);

  const sourceOptions = useMemo(
    () => allEngagements.filter((e) => matchesEngagementQuery(e, sourceQuery)),
    [allEngagements, sourceQuery]
  );

  const targetOptions = useMemo(() => {
    if (!sourceEngagement) return [];
    return allEngagements.filter(
      (e) =>
        e.engagement_id !== sourceEngagement.engagement_id &&
        matchesEngagementQuery(e, targetQuery)
    );
  }, [allEngagements, sourceEngagement, targetQuery]);

  const loadParticipants = useCallback(async (engagementId: number) => {
    setParticipantsLoading(true);
    setParticipantsError(null);
    try {
      const rows = await fetchAllParticipants(engagementId);
      setParticipants(rows);
    } catch (err) {
      setParticipants([]);
      setParticipantsError(getApiError(err));
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  const handleSelectSource = (engagement: EngagementListItem) => {
    setSourceEngagement(engagement);
    setSelectedParticipant(null);
    setTargetEngagement(null);
    setTargetQuery("");
    setMoveConfirmOpen(false);
    setMoveError(null);
    void loadParticipants(engagement.engagement_id);
  };

  const handleSelectParticipant = (participant: Participant) => {
    setSelectedParticipant(participant);
    setTargetEngagement(null);
    setTargetQuery("");
    setMoveConfirmOpen(false);
    setMoveError(null);
  };

  const openMoveConfirm = () => {
    if (!sourceEngagement || !selectedParticipant || !targetEngagement || moving) return;
    setMoveError(null);
    setMoveConfirmOpen(true);
  };

  const closeMoveConfirm = () => {
    if (moving) return;
    setMoveConfirmOpen(false);
  };

  const handleConfirmMove = async () => {
    if (!sourceEngagement || !selectedParticipant || !targetEngagement) return;
    setMoving(true);
    setMoveError(null);
    try {
      const res = await participantsApi.moveToEngagement(
        sourceEngagement.engagement_id,
        selectedParticipant.user_id,
        targetEngagement.engagement_id
      );
      const remaining = res.data.data.source_remaining_participant_count;
      onChanged?.();

      setMoveConfirmOpen(false);
      setSelectedParticipant(null);
      setTargetEngagement(null);

      if (remaining === 0) {
        setEmptySourceEngagement(sourceEngagement);
        setDeleteConfirmOpen(true);
        setParticipants([]);
      } else {
        await loadParticipants(sourceEngagement.engagement_id);
      }
    } catch (err) {
      setMoveError(getApiError(err));
    } finally {
      setMoving(false);
    }
  };

  const handleDeleteEmptySource = async () => {
    if (!emptySourceEngagement) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await engagementsApi.delete(emptySourceEngagement.engagement_id);
      onChanged?.();
      setDeleteConfirmOpen(false);
      resetAll();
      onClose();
    } catch (err) {
      setDeleteError(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleKeepEmptySource = () => {
    setDeleteConfirmOpen(false);
    setEmptySourceEngagement(null);
    setDeleteError(null);
    void (sourceEngagement ? loadParticipants(sourceEngagement.engagement_id) : undefined);
  };

  const handleCloseAll = () => {
    resetAll();
    onClose();
  };

  const showTargetSection = !!selectedParticipant && !!sourceEngagement;
  const canMove = !!sourceEngagement && !!selectedParticipant && !!targetEngagement && !moving;

  return (
    <>
      <Modal
        open={open}
        onClose={handleCloseAll}
        title="Manage Engagement Participants"
        maxWidthClassName="max-w-6xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Select a source engagement, pick one participant, choose a target engagement, then move.
          </p>

          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <section className="flex-1 min-w-0 space-y-3 rounded-lg border border-zinc-200 p-3">
              <h3 className="text-sm font-medium text-zinc-900">1. Source engagement</h3>
              <label className="block">
                <span className="sr-only">Search engagements</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="search"
                    value={sourceQuery}
                    onChange={(e) => setSourceQuery(e.target.value)}
                    placeholder="Search by name or code…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </label>
              {engagementsError ? <p className="text-sm text-red-600">{engagementsError}</p> : null}
              <ul className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100">
                {engagementsLoading && allEngagements.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-zinc-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading engagements…
                  </li>
                ) : sourceOptions.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-zinc-500">No engagements found</li>
                ) : (
                  sourceOptions.map((engagement) => {
                    const secondary = formatEngagementSecondary(engagement);
                    const selected = sourceEngagement?.engagement_id === engagement.engagement_id;
                    return (
                      <li key={engagement.engagement_id}>
                        <button
                          type="button"
                          onClick={() => handleSelectSource(engagement)}
                          className={`w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${
                            selected ? "bg-zinc-50 ring-1 ring-inset ring-zinc-300" : ""
                          }`}
                        >
                          <div className="text-sm text-zinc-900">{formatEngagementLabel(engagement)}</div>
                          {secondary ? (
                            <div className="text-xs text-zinc-500 truncate">{secondary}</div>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>

            <section className="flex-1 min-w-0 space-y-3 rounded-lg border border-zinc-200 p-3">
              <h3 className="text-sm font-medium text-zinc-900">
                2. Participants
                {sourceEngagement ? (
                  <span className="font-normal text-zinc-500">
                    {" "}
                    — {formatEngagementLabel(sourceEngagement)}
                  </span>
                ) : null}
              </h3>
              {!sourceEngagement ? (
                <p className="text-sm text-zinc-500 py-8 text-center">
                  Select a source engagement to list participants.
                </p>
              ) : (
                <>
                  {participantsError ? <p className="text-sm text-red-600">{participantsError}</p> : null}
                  <ul className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100">
                    {participantsLoading ? (
                      <li className="px-3 py-4 text-sm text-zinc-500 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading participants…
                      </li>
                    ) : participants.length === 0 ? (
                      <li className="px-3 py-4 text-sm text-zinc-500">No participants in this engagement</li>
                    ) : (
                      participants.map((participant) => {
                        const selected = selectedParticipant?.user_id === participant.user_id;
                        return (
                          <li key={`${participant.user_id}-${participant.engagement_participant_id ?? ""}`}>
                            <button
                              type="button"
                              onClick={() => handleSelectParticipant(participant)}
                              className={`w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${
                                selected ? "bg-zinc-50 ring-1 ring-inset ring-zinc-300" : ""
                              }`}
                            >
                              <div className="text-sm text-zinc-900">
                                {participantDisplayName(participant)}
                              </div>
                              <div className="text-xs text-zinc-500 truncate">
                                {[participant.phone, participant.email].filter(Boolean).join(" · ") ||
                                  `User #${participant.user_id}`}
                              </div>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </>
              )}
            </section>

            <div className="flex lg:flex-col items-center justify-center gap-2 shrink-0 py-2">
              <button
                type="button"
                disabled={!canMove}
                onClick={openMoveConfirm}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Move participant to selected engagement"
                title="Move participant"
              >
                <ArrowRight className="w-4 h-4 lg:rotate-0 rotate-90" />
              </button>
            </div>

            <section className="flex-1 min-w-0 space-y-3 rounded-lg border border-zinc-200 p-3">
              <h3 className="text-sm font-medium text-zinc-900">3. Target engagement</h3>
              {!showTargetSection ? (
                <p className="text-sm text-zinc-500 py-8 text-center">
                  Click a participant to choose a target engagement.
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="sr-only">Search target engagements</span>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input
                        type="search"
                        value={targetQuery}
                        onChange={(e) => setTargetQuery(e.target.value)}
                        placeholder="Search by name or code…"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      />
                    </div>
                  </label>
                  <ul className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100">
                    {targetOptions.length === 0 ? (
                      <li className="px-3 py-4 text-sm text-zinc-500">No engagements found</li>
                    ) : (
                      targetOptions.map((engagement) => {
                        const secondary = formatEngagementSecondary(engagement);
                        const selected = targetEngagement?.engagement_id === engagement.engagement_id;
                        return (
                          <li key={engagement.engagement_id}>
                            <button
                              type="button"
                              onClick={() => {
                                setTargetEngagement(engagement);
                                setMoveConfirmOpen(false);
                                setMoveError(null);
                              }}
                              className={`w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${
                                selected ? "bg-zinc-50 ring-1 ring-inset ring-zinc-300" : ""
                              }`}
                            >
                              <div className="text-sm text-zinc-900">
                                {formatEngagementLabel(engagement)}
                              </div>
                              {secondary ? (
                                <div className="text-xs text-zinc-500 truncate">{secondary}</div>
                              ) : null}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </>
              )}
            </section>
          </div>

          {moveError ? <p className="text-sm text-red-600">{moveError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={moveConfirmOpen && !!selectedParticipant && !!targetEngagement && !!sourceEngagement}
        onClose={closeMoveConfirm}
        title="Confirm move"
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Are you sure you want to move the selected participant to the selected engagement?
          </p>

          {selectedParticipant ? (
            <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Participant</p>
              <p className="text-sm font-medium text-zinc-900">
                {participantDisplayName(selectedParticipant)}
              </p>
              <p className="text-xs text-zinc-500">
                {[selectedParticipant.phone, selectedParticipant.email].filter(Boolean).join(" · ") ||
                  `User #${selectedParticipant.user_id}`}
              </p>
              {sourceEngagement ? (
                <p className="text-xs text-zinc-500">
                  From: {formatEngagementLabel(sourceEngagement)}
                  {formatEngagementSecondary(sourceEngagement)
                    ? ` · ${formatEngagementSecondary(sourceEngagement)}`
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {targetEngagement ? (
            <div className="rounded-lg border border-zinc-200 p-3 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Target engagement
              </p>
              <p className="text-sm font-medium text-zinc-900">
                {formatEngagementLabel(targetEngagement)}
              </p>
              {formatEngagementSecondary(targetEngagement) ? (
                <p className="text-xs text-zinc-500">{formatEngagementSecondary(targetEngagement)}</p>
              ) : null}
            </div>
          ) : null}

          {moveError ? <p className="text-sm text-red-600">{moveError}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeMoveConfirm}
              disabled={moving}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmMove()}
              disabled={moving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {moving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Yes, move
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteConfirmOpen && !!emptySourceEngagement}
        onClose={handleKeepEmptySource}
        title="Delete empty engagement?"
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Would you like to delete this engagement
            {emptySourceEngagement ? (
              <>
                {" "}
                <span className="font-medium text-zinc-900">
                  {formatEngagementLabel(emptySourceEngagement)}
                </span>
              </>
            ) : null}
            ? It now has 0 participants.
          </p>
          {deleteError ? <p className="text-sm text-red-600">{deleteError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleKeepEmptySource}
              disabled={deleting}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteEmptySource()}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Yes
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
