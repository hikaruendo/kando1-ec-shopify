const rulesEl = document.getElementById('rules');
const ruleTpl = document.getElementById('ruleTpl');
const conditionTpl = document.getElementById('conditionTpl');
const summaryEl = document.getElementById('summary');
const resultEl = document.getElementById('result');
const productIdEl = document.getElementById('productId');
const shopEl = document.getElementById('shop');
const shopStatusEl = document.getElementById('shopStatus');
const connectShopBtn = document.getElementById('connectShop');
let valueCandidatesCache = null;

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function normalizeShop(input) {
  const shop = String(input || '').trim().toLowerCase();
  return SHOP_RE.test(shop) ? shop : '';
}

function escapeHtml(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCsvValues(input) {
  return String(input ?? '')
    .replaceAll('、', ',')
    .replace(/\n/g, ',')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function serializeConditionValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '');
}

function getProductId() {
  return productIdEl.value.trim();
}

function getShop() {
  return normalizeShop(shopEl.value);
}

function getAuthUrl(shop) {
  return `/auth?shop=${encodeURIComponent(shop)}`;
}

function renderRequestError(prefix, error) {
  if (error?.authUrl) {
    summaryEl.innerHTML = `${escapeHtml(prefix)}: ${escapeHtml(error.message || error)} <a href="${error.authUrl}">Connect shop</a>`;
    return;
  }
  summaryEl.textContent = `${prefix}: ${String(error.message || error)}`;
}

async function refreshShopStatus() {
  const shop = getShop();
  if (!shop) {
    shopStatusEl.textContent = 'MOCK_MODE=true なら shop 未入力でも動作します。';
    return;
  }

  try {
    const res = await fetch(`/api/auth/status?shop=${encodeURIComponent(shop)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'status check failed');
    if (data.connected) {
      shopStatusEl.textContent = `Connected: ${shop} (${data.source})`;
    } else {
      shopStatusEl.innerHTML = `Not connected: ${shop}. <a href="${getAuthUrl(shop)}">Connect now</a>`;
    }
  } catch (e) {
    shopStatusEl.textContent = `Status check failed: ${String(e.message || e)}`;
  }
}

function indexCandidateValues(diffs) {
  const values = {
    option1: new Set(),
    option2: new Set(),
    title: new Set()
  };
  for (const row of diffs || []) {
    values.option1.add(String(row.option1 ?? '').trim());
    values.option2.add(String(row.option2 ?? '').trim());
    values.title.add(String(row.title ?? '').trim());
  }
  return {
    option1: [...values.option1].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja')),
    option2: [...values.option2].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja')),
    title: [...values.title].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'))
  };
}

async function ensureValueCandidates() {
  const productId = getProductId();
  if (!productId) throw new Error('productId required');
  const shop = getShop();
  if (valueCandidatesCache?.productId === productId && valueCandidatesCache?.shop === shop) return valueCandidatesCache;

  const sim = await request('/api/simulate', []);
  valueCandidatesCache = {
    shop,
    productId,
    byField: indexCandidateValues(sim.diffs)
  };
  return valueCandidatesCache;
}

function syncConditionInput(conditionEl) {
  const op = conditionEl.querySelector('.op').value;
  const valueInput = conditionEl.querySelector('.value');
  const pickBtn = conditionEl.querySelector('.pickValues');
  const picker = conditionEl.querySelector('.valuePicker');
  if (op === 'in') {
    valueInput.placeholder = 'Black1, Black2, Black3';
    pickBtn.classList.remove('hidden');
  } else {
    valueInput.placeholder = 'value';
    pickBtn.classList.add('hidden');
    picker.classList.add('hidden');
  }
}

function closeAllPickers(exceptEl = null) {
  for (const picker of document.querySelectorAll('.valuePicker')) {
    if (picker !== exceptEl) picker.classList.add('hidden');
  }
}

async function renderPickerValues(conditionEl) {
  const field = conditionEl.querySelector('.field').value;
  const valueInput = conditionEl.querySelector('.value');
  const picker = conditionEl.querySelector('.valuePicker');
  const meta = picker.querySelector('.pickerMeta');
  const list = picker.querySelector('.pickerList');

  meta.textContent = 'loading...';
  list.replaceChildren();

  const cache = await ensureValueCandidates();
  const candidates = cache.byField[field] || [];
  const candidateSet = new Set(candidates);
  const selected = new Set(
    parseCsvValues(valueInput.value).filter(value => candidateSet.has(value))
  );
  valueInput.value = [...selected].join(', ');

  if (!candidates.length) {
    meta.textContent = `No candidates found for ${field}`;
    return;
  }

  meta.textContent = `${field} values (${candidates.length})`;
  const frag = document.createDocumentFragment();
  for (const candidate of candidates) {
    const label = document.createElement('label');
    label.className = 'pickerItem';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = candidate;
    cb.checked = selected.has(candidate);
    cb.onchange = () => {
      if (cb.checked) selected.add(candidate);
      else selected.delete(candidate);
      valueInput.value = [...selected].join(', ');
    };

    const text = document.createElement('span');
    text.textContent = candidate;

    label.append(cb, text);
    frag.appendChild(label);
  }
  list.appendChild(frag);
}

async function togglePicker(conditionEl) {
  const picker = conditionEl.querySelector('.valuePicker');
  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }

  closeAllPickers(picker);
  picker.classList.remove('hidden');
  try {
    await renderPickerValues(conditionEl);
  } catch (e) {
    picker.querySelector('.pickerMeta').textContent = `Failed to load candidates: ${String(e.message || e)}`;
    picker.querySelector('.pickerList').replaceChildren();
  }
}

function addCondition(container, seed = {}) {
  const node = conditionTpl.content.firstElementChild.cloneNode(true);
  const opSelect = node.querySelector('.op');
  const fieldSelect = node.querySelector('.field');
  const pickBtn = node.querySelector('.pickValues');

  node.querySelector('.field').value = seed.field ?? 'option1';
  opSelect.value = seed.op ?? 'startsWith';
  node.querySelector('.value').value = serializeConditionValue(seed.value);
  fieldSelect.onchange = async () => {
    if (!node.querySelector('.valuePicker').classList.contains('hidden')) {
      await renderPickerValues(node);
    }
  };
  opSelect.onchange = () => syncConditionInput(node);
  pickBtn.onclick = async () => togglePicker(node);
  node.querySelector('.removeCondition').onclick = () => node.remove();
  syncConditionInput(node);
  container.appendChild(node);
}

function addRule(seed = {}) {
  const node = ruleTpl.content.firstElementChild.cloneNode(true);
  const conditionsEl = node.querySelector('.conditions');

  node.querySelector('.priority').value = seed.priority ?? 1;
  node.querySelector('.actionType').value = seed.action?.type ?? 'add';
  node.querySelector('.actionValue').value = seed.action?.value ?? 0;

  node.querySelector('.remove').onclick = () => node.remove();
  node.querySelector('.addCondition').onclick = () => addCondition(conditionsEl);

  const conditions = seed.conditions?.length ? seed.conditions : [{ field: 'option1', op: 'startsWith', value: 'Black' }];
  for (const c of conditions) {
    addCondition(conditionsEl, c);
  }

  rulesEl.appendChild(node);
}

function collectRules() {
  return [...rulesEl.querySelectorAll('.rule')].map(rule => ({
    priority: Number(rule.querySelector('.priority').value || 999),
    conditions: [...rule.querySelectorAll('.condition')].map(c => {
      const op = c.querySelector('.op').value;
      const rawValue = c.querySelector('.value').value;
      return {
        field: c.querySelector('.field').value,
        op,
        value: op === 'in' ? parseCsvValues(rawValue) : rawValue
      };
    }),
    action: {
      type: rule.querySelector('.actionType').value,
      value: Number(rule.querySelector('.actionValue').value || 0)
    }
  }));
}

async function request(path, rules = collectRules()) {
  const productId = getProductId();
  const shop = getShop();
  const body = { productId, shop, rules };
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  let payload;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) payload = await res.json();
  else payload = await res.text();

  if (!res.ok) {
    const err = new Error(typeof payload === 'object' ? payload?.error || JSON.stringify(payload) : String(payload));
    if (payload?.authUrl) err.authUrl = payload.authUrl;
    throw err;
  }
  return payload;
}

function renderSim(data) {
  summaryEl.innerHTML = `<b>summary</b>: total=${data.summary.totalVariants}, changed=${data.summary.changedVariants}`;
  const rows = data.diffs.map(d => `
    <tr>
      <td>${d.variantId}</td>
      <td>${d.title}</td>
      <td>${d.beforePrice}</td>
      <td class="${d.changed ? 'changed' : ''}">${d.afterPrice}</td>
      <td>${d.changed ? 'yes' : 'no'}</td>
    </tr>
  `).join('');

  resultEl.innerHTML = `
    <table class="table">
      <thead><tr><th>variantId</th><th>title</th><th>before</th><th>after</th><th>changed</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.getElementById('addRule').onclick = () => addRule();
productIdEl.oninput = () => {
  valueCandidatesCache = null;
};
shopEl.oninput = () => {
  valueCandidatesCache = null;
  refreshShopStatus();
};
connectShopBtn.onclick = () => {
  const shop = getShop();
  if (!shop) {
    shopStatusEl.textContent = 'shop domain is invalid. example: your-store.myshopify.com';
    return;
  }
  window.location.href = getAuthUrl(shop);
};
document.addEventListener('click', event => {
  if (!event.target.closest('.condition')) closeAllPickers();
});

document.getElementById('simulate').onclick = async () => {
  try {
    const data = await request('/api/simulate');
    renderSim(data);
  } catch (e) {
    renderRequestError('simulate error', e);
  }
};

document.getElementById('apply').onclick = async () => {
  try {
    const data = await request('/api/apply');
    summaryEl.innerHTML = `<b>apply done</b>: jobId=${data.jobId}, changed=${data.changedCount}, errors=${data.errorCount}`;
  } catch (e) {
    renderRequestError('apply error', e);
  }
};

addRule({
  priority: 1,
  conditions: [
    { field: 'option1', op: 'in', value: ['Black1', 'Black2', 'Black3', 'Black4', 'Black5'] },
    { field: 'option2', op: 'equals', value: 'Standard' }
  ],
  action: { type: 'add', value: 300 }
});

(() => {
  const qs = new URLSearchParams(window.location.search);
  const shop = normalizeShop(qs.get('shop'));
  if (shop) shopEl.value = shop;
  if (qs.get('installed') === '1') {
    summaryEl.innerHTML = '<b>shop connected</b>: OAuth completed';
  }
  refreshShopStatus();
})();
