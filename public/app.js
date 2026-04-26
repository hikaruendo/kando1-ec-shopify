const rulesEl = document.getElementById('rules');
const ruleTpl = document.getElementById('ruleTpl');
const conditionTpl = document.getElementById('conditionTpl');
const summaryEl = document.getElementById('summary');
const resultEl = document.getElementById('result');
const productIdEl = document.getElementById('productId');
const productInfoEl = document.getElementById('productInfo');
const pickProductBtn = document.getElementById('pickProduct');
const shopEl = document.getElementById('shop');
const shopStatusEl = document.getElementById('shopStatus');
const connectShopBtn = document.getElementById('connectShop');
const shopSectionEl = document.getElementById('shopSection');
const paywallEl = document.getElementById('paywall');
const scheduleToggleBtn = document.getElementById('scheduleToggle');
const saveTemplateBtn = document.getElementById('saveTemplate');
const olderHistoryBtn = document.getElementById('olderHistory');
const softPaywallModalEl = document.getElementById('softPaywallModal');
const softPaywallTitleEl = document.getElementById('softPaywallTitle');
const softPaywallBodyEl = document.getElementById('softPaywallBody');
const softPaywallUpgradeEl = document.getElementById('softPaywallUpgrade');
const softPaywallCloseBtn = document.getElementById('softPaywallClose');

let valueCandidatesCache = null;

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const ADMIN_PRODUCT_URL_RE = /\/products\/(\d+)/i;

const I18N = {
  en: {
    appTitle: 'Bulk Pricing Rule Builder',
    shopDomainLabel: 'Shop Domain',
    connectButton: 'Connect',
    productIdLabel: 'Product ID',
    productIdPlaceholder: 'Pick product or paste gid://shopify/Product/123',
    pickProductButton: 'Pick product',
    rulesHeading: 'Rules',
    addRuleButton: '+ Rule',
    previewButton: 'Preview',
    applyButton: 'Apply',
    connectShopLink: 'Connect shop',
    connectNowLink: 'Connect now',
    resourcePickerUnavailable: 'Resource Picker unavailable. Open from Shopify Admin embedded app.',
    openingResourcePicker: 'Opening Shopify Resource Picker...',
    pickerTimedOut: 'picker timed out',
    noProductSelected: 'No product selected from Resource Picker',
    selectedProduct: 'Selected: {title}',
    selectedProductSet: 'Selected product set',
    productPickerFailed: 'Product picker failed: {message}',
    mockModeHint: 'You can leave shop empty only when MOCK_MODE=true.',
    statusCheckFailed: 'Status check failed: {message}',
    connectedStatus: 'Connected: {shop} ({source})',
    notConnectedStatus: 'Not connected: {shop}.',
    selectValuesPlaceholder: 'Select values',
    valuePlaceholder: 'value',
    pickerLoading: 'loading...',
    noCandidates: 'No candidates found for {field}',
    fieldValuesLabel: '{field} values ({count})',
    failedToLoadCandidates: 'Failed to load candidates: {message}',
    simulateError: 'simulate error',
    applyError: 'apply error',
    summaryLabel: 'summary',
    applyDoneLabel: 'apply done',
    changedYes: 'yes',
    changedNo: 'no',
    tableVariantId: 'variantId',
    tableTitle: 'title',
    tableBefore: 'before',
    tableAfter: 'after',
    tableChanged: 'changed',
    shopDomainInvalid: 'shop domain is invalid. example: your-store.myshopify.com',
    resourcePickerAvailable: 'Resource Picker available',
    pasteOrOpenForPicker: 'Paste Product GID or admin product URL, or open in embedded app for picker',
    shopConnected: 'shop connected',
    oauthCompleted: 'OAuth completed',
    priorityLabel: 'Priority',
    actionLabel: 'Action',
    addConditionButton: '+ Condition',
    pickValuesButton: 'Pick',
    fieldOption1: 'Option 1',
    fieldOption2: 'Option 2',
    fieldTitle: 'Title',
    opEquals: 'equals',
    opContains: 'contains',
    opStartsWith: 'startsWith',
    opIn: 'in (multi-select)',
    actionAdd: 'add',
    actionSet: 'set',
    actionMultiply: 'multiply',
    variantsOverCap: 'This preview affects {variants} variants. Free is limited to {cap} variants/run. Upgrade to Standard ($9.99/mo) to apply this preview as-is.',
    variantsOverCapCurrent: 'This preview affects {variants} variants. Your current plan is limited to {cap} variants/run. Upgrade to {plan} ({price}/mo) to apply this preview as-is.',
    tasksOverCap: 'You have used all {cap} free runs this month. Upgrade to Standard ($9.99/mo) to apply this preview.',
    tasksOverCapCurrent: 'You have used all {cap} runs this month. Upgrade to {plan} ({price}/mo) to apply this preview.',
    upgradeButton: 'Upgrade',
    scheduleButton: 'Schedule',
    saveTemplateButton: 'Save as template',
    olderHistoryButton: 'Older history',
    notNowButton: 'Not now',
    softPaywallTitle: '{feature} is available on Pro',
    softPaywallBody: 'Upgrade to Pro ($24.99/mo) to use {feature}. This preview is here to measure demand before the feature ships.',
    scheduleFeature: 'Schedule',
    templateFeature: 'Saved templates',
    historyFeature: 'Older history'
  },
  ja: {
    appTitle: '一括価格ルールビルダー',
    shopDomainLabel: 'ショップドメイン',
    connectButton: '接続',
    productIdLabel: '商品ID',
    productIdPlaceholder: '商品を選択するか gid://shopify/Product/123 を貼り付け',
    pickProductButton: '商品を選択',
    rulesHeading: 'ルール',
    addRuleButton: '+ ルール',
    previewButton: 'プレビュー',
    applyButton: '反映',
    connectShopLink: 'ショップ接続',
    connectNowLink: '今すぐ接続',
    resourcePickerUnavailable: 'Resource Pickerが利用できません。Shopify管理画面の埋め込みアプリから開いてください。',
    openingResourcePicker: 'Shopify Resource Pickerを開いています...',
    pickerTimedOut: 'picker がタイムアウトしました',
    noProductSelected: 'Resource Pickerで商品が選択されませんでした',
    selectedProduct: '選択: {title}',
    selectedProductSet: '商品を選択しました',
    productPickerFailed: '商品ピッカーエラー: {message}',
    mockModeHint: 'MOCK_MODE=true の場合のみ shop 未入力で動作します。',
    statusCheckFailed: 'ステータス確認失敗: {message}',
    connectedStatus: '接続済み: {shop} ({source})',
    notConnectedStatus: '未接続: {shop}。',
    selectValuesPlaceholder: '値を選択',
    valuePlaceholder: '値',
    pickerLoading: '読み込み中...',
    noCandidates: '{field} の候補がありません',
    fieldValuesLabel: '{field} の候補 ({count})',
    failedToLoadCandidates: '候補の読み込み失敗: {message}',
    simulateError: 'プレビューエラー',
    applyError: '反映エラー',
    summaryLabel: '集計',
    applyDoneLabel: '反映完了',
    changedYes: 'はい',
    changedNo: 'いいえ',
    tableVariantId: 'variantId',
    tableTitle: 'タイトル',
    tableBefore: '変更前',
    tableAfter: '変更後',
    tableChanged: '変更',
    shopDomainInvalid: 'shop domain が不正です。例: your-store.myshopify.com',
    resourcePickerAvailable: 'Resource Picker が利用可能です',
    pasteOrOpenForPicker: 'Product GID/商品URLを貼り付けるか、埋め込みアプリで picker を開いてください',
    shopConnected: 'ショップ接続',
    oauthCompleted: 'OAuth完了',
    priorityLabel: '優先度',
    actionLabel: '操作',
    addConditionButton: '+ 条件',
    pickValuesButton: '選択',
    fieldOption1: 'オプション1',
    fieldOption2: 'オプション2',
    fieldTitle: 'タイトル',
    opEquals: '一致',
    opContains: '含む',
    opStartsWith: '前方一致',
    opIn: 'いずれか（複数選択）',
    actionAdd: '加算',
    actionSet: '上書き',
    actionMultiply: '乗算',
    variantsOverCap: '今回の更新は {variants} variants が対象です。Free は {cap} variants/回 までです。Standard（$9.99/mo）にアップグレードすると、このプレビューのまま実行できます。',
    variantsOverCapCurrent: '今回の更新は {variants} variants が対象です。現在のプランは {cap} variants/回 までです。{plan}（{price}/mo）にアップグレードすると、このプレビューのまま実行できます。',
    tasksOverCap: '今月の無料実行回数 {cap} 回は使い切りました。Standard（$9.99/mo）にアップグレードすると、このプレビューを実行できます。',
    tasksOverCapCurrent: '今月の実行回数 {cap} 回は使い切りました。{plan}（{price}/mo）にアップグレードすると、このプレビューを実行できます。',
    upgradeButton: 'アップグレード',
    scheduleButton: 'スケジュール',
    saveTemplateButton: 'テンプレート保存',
    olderHistoryButton: '過去履歴',
    notNowButton: 'あとで',
    softPaywallTitle: '{feature} は Pro で利用できます',
    softPaywallBody: 'Pro（$24.99/mo）にアップグレードすると {feature} を利用できます。この入口は機能公開前の需要計測も兼ねています。',
    scheduleFeature: 'スケジュール',
    templateFeature: 'テンプレート保存',
    historyFeature: '過去履歴'
  }
};

function detectLocale() {
  const qs = new URLSearchParams(window.location.search);
  const fromQuery = String(qs.get('locale') || '').toLowerCase();
  const fromBrowser = String(navigator.language || 'en').toLowerCase();
  const raw = fromQuery || fromBrowser;
  return raw.startsWith('ja') ? 'ja' : 'en';
}

const locale = detectLocale();

function t(key, vars = {}) {
  const dict = I18N[locale] || I18N.en;
  const fallback = I18N.en[key] || key;
  const template = dict[key] || fallback;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function applyStaticI18n() {
  document.documentElement.lang = locale;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (!key) continue;
    el.textContent = t(key);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) continue;
    el.setAttribute('placeholder', t(key));
  }
}

function shouldShowShopControls(shopFromQuery) {
  const qs = new URLSearchParams(window.location.search);
  const debug = qs.get('debug') === '1';
  return debug || !shopFromQuery;
}

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
  const raw = productIdEl.value.trim();
  const fromUrl = raw.match(ADMIN_PRODUCT_URL_RE)?.[1];
  if (fromUrl) return `gid://shopify/Product/${fromUrl}`;
  return raw;
}

function getShop() {
  return normalizeShop(shopEl.value);
}

function setProductInfo(text) {
  productInfoEl.textContent = text || '';
}

function normalizeProductIdInput() {
  const normalized = getProductId();
  if (!normalized) return;
  if (normalized !== productIdEl.value.trim()) {
    productIdEl.value = normalized;
  }
}

function getShopifyGlobal() {
  return window.shopify || null;
}

function getResourcePickerBridge() {
  const shopify = getShopifyGlobal();
  if (!shopify || typeof shopify.resourcePicker !== 'function') return null;
  return shopify;
}

async function getSessionToken() {
  const shopify = getShopifyGlobal();
  if (!shopify || typeof shopify.idToken !== 'function') return '';
  return shopify.idToken();
}

async function buildApiHeaders() {
  const headers = { 'content-type': 'application/json' };
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

function extractPickedProduct(selectionResult) {
  if (Array.isArray(selectionResult)) return selectionResult[0] || null;
  if (Array.isArray(selectionResult?.selection)) return selectionResult.selection[0] || null;
  if (selectionResult?.id) return selectionResult;
  return null;
}

async function pickProductWithAppBridge() {
  const bridge = getResourcePickerBridge();
  if (!bridge) {
    setProductInfo(t('resourcePickerUnavailable'));
    return;
  }

  try {
    setProductInfo(t('openingResourcePicker'));
    const selected = await Promise.race([
      bridge.resourcePicker({
        type: 'product',
        action: 'select',
        multiple: false
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(t('pickerTimedOut'))), 10000);
      })
    ]);

    const picked = extractPickedProduct(selected);
    if (!picked?.id) {
      setProductInfo(t('noProductSelected'));
      return;
    }

    productIdEl.value = picked.id;
    valueCandidatesCache = null;
    const title = picked.title ? t('selectedProduct', { title: picked.title }) : t('selectedProductSet');
    setProductInfo(title);
  } catch (e) {
    setProductInfo(t('productPickerFailed', { message: String(e.message || e) }));
  }
}

function getAuthUrl(shop) {
  return `/auth?shop=${encodeURIComponent(shop)}`;
}

function renderRequestError(prefix, error) {
  if (error?.authUrl) {
    summaryEl.innerHTML = `${escapeHtml(prefix)}: ${escapeHtml(error.message || error)} <a href="${error.authUrl}">${escapeHtml(t('connectShopLink'))}</a>`;
    return;
  }
  summaryEl.textContent = `${prefix}: ${String(error.message || error)}`;
}

async function refreshShopStatus() {
  const shop = getShop();
  if (!shop) {
    shopStatusEl.textContent = t('mockModeHint');
    return;
  }

  try {
    const res = await fetch(`/api/auth/status?shop=${encodeURIComponent(shop)}`, {
      headers: await buildApiHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'status check failed');
    if (data.connected) {
      shopStatusEl.textContent = t('connectedStatus', { shop, source: data.source });
    } else {
      shopStatusEl.innerHTML = `${escapeHtml(t('notConnectedStatus', { shop }))} <a href="${getAuthUrl(shop)}">${escapeHtml(t('connectNowLink'))}</a>`;
    }
  } catch (e) {
    shopStatusEl.textContent = t('statusCheckFailed', { message: String(e.message || e) });
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

function localizeConditionNode(node) {
  const fieldLabels = {
    option1: t('fieldOption1'),
    option2: t('fieldOption2'),
    title: t('fieldTitle')
  };
  for (const option of node.querySelectorAll('.field option')) {
    option.textContent = fieldLabels[option.value] || option.value;
  }

  const opLabels = {
    equals: t('opEquals'),
    contains: t('opContains'),
    startsWith: t('opStartsWith'),
    in: t('opIn')
  };
  for (const option of node.querySelectorAll('.op option')) {
    option.textContent = opLabels[option.value] || option.value;
  }

  node.querySelector('.pickValues').textContent = t('pickValuesButton');
}

function localizeRuleNode(node) {
  const labels = node.querySelectorAll('.row > label');
  if (labels[0]) labels[0].textContent = t('priorityLabel');
  if (labels[1]) labels[1].textContent = t('actionLabel');

  node.querySelector('.addCondition').textContent = t('addConditionButton');

  const actionLabels = {
    add: t('actionAdd'),
    set: t('actionSet'),
    multiply: t('actionMultiply')
  };
  for (const option of node.querySelectorAll('.actionType option')) {
    option.textContent = actionLabels[option.value] || option.value;
  }
}

function syncConditionInput(conditionEl) {
  const op = conditionEl.querySelector('.op').value;
  const valueInput = conditionEl.querySelector('.value');
  const pickBtn = conditionEl.querySelector('.pickValues');
  const picker = conditionEl.querySelector('.valuePicker');
  if (op === 'in') {
    valueInput.placeholder = t('selectValuesPlaceholder');
    pickBtn.classList.remove('hidden');
  } else {
    valueInput.placeholder = t('valuePlaceholder');
    pickBtn.classList.add('hidden');
    picker.classList.add('hidden');
  }
}

async function renderPickerValues(conditionEl) {
  const field = conditionEl.querySelector('.field').value;
  const valueInput = conditionEl.querySelector('.value');
  const picker = conditionEl.querySelector('.valuePicker');
  const meta = picker.querySelector('.pickerMeta');
  const list = picker.querySelector('.pickerList');

  meta.textContent = t('pickerLoading');
  list.replaceChildren();

  const cache = await ensureValueCandidates();
  const candidates = cache.byField[field] || [];
  const candidateSet = new Set(candidates);
  const selected = new Set(
    parseCsvValues(valueInput.value).filter(value => candidateSet.has(value))
  );
  valueInput.value = [...selected].join(', ');

  if (!candidates.length) {
    meta.textContent = t('noCandidates', { field });
    return;
  }

  meta.textContent = t('fieldValuesLabel', { field, count: candidates.length });
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

  picker.classList.remove('hidden');
  try {
    await renderPickerValues(conditionEl);
  } catch (e) {
    picker.querySelector('.pickerMeta').textContent = t('failedToLoadCandidates', { message: String(e.message || e) });
    picker.querySelector('.pickerList').replaceChildren();
  }
}

function addCondition(container, seed = {}) {
  const node = conditionTpl.content.firstElementChild.cloneNode(true);
  const opSelect = node.querySelector('.op');
  const fieldSelect = node.querySelector('.field');
  const pickBtn = node.querySelector('.pickValues');

  localizeConditionNode(node);

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

  localizeRuleNode(node);

  node.querySelector('.priority').value = seed.priority ?? 1;
  node.querySelector('.actionType').value = seed.action?.type ?? 'add';
  node.querySelector('.actionValue').value = seed.action?.value ?? 0;

  node.querySelector('.remove').onclick = () => node.remove();
  node.querySelector('.addCondition').onclick = () => addCondition(conditionsEl);

  const conditions = seed.conditions?.length ? seed.conditions : [{ field: 'option1', op: 'in', value: [] }];
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
    headers: await buildApiHeaders(),
    body: JSON.stringify(body)
  });
  let payload;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) payload = await res.json();
  else payload = await res.text();

  if (!res.ok) {
    const err = new Error(typeof payload === 'object' ? payload?.error || JSON.stringify(payload) : String(payload));
    if (payload?.authUrl) err.authUrl = payload.authUrl;
    if (payload?.paywall) err.paywall = payload.paywall;
    if (payload?.usage) err.usage = payload.usage;
    throw err;
  }
  return payload;
}

async function trackPaywallEvent(name, payload) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: await buildApiHeaders(),
      body: JSON.stringify({ name, shop: getShop(), payload })
    });
  } catch {
    // Analytics must not block the primary workflow.
  }
}

function hidePaywall() {
  paywallEl.classList.add('hidden');
  paywallEl.replaceChildren();
  document.getElementById('apply').disabled = false;
}

function getPaywallMessage(usage) {
  const paywall = usage?.paywall;
  if (!paywall?.shouldBlockApply) return '';
  const vars = {
    variants: usage.affectedVariantsInThisPreview,
    cap: paywall.kind === 'tasks_over_cap' ? usage.planCaps.tasksPerMonth : usage.planCaps.variantsPerTask,
    plan: paywall.suggestedPlan,
    price: paywall.suggestedPlanPrice
  };
  if (usage.currentPlan === 'free_preview' && paywall.kind === 'tasks_over_cap') return t('tasksOverCap', vars);
  if (usage.currentPlan === 'free_preview') return t('variantsOverCap', vars);
  if (paywall.kind === 'tasks_over_cap') return t('tasksOverCapCurrent', vars);
  return t('variantsOverCapCurrent', vars);
}

function renderPaywall(usage) {
  const paywall = usage?.paywall;
  if (!paywall?.shouldBlockApply) {
    hidePaywall();
    return;
  }

  const message = document.createElement('p');
  message.textContent = getPaywallMessage(usage);

  const link = document.createElement('a');
  const upgradeUrl = new URL(paywall.upgradeUrl || '#', window.location.origin);
  const shop = getShop();
  if (shop) upgradeUrl.searchParams.set('shop', shop);
  link.href = upgradeUrl.toString();
  link.textContent = t('upgradeButton');
  link.onclick = () => {
    trackPaywallEvent('paywall_clicked_upgrade', {
      target_plan: paywall.suggestedPlan,
      paywall_kind: paywall.kind
    });
  };

  paywallEl.replaceChildren(message, link);
  paywallEl.classList.remove('hidden');
  document.getElementById('apply').disabled = true;
  trackPaywallEvent('paywall_shown', { paywall_kind: paywall.kind });
}

function buildUpgradeUrl(plan = 'pro') {
  const url = new URL('/billing/upgrade', window.location.origin);
  url.searchParams.set('plan', plan);
  const shop = getShop();
  if (shop) url.searchParams.set('shop', shop);
  return url.toString();
}

function showSoftPaywall({ featureKey, paywallKind }) {
  const feature = t(featureKey);
  softPaywallTitleEl.textContent = t('softPaywallTitle', { feature });
  softPaywallBodyEl.textContent = t('softPaywallBody', { feature });
  softPaywallUpgradeEl.href = buildUpgradeUrl('pro');
  softPaywallUpgradeEl.textContent = t('upgradeButton');
  softPaywallModalEl.classList.remove('hidden');
  trackPaywallEvent('paywall_shown', { paywall_kind: paywallKind });
}

function hideSoftPaywall() {
  softPaywallModalEl.classList.add('hidden');
}

function renderSim(data) {
  summaryEl.innerHTML = `<b>${t('summaryLabel')}</b>: total=${data.summary.totalVariants}, changed=${data.summary.changedVariants}`;
  renderPaywall(data.usage);
  const rows = data.diffs.map(d => `
    <tr>
      <td>${d.variantId}</td>
      <td>${d.title}</td>
      <td>${d.beforePrice}</td>
      <td class="${d.changed ? 'changed' : ''}">${d.afterPrice}</td>
      <td>${d.changed ? t('changedYes') : t('changedNo')}</td>
    </tr>
  `).join('');

  resultEl.innerHTML = `
    <table class="table">
      <thead><tr><th>${t('tableVariantId')}</th><th>${t('tableTitle')}</th><th>${t('tableBefore')}</th><th>${t('tableAfter')}</th><th>${t('tableChanged')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

applyStaticI18n();

document.getElementById('addRule').onclick = () => addRule();
productIdEl.oninput = () => {
  valueCandidatesCache = null;
};
productIdEl.onblur = () => {
  normalizeProductIdInput();
};
pickProductBtn.onclick = async () => {
  await pickProductWithAppBridge();
};
shopEl.oninput = () => {
  valueCandidatesCache = null;
  refreshShopStatus();
};
connectShopBtn.onclick = () => {
  const shop = getShop();
  if (!shop) {
    shopStatusEl.textContent = t('shopDomainInvalid');
    return;
  }
  window.location.href = getAuthUrl(shop);
};
scheduleToggleBtn.onclick = () => showSoftPaywall({
  featureKey: 'scheduleFeature',
  paywallKind: 'schedule_pro_required'
});
saveTemplateBtn.onclick = () => showSoftPaywall({
  featureKey: 'templateFeature',
  paywallKind: 'template_pro_required'
});
olderHistoryBtn.onclick = () => showSoftPaywall({
  featureKey: 'historyFeature',
  paywallKind: 'history_pro_required'
});
softPaywallCloseBtn.onclick = hideSoftPaywall;
softPaywallModalEl.onclick = event => {
  if (event.target === softPaywallModalEl) hideSoftPaywall();
};
softPaywallUpgradeEl.onclick = () => {
  trackPaywallEvent('paywall_clicked_upgrade', { target_plan: 'pro' });
};

document.getElementById('simulate').onclick = async () => {
  try {
    const data = await request('/api/simulate');
    renderSim(data);
  } catch (e) {
    hidePaywall();
    renderRequestError(t('simulateError'), e);
  }
};

document.getElementById('apply').onclick = async () => {
  try {
    const data = await request('/api/apply');
    const firstError = data.firstError ? `, firstError=${escapeHtml(data.firstError)}` : '';
    hidePaywall();
    summaryEl.innerHTML = `<b>${t('applyDoneLabel')}</b>: jobId=${data.jobId}, changed=${data.changedCount}, errors=${data.errorCount}${firstError}`;
  } catch (e) {
    if (e.paywall) {
      renderPaywall(e.usage || { paywall: e.paywall });
    }
    renderRequestError(t('applyError'), e);
  }
};

addRule({
  priority: 1,
  conditions: [{ field: 'option1', op: 'in', value: [] }],
  action: { type: 'add', value: 0 }
});

(() => {
  const qs = new URLSearchParams(window.location.search);
  const shopFromQuery = normalizeShop(qs.get('shop'));
  if (shopFromQuery) shopEl.value = shopFromQuery;
  if (!shouldShowShopControls(shopFromQuery)) {
    shopSectionEl.classList.add('hidden');
  } else {
    shopSectionEl.classList.remove('hidden');
  }
  normalizeProductIdInput();
  if (getResourcePickerBridge()) {
    setProductInfo(t('resourcePickerAvailable'));
  } else {
    setProductInfo(t('pasteOrOpenForPicker'));
  }
  if (qs.get('installed') === '1') {
    summaryEl.innerHTML = `<b>${t('shopConnected')}</b>: ${t('oauthCompleted')}`;
  }
  refreshShopStatus();
})();
