/**
 * Run an async worker over items with a bounded number of concurrent workers.
 * Results preserve input order. A small helper; not a general scheduler.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(Math.floor(limit), items.length || 1));
  let cursor = 0;

  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await worker(item, index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => run()));
  return results;
}
