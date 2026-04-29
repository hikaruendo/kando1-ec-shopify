import crypto from 'node:crypto';

export const oauthStates = new Map();

export function nextJobId() {
  return `job_${crypto.randomUUID()}`;
}

export function saveOauthState(state, shop) {
  oauthStates.set(state, { shop, createdAt: Date.now() });
}

export function consumeOauthState(state) {
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  return entry;
}
