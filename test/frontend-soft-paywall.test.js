import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('soft paywall UI exposes Pro feature entry points and tracking kinds', async () => {
  const [html, js, css] = await Promise.all([
    readFile('public/index.html', 'utf8'),
    readFile('public/app.js', 'utf8'),
    readFile('public/app.css', 'utf8')
  ]);

  for (const id of [
    'usageMeter',
    'usagePlan',
    'usageHeadline',
    'usageTasksLabel',
    'usageTasksBar',
    'usageVariantsLabel',
    'usageVariantsBar',
    'usageUpgrade',
    'scheduleToggle',
    'saveTemplate',
    'olderHistory',
    'softPaywallModal',
    'softPaywallUpgrade',
    'softPaywallClose'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const key of [
    'scheduleButton',
    'saveTemplateButton',
    'olderHistoryButton',
    'softPaywallTitle',
    'softPaywallBody'
  ]) {
    assert.match(js, new RegExp(`${key}:`));
  }

  for (const key of [
    'usageRemaining',
    'usageTasksLabel',
    'usageVariantsLabel',
    'usageLoadFailed'
  ]) {
    assert.match(js, new RegExp(`${key}:`));
  }

  for (const kind of [
    'schedule_pro_required',
    'template_pro_required',
    'history_pro_required'
  ]) {
    assert.match(js, new RegExp(kind));
  }

  assert.match(js, /paywall_clicked_upgrade/);
  assert.match(js, /shopify\.reviews\.request/);
  assert.match(js, /review_prompt_shown/);
  assert.match(js, /review_prompt_dismissed/);
  assert.match(js, /buildUpgradeUrl\('pro'\)/);
  assert.match(js, /refreshUsageMeter/);
  assert.match(css, /\.usageMeter/);
  assert.match(css, /\.modalBackdrop/);
});
