<?php

require_once __DIR__ . '/../collector/finance.php';

function verifyPayoff($stratName, $params, $calculatedMaxProfit, $calculatedMaxLoss, $calculatedBreakeven, $tolerance = 0.5) {
    // Generate price grid
    $maxK = 0;
    foreach ($params as $k => $v) {
        if (strpos($k, 'K') !== false) {
            $maxK = max($maxK, $v);
        }
    }
    $gridMax = max($maxK * 3, 1000);

    $maxP = -INF;
    $maxL = INF;
    $bes = [];
    $prevPayoff = null;
    $prevS = null;

    for ($S = 0; $S <= $gridMax; $S += ($gridMax / 1000)) {
        $payoff = 0;

        switch ($stratName) {
            case 'BCS':
                // Buy Call K1, Sell Call K2
                $p1 = max(0, $S - $params['K1']);
                $p2 = max(0, $S - $params['K2']);
                $payoff = $p1 - $p2 - $params['nd'] - $params['fee'];
                break;
            case 'BPS':
                // Buy Put K2, Sell Put K1 (K1 < K2)
                $p1 = max(0, $params['K1'] - $S);
                $p2 = max(0, $params['K2'] - $S);
                $payoff = $p2 - $p1 - $params['nd'] - $params['fee'];
                break;
            case 'CC':
                // Buy Stock, Sell Call
                $pCall = max(0, $S - $params['K']);
                $payoff = ($S - $params['S0']) - $pCall + $params['P'] - $params['fee'];
                break;
            case 'MRP':
                // Buy Stock, Buy Put
                $pPut = max(0, $params['K'] - $S);
                $payoff = ($S - $params['S0']) + $pPut - $params['P'] - $params['fee'];
                break;
            case 'Collar':
                // Buy Stock, Buy Put Kp, Sell Call Kc
                $pPut = max(0, $params['Kp'] - $S);
                $pCall = max(0, $S - $params['Kc']);
                $payoff = ($S - $params['S0']) + $pPut - $pCall - $params['netP'] - $params['fee'];
                break;
            case 'Conversion':
                // Buy Stock, Buy Put K, Sell Call K
                $pPut = max(0, $params['K'] - $S);
                $pCall = max(0, $S - $params['K']);
                $payoff = ($S - $params['S0']) + $pPut - $pCall - $params['Pp'] + $params['Pc'] - $params['fee'];
                break;
            case 'LongBox':
                // Buy Call K1, Sell Call K2, Buy Put K2, Sell Put K1
                $c1 = max(0, $S - $params['K1']);
                $c2 = max(0, $S - $params['K2']);
                $p2 = max(0, $params['K2'] - $S);
                $p1 = max(0, $params['K1'] - $S);
                $payoff = ($c1 - $c2) + ($p2 - $p1) - $params['netCost'] - $params['fee'];
                break;
            case 'ShortStrangle':
                // Sell Call Kc, Sell Put Kp
                $c = max(0, $S - $params['Kc']);
                $p = max(0, $params['Kp'] - $S);
                $payoff = $params['totalPremium'] - $c - $p - $params['fee'];
                break;
            case 'LongStrangle':
                // Buy Call Kc, Buy Put Kp
                $c = max(0, $S - $params['Kc']);
                $p = max(0, $params['Kp'] - $S);
                $payoff = $c + $p - $params['totalCost'] - $params['fee'];
                break;
            case 'LongStraddle':
                // Buy Call K, Buy Put K
                $c = max(0, $S - $params['K']);
                $p = max(0, $params['K'] - $S);
                $payoff = $c + $p - $params['totalCost'] - $params['fee'];
                break;
            case 'LongCallCondor':
                // Buy Call K1, Sell Call K2, Sell Call K3, Buy Call K4
                $c1 = max(0, $S - $params['K1']);
                $c2 = max(0, $S - $params['K2']);
                $c3 = max(0, $S - $params['K3']);
                $c4 = max(0, $S - $params['K4']);
                $payoff = $c1 - $c2 - $c3 + $c4 - $params['netCost'] - $params['fee'];
                break;
        }

        $maxP = max($maxP, $payoff);
        $maxL = min($maxL, $payoff);

        if ($prevPayoff !== null && (($prevPayoff < 0 && $payoff > 0) || ($prevPayoff > 0 && $payoff < 0))) {
            // crossing zero, record breakeven
            $bes[] = $S;
        }

        $prevPayoff = $payoff;
        $prevS = $S;
    }

    // In scenarios where payoff stays constant to infinity (e.g. BCS, BPS, Condor), we cap maxLoss/maxProfit to the calculated values on grid.

    $mpDiff = abs($maxP - $calculatedMaxProfit);
    $mlDiff = abs(abs($maxL) - abs($calculatedMaxLoss));

    if ($mpDiff > $tolerance) {
        echo "[!] $stratName MaxProfit mismatch: Analytical=$calculatedMaxProfit vs Brute=$maxP\n";
    }

    // maxLoss might be -INF for things like short options.
    if ($maxL > -INF && $mlDiff > $tolerance && abs($calculatedMaxLoss) < INF) {
        echo "[!] $stratName MaxLoss mismatch: Analytical=$calculatedMaxLoss vs Brute=$maxL\n";
    }

    // Check breakevens roughly
    if (!empty($bes)) {
        if (!is_array($calculatedBreakeven)) {
            $calculatedBreakeven = [$calculatedBreakeven];
        }
        foreach ($bes as $be) {
            $found = false;
            foreach ($calculatedBreakeven as $cbe) {
                if (abs($be - $cbe) < $tolerance + ($gridMax/1000)*2) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                echo "[!] $stratName Breakeven mismatch: Brute found $be, Analytical gave " . implode(',', $calculatedBreakeven) . "\n";
            }
        }
    }

    return true;
}

// Simple test run
verifyPayoff('BCS', ['K1' => 100, 'K2' => 120, 'nd' => 5, 'fee' => 0.5], 14.5, 5.5, 105.5);
echo "Test loaded.\n";
