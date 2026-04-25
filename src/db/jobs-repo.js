import { getDb } from './index.js';

function parseErrors(errorsJson) {
  if (!errorsJson) return [];
  try {
    const parsed = JSON.parse(errorsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapJobRow(row, snapshots) {
  if (!row) return null;
  return {
    id: row.id,
    shop: row.shop,
    status: row.status,
    productId: row.product_id,
    changedCount: Number(row.changed_count || 0),
    errorCount: Number(row.error_count || 0),
    snapshots,
    errors: parseErrors(row.errors_json)
  };
}

export function createJob({
  id,
  shop = null,
  productId,
  status = 'running',
  affectedVariants = 0,
  snapshots = [],
  errors = [],
  createdAt = Date.now()
}) {
  const db = getDb();
  const insertJob = db.prepare(`
    INSERT INTO jobs (
      id,
      shop,
      product_id,
      status,
      changed_count,
      error_count,
      affected_variants,
      created_at,
      completed_at,
      errors_json
    ) VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL, ?)
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO job_snapshots (
      job_id,
      variant_id,
      before_price,
      after_price,
      position
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertJob.run(
      id,
      shop,
      productId,
      status,
      Number(affectedVariants || snapshots.length),
      Number(createdAt),
      JSON.stringify(errors)
    );
    snapshots.forEach((snapshot, index) => {
      insertSnapshot.run(
        id,
        String(snapshot.variantId),
        String(snapshot.beforePrice),
        String(snapshot.afterPrice),
        index
      );
    });
  });

  tx();
}

export function incrementJobProgress({ jobId, changedDelta = 0, error = null }) {
  const db = getDb();
  const row = db.prepare('SELECT errors_json FROM jobs WHERE id = ?').get(jobId);
  if (!row) throw new Error(`job not found: ${jobId}`);

  const errors = parseErrors(row.errors_json);
  if (error) errors.push(error);

  db.prepare(`
    UPDATE jobs
    SET changed_count = changed_count + ?,
        error_count = error_count + ?,
        errors_json = ?
    WHERE id = ?
  `).run(
    Number(changedDelta || 0),
    error ? 1 : 0,
    JSON.stringify(errors),
    jobId
  );
}

export function completeJob({ jobId, status = 'completed', completedAt = Date.now() }) {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = ?,
        completed_at = ?
    WHERE id = ?
  `).run(status, Number(completedAt), jobId);
}

export function getJobWithSnapshots(jobId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      id,
      shop,
      product_id,
      status,
      changed_count,
      error_count,
      errors_json
    FROM jobs
    WHERE id = ?
  `).get(jobId);
  if (!row) return null;

  const snapshots = db.prepare(`
    SELECT
      variant_id,
      before_price,
      after_price
    FROM job_snapshots
    WHERE job_id = ?
    ORDER BY position ASC, variant_id ASC
  `).all(jobId).map(snapshot => ({
    variantId: snapshot.variant_id,
    beforePrice: snapshot.before_price,
    afterPrice: snapshot.after_price
  }));

  return mapJobRow(row, snapshots);
}

export function deleteJobsByShop(shop) {
  if (!shop) return;
  const db = getDb();
  db.prepare('DELETE FROM jobs WHERE shop = ?').run(shop);
}
