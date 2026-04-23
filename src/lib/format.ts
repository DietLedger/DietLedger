export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}
