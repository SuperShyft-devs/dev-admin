import { engagementsApi, type EngagementListItem } from "../../lib/api";

/** Fetch all engagements for a camp, respecting API max limit of 100. */
export async function listAllEngagementsForCamp(
  campNo: number
): Promise<EngagementListItem[]> {
  const limit = 100;
  let page = 1;
  const all: EngagementListItem[] = [];

  while (true) {
    const res = await engagementsApi.list({ camp_no: campNo, page, limit });
    const rows = res.data.data;
    all.push(...rows);
    const total = res.data.meta.total;
    if (all.length >= total || rows.length === 0) break;
    page += 1;
  }

  return all;
}
