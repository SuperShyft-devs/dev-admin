import type { ProviderTestDiffResponse } from "../../lib/api";

export type OurTestSyncRow = {
  test_id: number;
  test_name: string;
  status: "matched" | "not_linked" | "only_in_ours";
  detail?: string;
};

export type ProviderConstituentRow = {
  provider_id: string;
  provider_name: string;
  status: "matched" | "only_at_provider";
};

export function buildOurTestRows(diff: ProviderTestDiffResponse): OurTestSyncRow[] {
  const rows: OurTestSyncRow[] = [];

  for (const item of diff.matched) {
    rows.push({
      test_id: item.test_id,
      test_name: item.test_name,
      status: "matched",
      detail: item.provider_name,
    });
  }
  for (const item of diff.only_in_package) {
    rows.push({
      test_id: item.test_id,
      test_name: item.test_name,
      status: "only_in_ours",
      detail: `Key #${item.provider_id} not in profile`,
    });
  }
  for (const item of diff.not_linked) {
    rows.push({
      test_id: item.test_id,
      test_name: item.test_name,
      status: "not_linked",
    });
  }

  return rows.sort((a, b) => a.test_name.localeCompare(b.test_name));
}

export function buildProviderConstituentRows(diff: ProviderTestDiffResponse): ProviderConstituentRow[] {
  const byId = new Map<string, ProviderConstituentRow>();

  for (const item of diff.matched) {
    byId.set(item.provider_id, {
      provider_id: item.provider_id,
      provider_name: item.provider_name,
      status: "matched",
    });
  }
  for (const item of diff.only_at_provider) {
    if (!byId.has(item.provider_id)) {
      byId.set(item.provider_id, {
        provider_id: item.provider_id,
        provider_name: item.provider_name,
        status: "only_at_provider",
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.provider_name.localeCompare(b.provider_name));
}

export function ourTestCount(diff: ProviderTestDiffResponse): number {
  return diff.matched.length + diff.only_in_package.length + diff.not_linked.length;
}

export function providerConstituentCount(diff: ProviderTestDiffResponse): number {
  return diff.matched.length + diff.only_at_provider.length;
}
