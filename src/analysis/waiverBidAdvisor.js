// FAAB bid advisor: how much to bid on a waiver target and why it matters,
// calibrated against the league's own bid history when there's enough of
// it, falling back to position-tier defaults when there isn't.

// Rough starting-point bids by position when no league bid history exists
// yet — skill positions worth fighting for, K/DST rarely worth much FAAB
// in a league this shallow at those spots.
const DEFAULT_BASELINE = { QB: 6, RB: 15, WR: 12, TE: 8, K: 1, DST: 2 };

const MAX_BUDGET_SHARE = 0.4; // never recommend blowing more than this much of what's left on one add

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * League bid comps for one position: what similar pickups have actually
 * gone for, from synced bid history.
 */
function positionComps(bidHistory, pos) {
  const atPos = bidHistory.filter((b) => b.pos === pos);
  const won = atPos.filter((b) => b.won);
  const amounts = (won.length ? won : atPos).map((b) => b.amount).filter((n) => typeof n === 'number');
  if (!amounts.length) return null;
  return {
    median: median(amounts),
    max: Math.max(...amounts),
    min: Math.min(...amounts),
    sampleSize: atPos.length,
    wonCount: won.length,
  };
}

/**
 * Recommends a FAAB bid for one waiver target.
 * @param {Object} fa - the free agent from the board {name,pos,roachRank,proj}
 * @param {Object|null} dropCandidate - the roster player they'd likely replace
 * @param {Array} bidHistory - flat list from bidStore.allBids()
 * @param {number|null} remainingBudget - my remaining FAAB, or null if not synced
 * @param {string|null} myGapPos - my board-confirmed weakest position, from positionalGaps
 * @param {Object|null} trendAlert - matching entry from trendAlerts.rising, if this player is on one
 */
function adviseBid(fa, dropCandidate, bidHistory, remainingBudget, myGapPos, trendAlert) {
  const comps = positionComps(bidHistory, fa.pos);
  let baseline = comps ? comps.median : DEFAULT_BASELINE[fa.pos] ?? 5;

  const reasons = [];
  let multiplier = 1;

  if (fa.pos === myGapPos) {
    multiplier += 0.5;
    reasons.push(`Fills your current weakest starting position (${myGapPos}) — a real lineup upgrade, not just bench depth.`);
  }
  if (trendAlert) {
    multiplier += 0.3;
    reasons.push(`On a 3-week rising trend: ${trendAlert.last3.join(' → ')} pts — the league will notice too, so waiting a week risks losing him for more.`);
  }
  if (dropCandidate) {
    if (fa.roachRank < dropCandidate.roachRank) {
      reasons.push(`Would replace ${dropCandidate.name} (#${dropCandidate.roachRank}) at ${fa.pos} on your roster — a direct rank upgrade to #${fa.roachRank}.`);
    } else {
      reasons.push(`Your worst rostered ${fa.pos} is ${dropCandidate.name} (#${dropCandidate.roachRank}), still a better rank than this pickup (#${fa.roachRank}) — this is depth/handcuff insurance, not a lineup upgrade.`);
    }
  }

  let suggestedBid = Math.round(baseline * multiplier);

  let budgetNote = null;
  if (remainingBudget != null) {
    const cap = Math.floor(remainingBudget * MAX_BUDGET_SHARE);
    if (suggestedBid > cap) {
      budgetNote = `Capped at ${Math.round(MAX_BUDGET_SHARE * 100)}% of your remaining $${remainingBudget} (the uncapped ask was $${suggestedBid}) — no single waiver add should risk that much of a season-long budget.`;
      suggestedBid = cap;
    }
  }
  suggestedBid = Math.max(1, suggestedBid);

  if (comps) {
    reasons.push(`League bid history: comparable ${fa.pos} pickups have gone for $${comps.min}-$${comps.max} (median $${comps.median}, ${comps.wonCount} of ${comps.sampleSize} bids won) — this estimate is calibrated to what your league actually pays, not a guess.`);
  } else {
    reasons.push(`No synced bid history for ${fa.pos} yet — this is a position-tier default estimate. Log a few completed waiver results to sharpen future recommendations.`);
  }
  if (budgetNote) reasons.push(budgetNote);
  if (remainingBudget != null) {
    reasons.push(`That's ${Math.round((suggestedBid / remainingBudget) * 100)}% of your remaining $${remainingBudget} FAAB.`);
  }

  let importance = 'speculative';
  if (fa.pos === myGapPos && trendAlert) importance = 'must-bid';
  else if (fa.pos === myGapPos || trendAlert) importance = 'worth-a-bid';

  return { suggestedBid, importance, comps, reasons };
}

module.exports = { adviseBid, positionComps, DEFAULT_BASELINE, MAX_BUDGET_SHARE };
