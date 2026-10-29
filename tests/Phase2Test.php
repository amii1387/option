<?php
require_once __DIR__ . '/../collector/finance.php';

// 1. Fee tests
$optFee = feeOpt(100);
$optRate = $CFG_FINANCE['fees']['opt_buy'] + $CFG_FINANCE['fees']['opt_sell'];
assert(abs($optFee - (100 * $optRate)) < 1e-9, "Opt fee correct");

$stkFee = feeStk(1000, false);
$stkRate = $CFG_FINANCE['fees']['stk_buy'] + $CFG_FINANCE['fees']['stk_sell'];
assert(abs($stkFee - (1000 * $stkRate)) < 1e-9, "Stk fee correct");

$etfFee = feeStk(1000, true);
$etfRate = $CFG_FINANCE['fees']['etf_buy'] + $CFG_FINANCE['fees']['etf_sell'];
assert(abs($etfFee - (1000 * $etfRate)) < 1e-9, "ETF fee correct");

// 2. Margin tests
$S = 1000;
$K = 1200; // OTM Call
$callOtm = otm($S, $K, true);
assert($callOtm == 200, "OTM Call");
$margin = marginPerShare($S, $K, true);
$A = $CFG_FINANCE['margin']['A'];
$B = $CFG_FINANCE['margin']['B'];
$extra = $CFG_FINANCE['margin']['extra_per_share'];
$expectedMargin = max($A * $S - $callOtm, $B * $K) + $extra;
assert(abs($margin - $expectedMargin) < 1e-9, "Margin Calc OTM Call");

// 3. BS/IV round-trip
$T = 30/365;
$r = $CFG_FINANCE['rf'];
$p = bsCalc(true, $S, 900, $T, $r, 0.4);
$iv = findIV(true, $S, 900, $T, $r, $p);
assert(abs($iv - 40) < 1.0, "IV roundtrip");

echo "Phase 2 Finance Tests Passed.\n";
