<?php

$CFG_FINANCE = require __DIR__ . '/../api/config.php';

function getFeeOptRate() {
    global $CFG_FINANCE;
    return $CFG_FINANCE['fees']['opt_buy'] + $CFG_FINANCE['fees']['opt_sell'];
}

function feeOpt($P) {
    global $USE_FEES;
    if (isset($USE_FEES) && !$USE_FEES) return 0;
    return $P * getFeeOptRate();
}

function feeStk($S, $isEtf) {
    global $USE_FEES;
    if (isset($USE_FEES) && !$USE_FEES) return 0;
    global $CFG_FINANCE;
    $rates = $CFG_FINANCE['fees'];
    if ($isEtf) {
        return $S * ($rates['etf_buy'] + $rates['etf_sell']);
    } else {
        return $S * ($rates['stk_buy'] + $rates['stk_sell']);
    }
}

function otm($S, $K, $isCall) {
    if ($isCall) {
        return max(0, $K - $S);
    } else {
        return max(0, $S - $K);
    }
}

function marginPerShare($S, $K, $isCall) {
    global $CFG_FINANCE;
    $marginConf = $CFG_FINANCE['margin'];
    $A = $marginConf['A'];
    $B = $marginConf['B'];
    $extra = $marginConf['extra_per_share'];
    return max($A * $S - otm($S, $K, $isCall), $B * $K) + $extra;
}

function marginPerContract($S, $K, $isCall) {
    global $CFG_FINANCE;
    return marginPerShare($S, $K, $isCall) * $CFG_FINANCE['margin']['contract_size'];
}

function checkIsEtf($underlying) {
    global $CFG_FINANCE;
    return in_array($underlying, $CFG_FINANCE['etf_underlyings'] ?? []);
}

// BS Math helpers
function cndf($x) {
    $a1 = 0.254829592; $a2 = -0.284496736; $a3 = 1.421413741;
    $a4 = -1.453152027; $a5 = 1.061405429; $p = 0.3275911;
    $sign = ($x < 0) ? -1 : 1;
    $x = abs($x) / sqrt(2.0);
    $t = 1.0 / (1.0 + $p * $x);
    $erf = 1.0 - ((((($a5 * $t + $a4) * $t) + $a3) * $t + $a2) * $t + $a1) * $t * exp(-$x * $x);
    return 0.5 * (1.0 + $sign * $erf);
}

function npdf($x) {
    return exp(-0.5 * $x * $x) / sqrt(2 * M_PI);
}

function bsCalc($isCall, $S, $K, $T, $r, $sigma) {
    if ($sigma <= 0 || $T <= 0) {
        $intrinsic = $isCall ? max(0, $S - $K) : max(0, $K - $S);
        return $intrinsic;
    }
    $d1 = (log($S / $K) + ($r + 0.5 * $sigma * $sigma) * $T) / ($sigma * sqrt($T));
    $d2 = $d1 - $sigma * sqrt($T);

    if ($isCall) {
        return $S * cndf($d1) - $K * exp(-$r * $T) * cndf($d2);
    } else {
        return $K * exp(-$r * $T) * cndf(-$d2) - $S * cndf(-$d1);
    }
}

function findIV($isCall, $S, $K, $T, $r, $marketPrice) {
    if ($marketPrice <= 0 || $S <= 0 || $K <= 0 || $T <= 0) return null;
    $intrinsic = $isCall ? max(0, $S - $K) : max(0, $K - $S);
    if ($marketPrice < $intrinsic) return null;

    $sigma = 0.4;
    for ($i = 0; $i < 35; $i++) {
        $d1 = (log($S / $K) + ($r + 0.5 * $sigma * $sigma) * $T) / ($sigma * sqrt($T));
        $p = bsCalc($isCall, $S, $K, $T, $r, $sigma);
        $diff = $p - $marketPrice;
        if (abs($diff) < 0.1) return $sigma * 100;
        $vega = $S * sqrt($T) * npdf($d1);
        if ($vega < 1e-6) break;
        $sigma -= $diff / $vega;
        if ($sigma <= 0.001) $sigma = 0.001;
        if ($sigma > 5.0) return null;
    }

    $low = 0.001; $high = 5.0;
    for ($i = 0; $i < 50; $i++) {
        $mid = ($low + $high) / 2;
        $p = bsCalc($isCall, $S, $K, $T, $r, $mid);
        if (abs($p - $marketPrice) < 0.1) return $mid * 100;
        if ($p < $marketPrice) $low = $mid;
        else $high = $mid;
    }
    return null;
}
