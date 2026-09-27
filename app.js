/**
 * Should I Buy This — Purchase Decision Calculator
 * Continuous scoring model implementation with zero cliff-edge cutoffs.
 */

// ============================================================================
// Core Calculation & Scoring Logic
// ============================================================================

/**
 * Value score (0–10) based on costPerUse, using a continuous linear ramp:
 * - costPerUse <= 0.50 -> 10
 * - 0.50 < costPerUse <= 20 -> linearly interpolate from 10 down to 2
 *   formula: 10 - ((costPerUse - 0.5) / 19.5) * 8
 * - 20 < costPerUse <= 50 -> linearly interpolate from 2 down to 0
 *   formula: 2 - ((costPerUse - 20) / 30) * 2
 * - costPerUse > 50 -> 0
 */
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

/**
 * Affordability score (0–10) based on budgetShare, also a smooth ramp:
 * - If no budget entered -> 5 (mild unknown caution, not a free pass or penalty)
 * - budgetShare <= 5 -> 10
 * - 5 < budgetShare <= 75 -> linearly interpolate from 10 down to 0
 *   formula: 10 - ((budgetShare - 5) / 70) * 10
 * - budgetShare > 75 -> 0
 */
function getAffordabilityScore(budgetShare) {
  if (budgetShare === null || budgetShare === undefined || isNaN(budgetShare)) {
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

/**
 * Perform all calculations and scoring for a given purchase evaluation
 */
function evaluatePurchase({ price, usesPerMonth, months, budget }) {
  if (isNaN(price) || price <= 0 || isNaN(usesPerMonth) || usesPerMonth <= 0) {
    return null;
  }

  const effectiveMonths = (isNaN(months) || months <= 0) ? 12 : months;
  const totalUses = Math.max(usesPerMonth * effectiveMonths, 1);
  const costPerUse = price / totalUses;

  const hasBudget = budget !== null && budget !== undefined && !isNaN(budget) && budget > 0;
  const budgetShare = hasBudget ? (price / budget) * 100 : null;

  const valueScore = getValueScore(costPerUse);
  const affordabilityScore = getAffordabilityScore(budgetShare);

  // Combined score: Value 55%, Affordability 45%
  let combinedScore = valueScore * 0.55 + affordabilityScore * 0.45;

  // Hard override: "danger zone"
  // If budget was entered AND budgetShare > 60, cap combined score at max 3
  let isDangerZone = false;
  if (hasBudget && budgetShare > 60) {
    isDangerZone = true;
    combinedScore = Math.min(combinedScore, 3);
  }

  // Clamp combined score between 0 and 10
  combinedScore = Math.max(0, Math.min(10, combinedScore));

  // Verdict bands
  let verdict = '';
  let verdictClass = '';
  let verdictIcon = '';

  if (combinedScore >= 7) {
    verdict = 'Buy it';
    verdictClass = 'verdict-buy';
    verdictIcon = '✅';
  } else if (combinedScore >= 4) {
    verdict = 'Sleep on it — decide again in 48 hours';
    verdictClass = 'verdict-sleep';
    verdictIcon = '⏳';
  } else {
    verdict = 'Skip it';
    verdictClass = 'verdict-skip';
    verdictIcon = '🛑';
  }

  // Plain conversational reasoning (NO jargon like "score" or "weighted")
  const reasoning = getConversationalReasoning({
    verdict,
    isDangerZone,
    hasBudget,
    costPerUse,
    totalUses,
    budgetShare,
    valueScore,
    affordabilityScore
  });

  const opportunityCost = getOpportunityCost(price);

  return {
    price,
    usesPerMonth,
    months: effectiveMonths,
    budget: hasBudget ? budget : null,
    totalUses,
    costPerUse,
    budgetShare,
    valueScore,
    affordabilityScore,
    combinedScore,
    isDangerZone,
    verdict,
    verdictClass,
    verdictIcon,
    reasoning,
    opportunityCost
  };
}

/**
 * Calculate intuitive real-world opportunity cost equivalencies
 */
function getOpportunityCost(price) {
  if (isNaN(price) || price <= 0) return '—';
  if (price < 12) {
    const coffees = (price / 5).toFixed(1);
    return `≈ ${coffees} coffees ($5)`;
  }
  if (price < 40) {
    const months = (price / 15).toFixed(1);
    return `≈ ${months} streaming subs ($15)`;
  }
  if (price < 120) {
    const meals = (price / 25).toFixed(1);
    return `≈ ${meals} takeout meals ($25)`;
  }
  if (price < 400) {
    const groceries = (price / 75).toFixed(1);
    return `≈ ${groceries} grocery trips ($75)`;
  }
  const hours = (price / 25).toFixed(0);
  return `≈ ${hours} work hours (@ $25/hr)`;
}

/**
 * Generate a 1-sentence plain conversational explanation referencing
 * whichever factor (value or affordability) drove the verdict.
 * STRICT RULE: No jargon like "score", "weighted", "formula", or "points".
 */
function getConversationalReasoning({
  verdict,
  isDangerZone,
  hasBudget,
  costPerUse,
  budgetShare,
  valueScore,
  affordabilityScore
}) {
  const formattedCost = costPerUse < 1
    ? `${(costPerUse * 100).toFixed(0)}¢`
    : `$${costPerUse.toFixed(2)}`;

  // 1. Danger Zone Override
  if (isDangerZone) {
    if (costPerUse <= 1.0) {
      return `Even though this offers fantastic value per use at ${formattedCost}, spending over 60% of your remaining monthly funds in one purchase is too big of a financial risk right now.`;
    }
    return `This takes up a dangerous amount of your remaining monthly funds, so you should hold off until your budget has more breathing room.`;
  }

  // 2. Verdict: "Buy it"
  if (verdict === 'Buy it') {
    if (hasBudget) {
      if (valueScore >= 8.5 && affordabilityScore >= 8.5) {
        return `At ${formattedCost} per use, this easily pays for itself over time without putting any noticeable strain on your monthly spending money.`;
      }
      if (valueScore >= affordabilityScore) {
        return `The low cost per use makes this a solid long-term investment that you will get plenty of mileage out of.`;
      }
      return `This fits comfortably inside your monthly spending room and provides plenty of everyday utility to justify purchasing.`;
    }
    // Budget omitted
    if (valueScore >= 8.5) {
      return `At ${formattedCost} per use, you will get fantastic mileage out of this purchase to comfortably justify the upfront price.`;
    }
    return `At ${formattedCost} per use across your expected lifetime of use, this is a sensible purchase.`;
  }

  // 3. Verdict: "Sleep on it — decide again in 48 hours"
  if (verdict === 'Sleep on it — decide again in 48 hours') {
    if (hasBudget) {
      if (affordabilityScore < valueScore - 1.0) {
        // Affordability drove it down
        return `While you will get great day-to-day use out of this, it claims a noticeable chunk of your remaining monthly cash, so giving yourself 48 hours will ensure it's truly a priority.`;
      }
      if (valueScore < affordabilityScore - 1.0) {
        // Value per use drove it down
        return `You have the cash available this month, but at ${formattedCost} per use, it is right on the borderline of whether you will use it enough to justify the price.`;
      }
      // Balanced
      return `Both the per-use cost and the dent in your monthly budget are moderate, making this a prime candidate for a 48-hour cooling-off period.`;
    }
    // Budget omitted
    return `At ${formattedCost} per use, it sits right on the edge of reasonable mileage, so giving yourself a 48-hour pause will help you confirm you really need it.`;
  }

  // 4. Verdict: "Skip it"
  if (verdict === 'Skip it') {
    if (hasBudget) {
      if (affordabilityScore < valueScore - 1.0) {
        return `This takes up too large a slice of your monthly spending money to make financial sense right now.`;
      }
      if (valueScore < affordabilityScore - 1.0) {
        return `At ${formattedCost} per use, you simply won't use this frequently enough to justify what you are paying.`;
      }
      return `This is both expensive for how infrequently you will use it and takes a substantial bite out of this month's remaining budget.`;
    }
    // Budget omitted
    return `At ${formattedCost} per use, the price is far too high for how rarely you expect to use it.`;
  }

  return 'Review the numbers above to decide if this purchase makes sense for you.';
}

// ============================================================================
// State Management & Local Storage
// ============================================================================

const STORAGE_KEY = 'should_i_buy_this_history_v1';

let currentEvaluation = null;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading history from localStorage:', err);
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Error saving history to localStorage:', err);
  }
}

// ============================================================================
// DOM Elements
// ============================================================================

const form = document.getElementById('calculator-form');
const itemNameInput = document.getElementById('item-name');
const priceInput = document.getElementById('price');
const usesPerMonthInput = document.getElementById('uses-per-month');
const monthsInput = document.getElementById('months');
const budgetInput = document.getElementById('budget');
const resetBtn = document.getElementById('reset-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Metrics elements
const metricTotalUses = document.getElementById('metric-total-uses');
const metricUsesSub = document.getElementById('metric-uses-sub');
const metricCostPerUse = document.getElementById('metric-cost-per-use');
const metricCostSub = document.getElementById('metric-cost-sub');
const metricBudgetShare = document.getElementById('metric-budget-share');
const metricBudgetSub = document.getElementById('metric-budget-sub');
const metricOpportunity = document.getElementById('metric-opportunity');

// Verdict & reasoning elements
const dangerZoneAlert = document.getElementById('danger-zone-alert');
const verdictBanner = document.getElementById('verdict-banner');
const verdictIcon = document.getElementById('verdict-icon');
const verdictText = document.getElementById('verdict-text');
const reasoningText = document.getElementById('reasoning-text');

// Utility & Backup controls
const printSlipBtn = document.getElementById('print-slip-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const backupJsonBtn = document.getElementById('backup-json-btn');
const restoreJsonBtn = document.getElementById('restore-json-btn');
const importJsonInput = document.getElementById('import-json-input');

// History & Stats elements
const statsBanner = document.getElementById('stats-banner');
const statPercent = document.getElementById('stat-percent');
const statHeading = document.getElementById('stat-heading');
const statDetails = document.getElementById('stat-details');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

// ============================================================================
// UI Updates & Rendering
// ============================================================================

/**
 * Read current inputs from the form
 */
function getFormValues() {
  const itemName = itemNameInput.value.trim();
  const price = parseFloat(priceInput.value);
  const usesPerMonth = parseFloat(usesPerMonthInput.value);
  const monthsVal = monthsInput.value.trim();
  const months = monthsVal !== '' ? parseFloat(monthsVal) : 12;
  const budgetVal = budgetInput.value.trim();
  const budget = budgetVal !== '' ? parseFloat(budgetVal) : null;

  return { itemName, price, usesPerMonth, months, budget };
}

/**
 * Update the live preview calculation whenever any input changes
 */
function updateLivePreview() {
  const values = getFormValues();

  // If price or usesPerMonth are not yet filled or valid, show idle/placeholder state
  if (isNaN(values.price) || values.price <= 0 || isNaN(values.usesPerMonth) || values.usesPerMonth <= 0) {
    currentEvaluation = null;
    renderIdleState();
    return;
  }

  const result = evaluatePurchase(values);
  currentEvaluation = result;
  renderEvaluation(result);
}

/**
 * Render idle state when inputs are incomplete
 */
function renderIdleState() {
  if (dangerZoneAlert) dangerZoneAlert.classList.add('hidden');

  if (metricTotalUses) metricTotalUses.textContent = '—';
  if (metricUsesSub) metricUsesSub.textContent = 'uses/month × months';

  if (metricCostPerUse) metricCostPerUse.textContent = '—';
  if (metricCostSub) metricCostSub.textContent = 'price ÷ total uses';

  if (metricBudgetShare) metricBudgetShare.textContent = '—';
  if (metricBudgetSub) metricBudgetSub.textContent = 'percentage of monthly room';

  if (metricOpportunity) metricOpportunity.textContent = '—';

  if (verdictBanner) verdictBanner.className = 'rubber-stamp verdict-empty';
  if (verdictIcon) verdictIcon.textContent = '';
  if (verdictText) verdictText.textContent = 'Awaiting Input';

  if (reasoningText) reasoningText.textContent = 'Fill in price and usage frequency above to calculate whether this purchase is justified.';
}

/**
 * Render active calculation results
 */
function renderEvaluation(result) {
  // 1. Danger Zone Banner
  if (dangerZoneAlert) {
    if (result.isDangerZone) {
      dangerZoneAlert.classList.remove('hidden');
    } else {
      dangerZoneAlert.classList.add('hidden');
    }
  }

  // 2. Metric 1: Total Uses
  const usesFormatted = Number.isInteger(result.totalUses)
    ? result.totalUses.toLocaleString('en-US')
    : result.totalUses.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (metricTotalUses) metricTotalUses.textContent = usesFormatted;
  if (metricUsesSub) metricUsesSub.textContent = `${result.usesPerMonth}/mo × ${result.months} ${result.months === 1 ? 'month' : 'months'}`;

  // 3. Metric 2: Cost Per Use
  if (metricCostPerUse) metricCostPerUse.textContent = `$ ${result.costPerUse.toFixed(2)}`;
  if (metricCostSub) metricCostSub.textContent = `$${result.price.toFixed(2)} ÷ ${usesFormatted} uses`;

  // 4. Metric 3: Budget Share
  if (metricBudgetShare) {
    if (result.budgetShare !== null) {
      metricBudgetShare.textContent = `${result.budgetShare.toFixed(1)}%`;
      if (metricBudgetSub) metricBudgetSub.textContent = `$${result.price.toFixed(2)} of $${result.budget.toFixed(2)} left`;
    } else {
      metricBudgetShare.textContent = 'Unentered';
      if (metricBudgetSub) metricBudgetSub.textContent = 'Evaluated with neutral caution (5/10)';
    }
  }

  // 5. Metric 4: Opportunity Cost Equivalency
  if (metricOpportunity) {
    metricOpportunity.textContent = result.opportunityCost || getOpportunityCost(result.price);
  }

  // 6. Rubber Stamp Verdict Banner
  if (verdictBanner) {
    verdictBanner.className = `rubber-stamp ${result.verdictClass}`;
  }
  if (verdictText) {
    verdictText.textContent = result.verdict.toUpperCase();
  }

  // 7. Conversational Reasoning
  if (reasoningText) reasoningText.textContent = result.reasoning;
}

/**
 * Render the decision history and update running advice statistics
 */
function renderHistory() {
  const history = loadHistory();

  // Empty state
  if (history.length === 0) {
    historyList.innerHTML = '';
    if (historyEmpty) historyEmpty.style.display = 'block';
    renderStats(history);
    return;
  }

  if (historyEmpty) historyEmpty.style.display = 'none';

  const now = Date.now();
  let html = '';
  history.forEach((entry) => {
    const timeString = formatRelativeTime(entry.timestamp);
    const itemName = escapeHtml(entry.itemName || 'Untitled Purchase');
    const priceFormatted = `$${entry.price.toFixed(2)}`;
    const costPerUseFormatted = `$${entry.costPerUse.toFixed(2)}`;
    const totalUsesFormatted = Number.isInteger(entry.totalUses)
      ? entry.totalUses
      : entry.totalUses.toFixed(1);

    const budgetShareText = entry.budgetShare !== null
      ? `${entry.budgetShare.toFixed(1)}%`
      : 'Unspecified';

    let boxClass = 'box-sleep';
    if (entry.verdict === 'Buy it') boxClass = 'box-buy';
    if (entry.verdict === 'Skip it') boxClass = 'box-skip';

    const isBought = entry.userAction === 'bought';
    const isSkipped = entry.userAction === 'skipped';

    // 48-Hour Cooling Timer (for "Sleep on it" decisions)
    let coolingTimerHtml = '';
    if (entry.verdict && entry.verdict.startsWith('Sleep on it')) {
      const expiry = entry.timestamp + (48 * 60 * 60 * 1000);
      const remainingMs = expiry - now;
      if (remainingMs > 0) {
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        coolingTimerHtml = `
          <div class="cooling-timer-row">
            <span class="cooling-timer timer-active" data-timestamp="${entry.timestamp}">
              ⏱ COOLING: ${hours}h ${mins}m left
            </span>
          </div>
        `;
      } else {
        coolingTimerHtml = `
          <div class="cooling-timer-row">
            <span class="cooling-timer timer-ready" data-timestamp="${entry.timestamp}">
              ⏱ 48H COOLED: Ready to decide
            </span>
          </div>
        `;
      }
    }

    html += `
      <article class="history-entry-row" data-id="${entry.id}">
        <div class="history-entry-top">
          <span class="entry-name">${itemName}</span>
          <span class="entry-verdict-box ${boxClass}">${escapeHtml(entry.verdict.toUpperCase())}</span>
        </div>

        <div class="history-entry-details">
          <span>${priceFormatted}</span>
          <span>${costPerUseFormatted}/use</span>
          <span>${totalUsesFormatted} uses</span>
          <span>${budgetShareText}</span>
          <span>${timeString}</span>
        </div>

        ${coolingTimerHtml}

        <div class="history-entry-controls">
          <div class="outcome-buttons">
            <button
              type="button"
              class="receipt-tag-btn btn-bought ${isBought ? 'active-bought' : ''}"
              data-id="${entry.id}"
              data-action="bought"
              aria-pressed="${isBought}"
            >
              ${isBought ? '✓ ' : ''}Bought
            </button>
            <button
              type="button"
              class="receipt-tag-btn btn-skipped ${isSkipped ? 'active-skipped' : ''}"
              data-id="${entry.id}"
              data-action="skipped"
              aria-pressed="${isSkipped}"
            >
              ${isSkipped ? '✓ ' : ''}Skipped
            </button>
          </div>

          <div class="entry-link-actions">
            <button
              type="button"
              class="entry-sub-link btn-load"
              data-id="${entry.id}"
              title="Load parameters into ledger"
            >
              Reload
            </button>
            <button
              type="button"
              class="entry-sub-link delete-link btn-delete-entry"
              data-id="${entry.id}"
              aria-label="Delete ${itemName} entry"
            >
              Del
            </button>
          </div>
        </div>
      </article>
    `;
  });

  historyList.innerHTML = html;
  renderStats(history);
}

/**
 * Periodically refresh active 48h cooling timers without recreating the entire tape
 */
function updateActiveCoolingTimers() {
  const timerElements = document.querySelectorAll('.cooling-timer[data-timestamp]');
  if (!timerElements.length) return;
  const now = Date.now();
  timerElements.forEach((el) => {
    const timestamp = parseInt(el.dataset.timestamp, 10);
    if (!timestamp) return;
    const expiry = timestamp + (48 * 60 * 60 * 1000);
    const remainingMs = expiry - now;
    if (remainingMs > 0) {
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      el.className = 'cooling-timer timer-active';
      el.textContent = `⏱ COOLING: ${hours}h ${mins}m left`;
    } else {
      el.className = 'cooling-timer timer-ready';
      el.textContent = '⏱ 48H COOLED: Ready to decide';
    }
  });
}

/**
 * Calculate and display the advice compliance statistic
 */
function renderStats(history) {
  const markedEntries = history.filter(item => item.userAction === 'bought' || item.userAction === 'skipped');

  if (markedEntries.length === 0) {
    if (statPercent) statPercent.textContent = '—';
    if (statHeading) statHeading.textContent = "You've followed the tool's advice —% of the time.";
    if (statDetails) statDetails.textContent = 'Mark decisions below to track your follow rate.';
    return;
  }

  const followedEntries = markedEntries.filter(item => {
    if (item.verdict === 'Buy it') {
      return item.userAction === 'bought';
    }
    if (item.verdict === 'Skip it') {
      return item.userAction === 'skipped';
    }
    if (item.verdict.startsWith('Sleep on it')) {
      return item.userAction === 'skipped';
    }
    return false;
  });

  const percent = Math.round((followedEntries.length / markedEntries.length) * 100);
  if (statPercent) statPercent.textContent = `${percent}%`;
  if (statHeading) statHeading.textContent = `You've followed the tool's advice ${percent}% of the time.`;

  const total = markedEntries.length;
  const count = followedEntries.length;
  if (statDetails) {
    statDetails.textContent = `${count} of ${total} recorded ${total === 1 ? 'decision' : 'decisions'} followed the advice.`;
  }
}

// ============================================================================
// Actions & Event Handlers
// ============================================================================

/**
 * Orchestrated animated reveal sequence:
 * 0. Mechanical paper spool advance.
 * 1. Four metric lines slide & fade in staggered by 140ms.
 * 2. Brief pause (~0.5s).
 * 3. Verdict stamp lands with scale overshoot & rubber-stamp rotation.
 * 4. Explanation text fades in below.
 * Forces DOM reflow so it replays reliably on every recalculate.
 */
function triggerRevealSequence() {
  const resultsSection = document.getElementById('results-section');
  if (!resultsSection) return;

  resultsSection.classList.remove('is-revealing');
  // Trigger DOM reflow to force keyframe restart
  void resultsSection.offsetWidth;
  resultsSection.classList.add('is-revealing');

  // Mobile haptic pulse timed with rubber stamp impact (1250ms delay)
  setTimeout(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([15, 30, 20]);
      } catch (err) {
        // Safe fallback if disallowed
      }
    }
  }, 1250);
}

/**
 * Handle form submission: calculate and save to history
 */
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const values = getFormValues();

  // Basic validation
  if (isNaN(values.price) || values.price <= 0) {
    showLedgerNotice('Please enter a valid price greater than $0.', true);
    priceInput.focus();
    return;
  }

  if (isNaN(values.usesPerMonth) || values.usesPerMonth <= 0) {
    showLedgerNotice('Please enter the expected uses per month (e.g. 4 or 2.5).', true);
    usesPerMonthInput.focus();
    return;
  }

  const result = evaluatePurchase(values);
  if (!result) return;

  renderEvaluation(result);
  triggerRevealSequence();

  // Save to history
  const history = loadHistory();
  const newEntry = {
    id: 'dec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    itemName: values.itemName || 'Untitled Purchase',
    price: result.price,
    usesPerMonth: result.usesPerMonth,
    months: result.months,
    budget: result.budget,
    totalUses: result.totalUses,
    costPerUse: result.costPerUse,
    budgetShare: result.budgetShare,
    verdict: result.verdict,
    timestamp: Date.now(),
    userAction: null // 'bought', 'skipped', or null
  };

  history.unshift(newEntry);
  saveHistory(history);
  renderHistory();

  // Scroll smoothly to results
  document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

/**
 * Live updates on input typing
 */
[itemNameInput, priceInput, usesPerMonthInput, monthsInput, budgetInput].forEach((input) => {
  input.addEventListener('input', updateLivePreview);
});

/**
 * Reset form
 */
resetBtn.addEventListener('click', () => {
  const resultsSection = document.getElementById('results-section');
  if (resultsSection) resultsSection.classList.remove('is-revealing');
  form.reset();
  monthsInput.value = '';
  budgetInput.value = '';
  currentEvaluation = null;
  renderIdleState();
  itemNameInput.focus();
});

/**
 * Clear history
 */
clearHistoryBtn.addEventListener('click', () => {
  const history = loadHistory();
  if (history.length === 0) return;

  if (confirm('Are you sure you want to clear your entire decision history?')) {
    saveHistory([]);
    renderHistory();
  }
});

/**
 * Event delegation for history item interactions:
 * - Mark as Actually bought it
 * - Mark as Actually skipped it
 * - Reload into form
 * - Delete entry
 */
historyList.addEventListener('click', (e) => {
  const target = e.target.closest('button');
  if (!target) return;

  const id = target.dataset.id;
  if (!id) return;

  const history = loadHistory();
  const entryIndex = history.findIndex(item => item.id === id);
  if (entryIndex === -1) return;

  // Toggle bought/skipped action
  if (target.dataset.action) {
    const action = target.dataset.action; // 'bought' or 'skipped'
    const currentAction = history[entryIndex].userAction;

    if (currentAction === action) {
      // Clicking same button again toggles it off
      history[entryIndex].userAction = null;
    } else {
      history[entryIndex].userAction = action;
    }

    saveHistory(history);
    renderHistory();
    return;
  }

  // Reload into form
  if (target.classList.contains('btn-load')) {
    const entry = history[entryIndex];
    itemNameInput.value = entry.itemName === 'Untitled Purchase' ? '' : entry.itemName;
    priceInput.value = entry.price;
    usesPerMonthInput.value = entry.usesPerMonth;
    monthsInput.value = entry.months;
    budgetInput.value = entry.budget !== null ? entry.budget : '';

    updateLivePreview();
    triggerRevealSequence();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // Delete entry with paper tear-off animation
  if (target.classList.contains('btn-delete-entry')) {
    const row = target.closest('.history-entry-row');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([10, 15]); } catch (e) {}
    }

    if (row) {
      row.classList.add('tearing-off');
      setTimeout(() => {
        const freshHistory = loadHistory();
        const freshIndex = freshHistory.findIndex(item => item.id === id);
        if (freshIndex !== -1) {
          freshHistory.splice(freshIndex, 1);
          saveHistory(freshHistory);
        }
        renderHistory();
      }, 340);
    } else {
      history.splice(entryIndex, 1);
      saveHistory(history);
      renderHistory();
    }
    return;
  }
});

// ============================================================================
// Data Backup & Export Handlers
// ============================================================================

/**
 * Display a subtle inline ledger status message without intrusive browser alert popups
 */
function showLedgerNotice(message, isError = false) {
  if (statDetails) {
    const originalText = statDetails.textContent;
    statDetails.textContent = message;
    statDetails.style.color = isError ? 'var(--verdict-skip)' : 'var(--verdict-buy)';
    setTimeout(() => {
      statDetails.textContent = originalText;
      statDetails.style.color = '';
    }, 4500);
  } else {
    console.log(message);
  }
}

function exportToCSV() {
  const history = loadHistory();
  if (history.length === 0) {
    showLedgerNotice('No decisions recorded on this tape yet.', true);
    return;
  }

  const headers = [
    'Item Name',
    'Price ($)',
    'Uses Per Month',
    'Months',
    'Monthly Budget Left ($)',
    'Total Expected Uses',
    'Cost Per Use ($)',
    'Budget Share (%)',
    'Verdict',
    'Action Recorded',
    'Timestamp'
  ];

  const rows = history.map(item => [
    `"${(item.itemName || 'Untitled Purchase').replace(/"/g, '""')}"`,
    item.price.toFixed(2),
    item.usesPerMonth,
    item.months,
    item.budget !== null ? item.budget.toFixed(2) : '',
    item.totalUses,
    item.costPerUse.toFixed(2),
    item.budgetShare !== null ? item.budgetShare.toFixed(1) : '',
    `"${(item.verdict || '').replace(/"/g, '""')}"`,
    item.userAction || 'none',
    new Date(item.timestamp).toISOString()
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `should-i-buy-this-ledger-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showLedgerNotice('✓ CSV export generated successfully.');
}

function backupToJSON() {
  const history = loadHistory();
  if (history.length === 0) {
    showLedgerNotice('No decisions recorded on this tape yet.', true);
    return;
  }

  const jsonStr = JSON.stringify(history, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `should-i-buy-this-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showLedgerNotice('✓ JSON backup downloaded.');
}

function handleRestoreJSON(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed)) {
        showLedgerNotice('Invalid backup format: Expected a JSON array of records.', true);
        return;
      }

      const existing = loadHistory();
      const existingIds = new Set(existing.map(x => x.id));
      let addedCount = 0;

      parsed.forEach(item => {
        if (item && item.price && item.usesPerMonth) {
          const validId = item.id || ('dec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
          if (!existingIds.has(validId)) {
            existing.push({
              id: validId,
              itemName: item.itemName || 'Untitled Purchase',
              price: Number(item.price),
              usesPerMonth: Number(item.usesPerMonth),
              months: Number(item.months || 12),
              budget: item.budget !== null && item.budget !== undefined ? Number(item.budget) : null,
              totalUses: Number(item.totalUses || Math.max(item.usesPerMonth * (item.months || 12), 1)),
              costPerUse: Number(item.costPerUse || (item.price / Math.max(item.usesPerMonth * (item.months || 12), 1))),
              budgetShare: item.budgetShare !== null && item.budgetShare !== undefined ? Number(item.budgetShare) : null,
              verdict: item.verdict || 'Decision',
              timestamp: item.timestamp || Date.now(),
              userAction: item.userAction || null
            });
            existingIds.add(validId);
            addedCount++;
          }
        }
      });

      existing.sort((a, b) => b.timestamp - a.timestamp);
      saveHistory(existing);
      renderHistory();
      showLedgerNotice(`✓ Ledger restored: ${addedCount} records merged onto tape.`);
    } catch (err) {
      console.error(err);
      showLedgerNotice('Error parsing JSON backup file.', true);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// Utility and Backup button listeners
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(10); } catch (e) {}
    }
    exportToCSV();
  });
}

if (backupJsonBtn) {
  backupJsonBtn.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(10); } catch (e) {}
    }
    backupToJSON();
  });
}

if (restoreJsonBtn && importJsonInput) {
  restoreJsonBtn.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(10); } catch (e) {}
    }
    importJsonInput.click();
  });
  importJsonInput.addEventListener('change', handleRestoreJSON);
}

if (printSlipBtn) {
  printSlipBtn.addEventListener('click', () => {
    window.print();
  });
}

// ============================================================================
// Quick Test Presets
// ============================================================================

const PRESETS = {
  'case-a1': {
    itemName: 'Portable Bluetooth Speaker (14% Budget)',
    price: 15.00,
    usesPerMonth: 4,
    months: 6,
    budget: 107.14 // exactly 14% budget share
  },
  'case-a2': {
    itemName: 'Portable Bluetooth Speaker (16% Budget)',
    price: 15.00,
    usesPerMonth: 4,
    months: 6,
    budget: 93.75 // exactly 16% budget share
  },
  'case-b': {
    itemName: 'Designer Sunglasses ($1/use @ 70% Budget)',
    price: 70.00,
    usesPerMonth: 7,
    months: 10, // 70 total uses -> exactly $1.00/use
    budget: 100.00 // exactly 70% budget share -> pulled down by affordability & danger zone
  },
  'case-c': {
    itemName: 'Bulk Drafting Pens ($0.10/use @ 65% Budget)',
    price: 65.00,
    usesPerMonth: 65,
    months: 10, // 650 total uses -> $0.10/use (perfect 10/10 value)
    budget: 100.00 // 65% budget share -> danger zone forces Skip It!
  },
  'sleep-case': {
    itemName: 'Espresso Machine ($10/use @ 40% Budget)',
    price: 80.00,
    usesPerMonth: 2,
    months: 4, // 8 uses -> $10.00/use
    budget: 200.00 // 40% budget share -> Sleep on it
  }
};

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(10); } catch (e) {}
    }
    const presetKey = btn.dataset.preset;
    const preset = PRESETS[presetKey];
    if (!preset) return;

    itemNameInput.value = preset.itemName;
    priceInput.value = preset.price;
    usesPerMonthInput.value = preset.usesPerMonth;
    monthsInput.value = preset.months;
    budgetInput.value = preset.budget !== null ? preset.budget : '';

    updateLivePreview();
    triggerRevealSequence();
  });
});

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

// ============================================================================
// Initial Page Load
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  const receiptDateTime = document.getElementById('receipt-date-time');
  if (receiptDateTime) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    receiptDateTime.textContent = `ENTRY ${year}.${month}.${day}`;
  }
  renderIdleState();
  renderHistory();

  // Periodic refresh for active 48-hour cooling timers
  setInterval(updateActiveCoolingTimers, 60000);
});
