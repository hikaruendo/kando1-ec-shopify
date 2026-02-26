export const jobs = new Map();
let seq = 1;

export function nextJobId() {
  return `job_${String(seq++).padStart(6, '0')}`;
}
