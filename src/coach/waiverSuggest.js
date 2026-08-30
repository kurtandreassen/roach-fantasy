// Waiver-wire suggestions: cross-references a manually-supplied free-agent
// list (pulled live via Claude-in-Chrome from CBS's Players > Free Agents
// page — no API exists to automate this) against the season's roach-board
// rankings, and flags the roster's weakest player at the same position as a
// possible drop.

/**
 * @param {Array} board - the roachRank-ordered board (from buildBoard).
 * @param {Array<string>} rosterNames - names of players currently owned.
 * @param {Array<string>} freeAgentNames - names of available free agents.
 * @param {number} topN - how many suggestions to return.
 */
function suggestWaivers(board, rosterNames, freeAgentNames, topN = 10) {
  const byName = new Map(board.map((p) => [p.name, p]));
  const rosterSet = new Set(rosterNames);

  const available = freeAgentNames
    .map((name) => byName.get(name))
    .filter(Boolean)
    .sort((a, b) => a.roachRank - b.roachRank);

  const rosterByPos = {};
  for (const name of rosterNames) {
    const p = byName.get(name);
    if (!p) continue;
    (rosterByPos[p.pos] = rosterByPos[p.pos] || []).push(p);
  }
  for (const pos of Object.keys(rosterByPos)) {
    rosterByPos[pos].sort((a, b) => a.roachRank - b.roachRank);
  }

  const suggestions = available.slice(0, topN).map((fa) => {
    const worstAtPos = rosterByPos[fa.pos]?.[rosterByPos[fa.pos].length - 1] || null;
    const isUpgrade = worstAtPos ? fa.roachRank < worstAtPos.roachRank : true;
    return {
      add: fa,
      dropCandidate: worstAtPos,
      isUpgrade,
    };
  });

  return suggestions;
}

module.exports = { suggestWaivers };
