interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
}

interface PaginatedPayload<T> {
  data: T[];
  meta: PaginatedMeta;
}

interface WrappedPaginatedPayload<T> {
  data: PaginatedPayload<T>;
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<WrappedPaginatedPayload<T>>,
  pageSize = 100
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let total = 0;

  while (true) {
    const response = await fetchPage(page, pageSize);
    const payload = response.data;
    const rows = payload.data ?? [];
    const meta = payload.meta;

    if (page === 1) {
      total = meta.total ?? rows.length;
    }

    results.push(...rows);

    const loadedAll = results.length >= total;
    const hasNextPage = meta.page * meta.limit < total;
    if (loadedAll || !hasNextPage || rows.length === 0) {
      break;
    }

    page += 1;
  }

  return results;
}
