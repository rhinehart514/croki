export function buildWorkHandoff({ beforeBets, afterBets, beforeWallItems, afterWallItems }) {
  const beforeById = new Map(beforeBets.map((bet) => [bet.id, bet]));
  const beforeWallIds = new Set(beforeWallItems.map((item) => item.id));
  const openedBetIds = afterBets.filter((bet) => !beforeById.has(bet.id)).map((bet) => bet.id);
  const stagedBetIds = afterBets.filter((bet) => {
    const beforeCount = beforeById.get(bet.id)?.staged?.length ?? 0;
    return (bet.staged?.length ?? 0) > beforeCount;
  }).map((bet) => bet.id);
  const wallBetIds = afterWallItems.filter((item) => !beforeWallIds.has(item.id) && item.betId).map((item) => item.betId);
  const changes = { openedBetIds, stagedBetIds, wallBetIds };
  if (![...openedBetIds, ...stagedBetIds, ...wallBetIds].length) return null;
  const parts = [];
  if (openedBetIds.length) parts.push(`${openedBetIds.length} ${openedBetIds.length === 1 ? "bet" : "bets"} opened`);
  if (stagedBetIds.length) parts.push(`work staged on ${stagedBetIds.length}`);
  if (wallBetIds.length) parts.push(`${wallBetIds.length} waiting at the wall`);
  return { content: `Work landed on the canvas — ${parts.join(" · ")}.`, changes };
}
