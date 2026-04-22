export function calcOutlierScore(views: number, subscribers: number): number {
  if (subscribers <= 0) return 0;
  return views / subscribers;
}
