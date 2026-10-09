// Provably fair check, run in every viewer's browser. Must match proofText() in server/src/draw.js.
export const proofText = ({ actionId, category, assignments, salt }) =>
  `PicklePro|v1|${actionId}|${category}|${assignments.map(a => `${a.teamNumber}=${a.name}`).join(';')}|${salt}`;

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// true = the revealed result is exactly what was sealed before the spin; false = mismatch;
// null = nothing to check (older draws made before sealing existed).
export async function verify(reveal) {
  if (!reveal?.commitment || !reveal.salt || !reveal.assignments || !crypto.subtle) return null;
  return (await sha256(proofText(reveal))) === reveal.commitment;
}
