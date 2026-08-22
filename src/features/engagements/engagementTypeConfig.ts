import type { BloodCollectionType, ConsultationMode, EngagementKind, SlotDetail } from "../../lib/api";
import { collectDates, normalizeSlotDetail } from "./slotDetailUtils";

export type EngagementTypeConfig = {
  needsAssessment: boolean;
  needsDiagnostic: boolean;
  needsConsultation: boolean;
  needsBloodCollection: boolean;
  needsBloodCabins: boolean;
  needsConsultationCabins: boolean;
  needsMetsights: boolean;
  needsFitPrint: boolean;
  needsHealthiansZone: boolean;
  needsSlotDuration: boolean;
};

const EMPTY_CONFIG: EngagementTypeConfig = {
  needsAssessment: false,
  needsDiagnostic: false,
  needsConsultation: false,
  needsBloodCollection: false,
  needsBloodCabins: false,
  needsConsultationCabins: false,
  needsMetsights: false,
  needsFitPrint: false,
  needsHealthiansZone: false,
  needsSlotDuration: false,
};

/** Per-code field gates. `vifc` is frontend-only (not seeded in API). */
const TYPE_GATES: Partial<Record<EngagementKind, Partial<EngagementTypeConfig>>> = {
  bio_ai: {
    needsAssessment: true,
    needsDiagnostic: true,
    needsBloodCollection: true,
    needsBloodCabins: true,
    needsMetsights: true,
    needsFitPrint: true,
  },
  blood_test: {
    needsDiagnostic: true,
    needsBloodCollection: true,
    needsBloodCabins: true,
  },
  consultation: {
    needsConsultation: true,
    needsConsultationCabins: true,
  },
  blood_test_with_consultation: {
    needsDiagnostic: true,
    needsConsultation: true,
    needsBloodCollection: true,
    needsBloodCabins: true,
    needsConsultationCabins: true,
  },
  bio_ai_with_consultation: {
    needsAssessment: true,
    needsDiagnostic: true,
    needsConsultation: true,
    needsBloodCollection: true,
    needsBloodCabins: true,
    needsConsultationCabins: true,
    needsMetsights: true,
    needsFitPrint: true,
  },
  vifc: {
    needsAssessment: true,
    needsFitPrint: true,
  },
};

const TYPE_HINTS: Partial<Record<EngagementKind, string>> = {
  bio_ai: "Assessment + diagnostic packages with optional on-site blood collection.",
  blood_test: "Diagnostic blood testing with camp or home collection.",
  consultation: "Expert consultations with optional on-site consultation cabins.",
  blood_test_with_consultation: "Blood testing plus expert consultations.",
  bio_ai_with_consultation: "BioAI assessment, diagnostics, blood collection, and consultations.",
  vifc: "Assessment-focused engagement without cabin scheduling.",
};

export function getTypeConfig(kind: EngagementKind | string | null): EngagementTypeConfig {
  if (!kind) return { ...EMPTY_CONFIG };
  const gates = TYPE_GATES[kind as EngagementKind] ?? {};
  const needsBloodCollection = gates.needsBloodCollection ?? false;
  return {
    ...EMPTY_CONFIG,
    ...gates,
    needsHealthiansZone: needsBloodCollection,
    needsSlotDuration: needsBloodCollection,
  };
}

export function getTypeHint(kind: EngagementKind | string | null): string | null {
  if (!kind) return null;
  return TYPE_HINTS[kind as EngagementKind] ?? null;
}

export function hasOfferingsFields(kind: EngagementKind | string | null): boolean {
  const c = getTypeConfig(kind);
  return (
    c.needsAssessment ||
    c.needsDiagnostic ||
    c.needsConsultation ||
    c.needsBloodCollection ||
    c.needsMetsights ||
    c.needsFitPrint
  );
}

export function showConsultationCabinsInSchedule(
  kind: EngagementKind | string | null,
  consultationMode: ConsultationMode | string | null | undefined
): boolean {
  return getTypeConfig(kind).needsConsultationCabins && consultationMode === "offline";
}

export type ScheduleIntent = {
  configureBlood: boolean;
  configureConsult: boolean;
};

export const EMPTY_SCHEDULE_INTENT: ScheduleIntent = {
  configureBlood: false,
  configureConsult: false,
};

export function scheduleIntentFromSlotDetail(
  slotDetail: SlotDetail | null | undefined
): ScheduleIntent {
  const summary = summarizeSlotDetail(slotDetail);
  return {
    configureBlood: summary.bloodCabins > 0,
    configureConsult: summary.consultCabins > 0,
  };
}

export function canConfigureBloodSchedule(
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined
): boolean {
  return showBloodCabinsInSchedule(kind, bloodMode);
}

export function canConfigureConsultSchedule(
  kind: EngagementKind | string | null,
  consultationMode: ConsultationMode | string | null | undefined
): boolean {
  return showConsultationCabinsInSchedule(kind, consultationMode);
}

export function needsScheduleStep(
  kind: EngagementKind | string | null,
  bloodMode?: BloodCollectionType | string | null,
  consultationMode?: ConsultationMode | string | null,
  scheduleIntent?: ScheduleIntent
): boolean {
  const showBlood = showBloodCabinsInSchedule(kind, bloodMode);
  const showConsult = showConsultationCabinsInSchedule(kind, consultationMode);
  if (!scheduleIntent) {
    return showBlood || showConsult;
  }
  return (
    (showBlood && scheduleIntent.configureBlood) ||
    (showConsult && scheduleIntent.configureConsult)
  );
}

export function showBloodCabinsInSchedule(
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined
): boolean {
  return getTypeConfig(kind).needsBloodCabins && bloodMode === "camp_collection";
}

export function showHomeCollectionPanel(
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined
): boolean {
  return getTypeConfig(kind).needsBloodCabins && bloodMode === "home_collection";
}

export function showBloodModeUnsetPanel(
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined
): boolean {
  return getTypeConfig(kind).needsBloodCabins && !bloodMode;
}

export function getScheduleStepLabel(
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined,
  consultationMode?: ConsultationMode | string | null
): string {
  const showBlood = showBloodCabinsInSchedule(kind, bloodMode);
  const showConsult = showConsultationCabinsInSchedule(kind, consultationMode);
  if (showBlood && showConsult) return "On-site schedule";
  if (showBlood) return "Blood test schedule";
  if (showConsult) return "Consultation schedule";
  if (showHomeCollectionPanel(kind, bloodMode)) return "Collection mode";
  if (showBloodModeUnsetPanel(kind, bloodMode)) return "Collection mode";
  return "Schedule";
}

export function getScheduleTitle(
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined,
  consultationMode?: ConsultationMode | string | null
): string {
  const showBlood = showBloodCabinsInSchedule(kind, bloodMode);
  const showConsult = showConsultationCabinsInSchedule(kind, consultationMode);
  if (showBlood && showConsult) return "On-site dates & cabins";
  if (showBlood) return "Blood test dates & cabins";
  if (showConsult) return "Consultation dates & cabins";
  if (showHomeCollectionPanel(kind, bloodMode)) return "Home collection";
  if (showBloodModeUnsetPanel(kind, bloodMode)) return "On-site scheduling";
  return "Schedule";
}

/** Remove slot_detail sections that no longer apply for the current type and blood mode. */
export function pruneSlotDetailForType(
  slotDetail: SlotDetail,
  kind: EngagementKind | string | null,
  bloodMode: BloodCollectionType | string | null | undefined,
  consultationMode?: ConsultationMode | string | null
): SlotDetail {
  const normalized = normalizeSlotDetail(slotDetail);
  const next: SlotDetail = { ...normalized };
  const c = getTypeConfig(kind);

  if (!c.needsBloodCabins || bloodMode !== "camp_collection") {
    delete next.blood_collection;
  }
  if (!showConsultationCabinsInSchedule(kind, consultationMode)) {
    delete next.consultation;
  }
  return next;
}

export function datesAfterPrune(slotDetail: SlotDetail): string[] {
  return collectDates(slotDetail);
}

export type ScheduleSummary = {
  bloodDates: number;
  consultDates: number;
  bloodCabins: number;
  consultCabins: number;
};

export function summarizeSlotDetail(slotDetail: SlotDetail | null | undefined): ScheduleSummary {
  const empty: ScheduleSummary = {
    bloodDates: 0,
    consultDates: 0,
    bloodCabins: 0,
    consultCabins: 0,
  };
  if (!slotDetail) return empty;

  const normalized = normalizeSlotDetail(slotDetail);
  const bloodSection = normalized.blood_collection ?? {};
  const consultSection = normalized.consultation ?? {};

  return {
    bloodDates: Object.keys(bloodSection).length,
    consultDates: Object.keys(consultSection).length,
    bloodCabins: Object.values(bloodSection).reduce((n, entry) => n + (entry.cabins?.length ?? 0), 0),
    consultCabins: Object.values(consultSection).reduce(
      (n, entry) => n + (entry.cabins?.length ?? 0),
      0
    ),
  };
}

export function formatBloodCollectionLabel(
  value: BloodCollectionType | string | null | undefined
): string {
  if (value === "home_collection") return "Home collection";
  if (value === "camp_collection") return "Camp collection";
  return "Not set";
}

export function formatConsultationModeLabel(
  value: ConsultationMode | string | null | undefined
): string {
  if (value === "online") return "Online";
  if (value === "offline") return "Offline";
  return "Not set";
}
