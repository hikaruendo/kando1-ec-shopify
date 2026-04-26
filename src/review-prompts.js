import { countCriticalEvents } from './db/events-repo.js';

const REVIEW_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldPromptForReview(shop, trigger, { now = Date.now } = {}) {
  if (!shop) return false;
  const currentTime = Number(now());
  const recentPromptCount = countCriticalEvents({
    shop,
    name: 'review_prompt_shown',
    since: currentTime - REVIEW_PROMPT_COOLDOWN_MS
  });
  if (recentPromptCount > 0) return false;

  if (trigger === 'undo_succeeded') return true;

  if (trigger === 'apply_succeeded') {
    const applyCount = countCriticalEvents({ shop, name: 'apply_succeeded' });
    return applyCount === 2;
  }

  return false;
}
