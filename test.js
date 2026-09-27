// Mathematical verification test for Should I Buy This calculator

function getValueScore(costPerUse) {
  if (costPerUse <= 0.50) {
    return 10;
  }
  if (costPerUse <= 20) {
    return 10 - ((costPerUse - 0.5) / 19.5) * 8;
  }
  if (costPerUse <= 50) {
    return 2 - ((costPerUse - 20) / 30) * 2;
  }
  return 0;
}

function getAffordabilityScore(budgetShare) {
  if (budgetShare === null || budgetShare === undefined) {
    return 5;
  }
  if (budgetShare <= 5) {
    return 10;
  }
  if (budgetShare <= 75) {
    return 10 - ((budgetShare - 5) / 70) * 10;
  }
  return 0;
}

function calculateDecision({ price, usesPerMonth, months = 12, budget = null }) {
  const effectiveMonths = (months === null || months === undefined || isNaN(months) || months <= 0) ? 12 : months;
  const totalUses = Math.max(usesPerMonth * effectiveMonths, 1);
  const costPerUse = price / totalUses;
  const budgetShare = (budget !== null && budget !== undefined && !isNaN(budget) && budget > 0)
    ? (price / budget) * 100
    : null;

  const valueScore = getValueScore(costPerUse);
  const affordabilityScore = getAffordabilityScore(budgetShare);

  let combinedScore = valueScore * 0.55 + affordabilityScore * 0.45;
  let isDangerZone = false;

  if (budgetShare !== null && budgetShare > 60) {
    isDangerZone = true;
    combinedScore = Math.min(combinedScore, 3);
  }

  let verdict = '';
  if (combinedScore >= 7) {
    verdict = 'Buy it';
  } else if (combinedScore >= 4) {
    verdict = 'Sleep on it — decide again in 48 hours';
  } else {
    verdict = 'Skip it';
  }

  return {
    price,
    usesPerMonth,
    months: effectiveMonths,
    budget,
    totalUses,
    costPerUse,
    budgetShare,
    valueScore,
    affordabilityScore,
    combinedScore,
    isDangerZone,
    verdict
  };
}

console.log('=== RUNNING SCORING TESTS ===\n');

// Test Case (a): $15 item at 14% vs 16% budget share
console.log('--- Test Case (a): $15 item at 14% vs 16% budget share ---');
// Let's test with realistic monthly use, say 4 uses/month for 6 months (24 uses -> costPerUse = $0.625)
const budgetA1 = 15 / 0.14; // $107.14
const budgetA2 = 15 / 0.16; // $93.75
const resA1 = calculateDecision({ price: 15, usesPerMonth: 4, months: 6, budget: budgetA1 });
const resA2 = calculateDecision({ price: 15, usesPerMonth: 4, months: 6, budget: budgetA2 });
console.log('14% Budget Share:');
console.log(`  Cost per use: $${resA1.costPerUse.toFixed(2)}, Budget Share: ${resA1.budgetShare.toFixed(1)}%`);
console.log(`  Value score: ${resA1.valueScore.toFixed(3)}, Affordability score: ${resA1.affordabilityScore.toFixed(3)}`);
console.log(`  Combined score: ${resA1.combinedScore.toFixed(3)}, Verdict: "${resA1.verdict}"`);

console.log('16% Budget Share:');
console.log(`  Cost per use: $${resA2.costPerUse.toFixed(2)}, Budget Share: ${resA2.budgetShare.toFixed(1)}%`);
console.log(`  Value score: ${resA2.valueScore.toFixed(3)}, Affordability score: ${resA2.affordabilityScore.toFixed(3)}`);
console.log(`  Combined score: ${resA2.combinedScore.toFixed(3)}, Verdict: "${resA2.verdict}"`);
const scoreDiff = Math.abs(resA1.combinedScore - resA2.combinedScore);
console.log(`  Score Difference: ${scoreDiff.toFixed(3)} (smooth change, no abrupt cliff)`);
if (scoreDiff < 0.25 && resA1.verdict === resA2.verdict) {
  console.log('  -> PASS: Test case (a) behaves as a smooth curve with similar results.\n');
} else {
  console.log('  -> CHECK: Test case (a) results above.\n');
}

// Test Case (b): $1-per-use item at 70% budget share
console.log('--- Test Case (b): $1-per-use item at 70% budget share ---');
// Item price $70, 70 uses -> $1 per use, budget $100 -> 70% budget share
const resB = calculateDecision({ price: 70, usesPerMonth: 7, months: 10, budget: 100 });
console.log(`  Price: $${resB.price}, Uses: ${resB.totalUses}, Cost per use: $${resB.costPerUse.toFixed(2)}, Budget Share: ${resB.budgetShare.toFixed(1)}%`);
console.log(`  Value score: ${resB.valueScore.toFixed(3)} (very high)`);
console.log(`  Affordability score: ${resB.affordabilityScore.toFixed(3)} (very low)`);
console.log(`  Combined score before danger cap: ${(resB.valueScore * 0.55 + resB.affordabilityScore * 0.45).toFixed(3)} (pulled down to Sleep on it)`);
console.log(`  Final combined score with danger cap: ${resB.combinedScore.toFixed(3)}, Danger Zone: ${resB.isDangerZone}`);
console.log(`  Verdict: "${resB.verdict}"`);
if (resB.verdict === 'Skip it' && resB.combinedScore <= 3) {
  console.log('  -> PASS: Test case (b) is pulled down hard by affordability and danger zone, not auto-approved.\n');
} else {
  console.log('  -> FAIL: Test case (b)\n');
}

// Test Case (c): 60%+ budget-share danger zone forces "Skip it" even for very cheap per-use item
console.log('--- Test Case (c): 60%+ budget share danger zone forces "Skip it" even for very cheap per-use ---');
// Super cheap per use: $0.10 per use! $65 item used 650 times, budget $100 -> 65% budget share
const resC = calculateDecision({ price: 65, usesPerMonth: 65, months: 10, budget: 100 });
console.log(`  Price: $${resC.price}, Cost per use: $${resC.costPerUse.toFixed(2)} (Value score: ${resC.valueScore.toFixed(2)} / 10)`);
console.log(`  Budget Share: ${resC.budgetShare.toFixed(1)}%`);
console.log(`  Combined score before cap: ${(resC.valueScore * 0.55 + resC.affordabilityScore * 0.45).toFixed(3)}`);
console.log(`  Final combined score after cap: ${resC.combinedScore.toFixed(3)}, Danger Zone: ${resC.isDangerZone}`);
console.log(`  Verdict: "${resC.verdict}"`);
if (resC.verdict === 'Skip it' && resC.isDangerZone && resC.combinedScore <= 3) {
  console.log('  -> PASS: Test case (c) 60%+ danger zone strictly forces "Skip it" despite maximum value score.\n');
} else {
  console.log('  -> FAIL: Test case (c)\n');
}

// Test Case (d): Smooth interpolation continuity checks
console.log('--- Boundary Continuity Tests ---');
console.log(`Value score at $0.50: ${getValueScore(0.5).toFixed(4)} (expected 10)`);
console.log(`Value score at $0.51: ${getValueScore(0.51).toFixed(4)}`);
console.log(`Value score at $19.99: ${getValueScore(19.99).toFixed(4)}`);
console.log(`Value score at $20.00: ${getValueScore(20.00).toFixed(4)} (expected 2)`);
console.log(`Value score at $20.01: ${getValueScore(20.01).toFixed(4)}`);
console.log(`Value score at $49.99: ${getValueScore(49.99).toFixed(4)}`);
console.log(`Value score at $50.00: ${getValueScore(50.00).toFixed(4)} (expected 0)`);
console.log(`Value score at $50.01: ${getValueScore(50.01).toFixed(4)} (expected 0)`);

console.log(`Affordability at 5%: ${getAffordabilityScore(5).toFixed(4)} (expected 10)`);
console.log(`Affordability at 5.1%: ${getAffordabilityScore(5.1).toFixed(4)}`);
console.log(`Affordability at 74.9%: ${getAffordabilityScore(74.9).toFixed(4)}`);
console.log(`Affordability at 75%: ${getAffordabilityScore(75).toFixed(4)} (expected 0)`);
console.log(`Affordability at 75.1%: ${getAffordabilityScore(75.1).toFixed(4)} (expected 0)`);
console.log(`Affordability with no budget (null): ${getAffordabilityScore(null).toFixed(4)} (expected 5)`);
