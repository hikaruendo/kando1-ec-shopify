import { toMoney } from './types.js';

function parseInValues(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function matchCondition(variant, c) {
  const raw = String(variant[c.field] ?? '');
  const val = String(c.value ?? '');
  switch (c.op) {
    case 'equals': return raw === val;
    case 'contains': return raw.includes(val);
    case 'startsWith': return raw.startsWith(val);
    case 'in': return parseInValues(c.value).includes(raw);
    default: return false;
  }
}

function applyAction(price, action) {
  const p = Number(price);
  const v = Number(action.value);
  switch (action.type) {
    case 'set': return toMoney(v);
    case 'add': return toMoney(p + v);
    case 'multiply': return toMoney(p * v);
    default: return toMoney(p);
  }
}

export function evaluateVariant(variant, rules) {
  let price = Number(variant.price);
  for (const r of [...rules].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))) {
    const ok = (r.conditions || []).every(c => matchCondition(variant, c));
    if (!ok) continue;
    price = applyAction(price, r.action || {});
  }
  return toMoney(price);
}

export function simulate(variants, rules) {
  const diffs = variants.map(v => {
    const before = toMoney(v.price);
    const after = evaluateVariant(v, rules);
    return {
      variantId: v.id,
      title: v.title,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      beforePrice: before,
      afterPrice: after,
      changed: before !== after
    };
  });

  const changed = diffs.filter(d => d.changed);
  return {
    summary: {
      totalVariants: variants.length,
      changedVariants: changed.length
    },
    diffs
  };
}
