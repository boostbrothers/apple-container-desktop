export function pushBounded<T>(arr: readonly T[], item: T, max: number): T[] {
  if (max <= 0) return [];
  if (arr.length < max) return [...arr, item];
  return [...arr.slice(arr.length - max + 1), item];
}
