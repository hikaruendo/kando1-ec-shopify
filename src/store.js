export const oauthStates = new Map();
let seq = 1;

export function nextJobId() {
  return `job_${String(seq++).padStart(6, '0')}`;
}

export function saveOauthState(state, shop) {
  oauthStates.set(state, { shop, createdAt: Date.now() });
}

export function consumeOauthState(state) {
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  return entry;
}
