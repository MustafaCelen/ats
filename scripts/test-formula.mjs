/**
 * Formula unit tests for the KW commission calculation logic.
 * Run with: node scripts/test-formula.mjs
 */

let passed = 0;
let failed = 0;

function assert(label, actual, expected, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${label}: ${actual.toFixed(2)}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: got ${actual.toFixed(2)}, expected ${expected.toFixed(2)}`);
    failed++;
  }
}

// Mirrors the calcAgentBreakdown function in Closings.tsx
function calcAgentBreakdown(saleValue, splitPct, ukEnabled = false, ukRate = 0, capUsedSoFar = 0, capAmount = null) {
  const sideBHB = saleValue * 0.02;
  const bhbShare = sideBHB * (splitPct / 100);
  const mainBranchShare = bhbShare * 0.10;         // KWTR = 10%
  const kwtrKdv = mainBranchShare * 0.20;          // 20% KDV on KWTR

  const marketCenterDue = (bhbShare - mainBranchShare) * 0.30;  // 27% effective

  const marketCenterActual = capAmount === null
    ? marketCenterDue
    : Math.min(marketCenterDue, Math.max(0, capAmount - capUsedSoFar));
  const capUsedAfter = capUsedSoFar + marketCenterActual;

  const bmKdv = marketCenterDue > 0
    ? marketCenterActual * (0.016 / 0.27)
    : 0;

  const ukShare = ukEnabled ? bhbShare * ukRate : 0;

  const employeeNet = bhbShare - mainBranchShare - kwtrKdv - marketCenterActual - bmKdv - ukShare;

  return { bhbShare, mainBranchShare, kwtrKdv, marketCenterDue, marketCenterActual, bmKdv, ukShare, employeeNet, capUsedAfter };
}

// ── Test 1: Standard single-agent, no cap ─────────────────────────────────────
console.log("\nTest 1: Standard deal (5,000,000 TL, 100% split, no cap)");
{
  // sideBHB = 5,000,000 × 2% = 100,000
  // KWTR = 100,000 × 10% = 10,000
  // kwtrKdv = 10,000 × 20% = 2,000
  // BM = (100,000 - 10,000) × 30% = 27,000
  // bmKdv = 27,000 × (0.016/0.27) = 1,600
  // net = 100,000 - 10,000 - 2,000 - 27,000 - 1,600 = 59,400
  const r = calcAgentBreakdown(5_000_000, 100);
  assert("BHB", r.bhbShare, 100_000);
  assert("KWTR (10%)", r.mainBranchShare, 10_000);
  assert("KWTR KDV (20%)", r.kwtrKdv, 2_000);
  assert("BM (27% effective)", r.marketCenterActual, 27_000);
  assert("BM KDV (1.6% of BHB)", r.bmKdv, 1_600);
  assert("Danışman Net", r.employeeNet, 59_400);
}

// ── Test 2: 50/50 split ───────────────────────────────────────────────────────
console.log("\nTest 2: 50/50 split (5,000,000 TL)");
{
  // bhbShare = 100,000 × 50% = 50,000
  // KWTR = 5,000, kwtrKdv = 1,000, BM = 13,500, bmKdv = 800
  // net = 50,000 - 5,000 - 1,000 - 13,500 - 800 = 29,700
  const r = calcAgentBreakdown(5_000_000, 50);
  assert("BHB", r.bhbShare, 50_000);
  assert("KWTR", r.mainBranchShare, 5_000);
  assert("KWTR KDV", r.kwtrKdv, 1_000);
  assert("BM", r.marketCenterActual, 13_500);
  assert("BM KDV", r.bmKdv, 800);
  assert("Net", r.employeeNet, 29_700);
}

// ── Test 3: Cap fully remaining (cap won't be hit) ────────────────────────────
console.log("\nTest 3: Cap well above due — full BM charged");
{
  // capAmount=540,000, capUsed=0, BM=27,000 → full BM
  const r = calcAgentBreakdown(5_000_000, 100, false, 0, 0, 540_000);
  assert("BM actual = BM due", r.marketCenterActual, 27_000);
  assert("Net same as uncapped", r.employeeNet, 59_400);
}

// ── Test 4: Cap fully consumed (agent at cap) ─────────────────────────────────
console.log("\nTest 4: Cap fully consumed — BM = 0");
{
  // capAmount=540,000, capUsed=540,000 → BM=0, bmKdv=0
  // net = 100,000 - 10,000 - 2,000 - 0 - 0 = 88,000
  const r = calcAgentBreakdown(5_000_000, 100, false, 0, 540_000, 540_000);
  assert("BM actual = 0 (capped)", r.marketCenterActual, 0);
  assert("BM KDV = 0 (capped)", r.bmKdv, 0);
  assert("Net = BHB - KWTR - kwtrKdv", r.employeeNet, 88_000);
}

// ── Test 5: Partial cap remaining ────────────────────────────────────────────
console.log("\nTest 5: Partial cap — only 10,000 remaining");
{
  // capAmount=540,000, capUsed=530,000 → remaining=10,000, BM due=27,000, actual=10,000
  // bmKdv = 10,000 × (0.016/0.27) = 592.59...
  // net = 100,000 - 10,000 - 2,000 - 10,000 - 592.59 = 77,407.41
  const r = calcAgentBreakdown(5_000_000, 100, false, 0, 530_000, 540_000);
  assert("BM actual = 10,000 (capped)", r.marketCenterActual, 10_000);
  assert("BM KDV proportional", r.bmKdv, 592.59, 1);
  assert("Net", r.employeeNet, 77_407.41, 1);
}

// ── Test 6: With Üretkenlik Koçluğu at 10% ───────────────────────────────────
console.log("\nTest 6: With UK at 10%");
{
  // bhbShare=100,000, ukShare=10,000
  // net = 100,000 - 10,000 - 2,000 - 27,000 - 1,600 - 10,000 = 49,400
  const r = calcAgentBreakdown(5_000_000, 100, true, 0.10);
  assert("UK share (10%)", r.ukShare, 10_000);
  assert("Net after UK", r.employeeNet, 49_400);
}

// ── Test 7: BM KDV = BHB × 1.6% when not capped ─────────────────────────────
console.log("\nTest 7: BM KDV proportionality check (BHB × 1.6%)");
{
  const r = calcAgentBreakdown(3_000_000, 100);
  // bhb=60,000, bmKdv should = 60,000 × 1.6% = 960
  assert("BM KDV = BHB × 1.6%", r.bmKdv, r.bhbShare * 0.016, 0.01);
}

// ── Test 8: KWTR+KDV = KWTR × 1.2 ───────────────────────────────────────────
console.log("\nTest 8: KWTR + kwtrKdv = KWTR × 1.2");
{
  const r = calcAgentBreakdown(7_500_000, 100);
  const kwtrWithKdv = r.mainBranchShare + r.kwtrKdv;
  assert("KWTR × 1.2", kwtrWithKdv, r.mainBranchShare * 1.2, 0.01);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
