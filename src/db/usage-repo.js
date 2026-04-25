import { getDb } from './index.js';

function mapUsageRow(row, shop, yearMonth) {
  return {
    shop,
    yearMonth,
    completedTasks: Number(row?.completed_tasks || 0),
    affectedVariantsTotal: Number(row?.affected_variants_total || 0)
  };
}

export function incrementMonthlyUsage({ shop, yearMonth, affectedVariants }) {
  if (!shop || !yearMonth) return;
  const db = getDb();
  db.prepare(`
    INSERT INTO usage_monthly (
      shop,
      year_month,
      completed_tasks,
      affected_variants_total
    ) VALUES (?, ?, 1, ?)
    ON CONFLICT (shop, year_month) DO UPDATE SET
      completed_tasks = usage_monthly.completed_tasks + 1,
      affected_variants_total = usage_monthly.affected_variants_total + excluded.affected_variants_total
  `).run(shop, yearMonth, Number(affectedVariants || 0));
}

export function getMonthlyUsage({ shop, yearMonth }) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      completed_tasks,
      affected_variants_total
    FROM usage_monthly
    WHERE shop = ?
      AND year_month = ?
  `).get(shop, yearMonth);
  return mapUsageRow(row, shop, yearMonth);
}

export function deleteUsageByShop(shop) {
  if (!shop) return;
  const db = getDb();
  db.prepare('DELETE FROM usage_monthly WHERE shop = ?').run(shop);
}
