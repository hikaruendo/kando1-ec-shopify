export function toMoney(n) {
  return Math.max(0, Math.round((Number(n) + Number.EPSILON) * 100) / 100);
}
