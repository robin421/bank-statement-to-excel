/** 1-D clustering helpers shared by row and column detection. */

export interface Cluster<T> {
  /** Mean of the clustered values. */
  centre: number;
  min: number;
  max: number;
  members: T[];
}

/**
 * Group values that sit within `tolerance` of the running cluster centre.
 * Input does not need to be sorted; output is ordered by centre ascending.
 *
 * Using the running centre (rather than the first member) matters for wide
 * clusters such as right-aligned money columns, where a single outlier would
 * otherwise split or swallow neighbouring values.
 */
export function clusterBy<T>(items: T[], value: (item: T) => number, tolerance: number): Cluster<T>[] {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  const clusters: Cluster<T>[] = [];

  for (const item of sorted) {
    const v = value(item);
    const current = clusters[clusters.length - 1];
    if (current && Math.abs(v - current.centre) <= tolerance) {
      const n = current.members.length;
      current.centre = (current.centre * n + v) / (n + 1);
      current.min = Math.min(current.min, v);
      current.max = Math.max(current.max, v);
      current.members.push(item);
    } else {
      clusters.push({ centre: v, min: v, max: v, members: [item] });
    }
  }

  return clusters;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
