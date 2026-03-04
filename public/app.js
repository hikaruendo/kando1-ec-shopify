const rulesEl = document.getElementById('rules');
const ruleTpl = document.getElementById('ruleTpl');
const conditionTpl = document.getElementById('conditionTpl');
const summaryEl = document.getElementById('summary');
const resultEl = document.getElementById('result');

function addCondition(container) {
  const node = conditionTpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.removeCondition').onclick = () => node.remove();
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
    addCondition(conditionsEl);
    const last = conditionsEl.lastElementChild;
    last.querySelector('.field').value = c.field;
    last.querySelector('.op').value = c.op;
    last.querySelector('.value').value = c.value;
  }

  rulesEl.appendChild(node);
}

function collectRules() {
  return [...rulesEl.querySelectorAll('.rule')].map(rule => ({
    priority: Number(rule.querySelector('.priority').value || 999),
    conditions: [...rule.querySelectorAll('.condition')].map(c => ({
      field: c.querySelector('.field').value,
      op: c.querySelector('.op').value,
      value: c.querySelector('.value').value
    })),
    action: {
      type: rule.querySelector('.actionType').value,
      value: Number(rule.querySelector('.actionValue').value || 0)
    }
  }));
}

async function request(path) {
  const productId = document.getElementById('productId').value.trim();
  const body = { productId, rules: collectRules() };
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
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
document.getElementById('simulate').onclick = async () => {
  try {
    const data = await request('/api/simulate');
    renderSim(data);
  } catch (e) {
    summaryEl.textContent = `simulate error: ${String(e.message || e)}`;
  }
};

document.getElementById('apply').onclick = async () => {
  try {
    const data = await request('/api/apply');
    summaryEl.innerHTML = `<b>apply done</b>: jobId=${data.jobId}, changed=${data.changedCount}, errors=${data.errorCount}`;
  } catch (e) {
    summaryEl.textContent = `apply error: ${String(e.message || e)}`;
  }
};

addRule({
  priority: 1,
  conditions: [
    { field: 'option1', op: 'startsWith', value: 'Black' },
    { field: 'option2', op: 'equals', value: 'Pro' }
  ],
  action: { type: 'add', value: 300 }
});
