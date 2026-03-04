import 'dotenv/config';
import express from 'express';
import { simulate } from './rules.js';
import { fetchVariantsByProductId, updateVariantPrice } from './shopifyClient.js';
import { jobs, nextJobId } from './store.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/simulate', async (req, res) => {
  try {
    const { productId, rules = [] } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId required' });
    const variants = await fetchVariantsByProductId(productId);
    const out = simulate(variants, rules);
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/api/apply', async (req, res) => {
  try {
    const { productId, rules = [] } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId required' });

    const variants = await fetchVariantsByProductId(productId);
    const sim = simulate(variants, rules);
    const changed = sim.diffs.filter(d => d.changed);

    const jobId = nextJobId();
    jobs.set(jobId, {
      id: jobId,
      status: 'running',
      productId,
      changedCount: 0,
      errorCount: 0,
      snapshots: changed.map(c => ({ variantId: c.variantId, beforePrice: c.beforePrice, afterPrice: c.afterPrice })),
      errors: []
    });

    for (const row of changed) {
      try {
        await updateVariantPrice(row.variantId, row.afterPrice);
        jobs.get(jobId).changedCount += 1;
      } catch (e) {
        jobs.get(jobId).errorCount += 1;
        jobs.get(jobId).errors.push({ variantId: row.variantId, message: String(e) });
      }
    }

    jobs.get(jobId).status = 'completed';
    return res.json({ jobId, status: 'completed', changedCount: jobs.get(jobId).changedCount, errorCount: jobs.get(jobId).errorCount });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });
  return res.json(job);
});

app.post('/api/jobs/:jobId/undo', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });

  let restoredCount = 0;
  const errors = [];
  for (const s of job.snapshots || []) {
    try {
      await updateVariantPrice(s.variantId, s.beforePrice);
      restoredCount += 1;
    } catch (e) {
      errors.push({ variantId: s.variantId, message: String(e) });
    }
  }

  return res.json({ ok: errors.length === 0, restoredCount, errorCount: errors.length, errors });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`kando1-bulk-pricing api listening on :${port}`);
});
