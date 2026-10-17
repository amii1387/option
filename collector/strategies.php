<?php
// collector/strategies.php

function calculateStrategies(array $rows): array {
    $calls = [];
    $puts  = [];
    $MIN_VOL = 1000000000; // پیش‌فرض ۱ میلیارد ریال

    foreach ($rows as $row) {
        $sym = trim($row['نماد'] ?? '');
        $isCall = mb_substr($sym, 0, 1, 'UTF-8') === 'ض';
        
        $item = [
            'underlying' => extractUnderlying($sym),
            'expiry'     => $row['تاریخ اعمال'] ?? '',
            'days'       => max(1, (int)($row['_daysLeft'] ?? 1)),
            'uprice'     => (float)($row['_base'] ?? 0),
            'strike'     => (float)($row['قیمت اعمال'] ?? 0),
            'lastP'      => (float)($row['آخرین قیمت'] ?? 0),
            'symRaw'     => $sym,
            'volume'     => (float)($row['ارزش معاملات'] ?? 0),
            'bid'        => (float)($row['قیمت بهترین تقاضا'] ?? 0),
            'ask'        => (float)($row['قیمت بهترین عرضه'] ?? 0),
        ];

        if ($item['strike'] > 0 && $item['lastP'] > 0) {
            if ($isCall) {
                $calls[] = $item;
            } else {
                $puts[] = $item;
            }
        }
    }

    return [
        'bcs'         => buildBCS($calls, $MIN_VOL),
        'bps'         => buildBPS($puts, $MIN_VOL),
        'cc'          => buildCC($calls),
        'collar'      => buildCollar($calls, $puts, $MIN_VOL),
        'conversion'  => buildConversion($calls, $puts, $MIN_VOL),
        'mrp'         => buildMarriedPut($puts),
        'long_box'    => buildLongBox($calls, $puts),
        'strangle'    => buildShortStrangle($calls, $puts, $MIN_VOL),
        'condor'      => buildLongCallCondor($calls, $MIN_VOL),
        'lst'         => buildLongStrangle($calls, $puts, $MIN_VOL),
        'std'         => buildLongStraddle($calls, $puts, $MIN_VOL),
    ];
}

function extractUnderlying($sym) {
    $umap = [
        'هرم'=>'اهرم','خود'=>'خودرو','سپا'=>'خساپا','ستا'=>'شستا',
        'شنا'=>'شپنا','ملت'=>'وبملت','ملی'=>'فملی','ملي'=>'فملي',
        'صاد'=>'وبصادر','جار'=>'وتجارت','تاص'=>'تاصيكو','جوا'=>'جوانه كوچك',
        'مخا'=>'اخابر','همن'=>'خبهمن','ستر'=>'خگستر','راز'=>'هم تراز',
        'درو'=>'دارونو'
    ];
    $b = trim((string)$sym);
    $firstChar = mb_substr($b, 0, 1, 'UTF-8');
    if ($firstChar === 'ض' || $firstChar === 'ط' || $firstChar === 'ح') {
        $b = mb_substr($b, 1, null, 'UTF-8');
    }
    $b = preg_replace('/[0-9٠-٩۰-۹]+$/u', '', $b);
    $b = trim($b);
    return $umap[$b] ?? $b;
}

/* ══ ۱. Bull Call Spread ══ */
function buildBCS($calls, $MIN_VOL) {
    $bcs = [];
    $groups = [];
    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $groups[$c['underlying'] . '|' . $c['expiry']][] = $c;
    }

    foreach ($groups as $group) {
        usort($group, fn($a, $b) => $a['strike'] <=> $b['strike']);
        $len = count($group);
        for ($i = 0; $i < $len - 1; $i++) {
            for ($j = $i + 1; $j < $len; $j++) {
                $buy = $group[$i];
                $sell = $group[$j];

                $nd = $buy['lastP'] - $sell['lastP'];
                if ($nd <= 0) continue;

                $ks = $sell['strike'] - $buy['strike'];
                $mp = $ks - $nd;
                if ($mp <= 0) continue;

                $be = $buy['strike'] + $nd;
                $rr = $mp / $nd;
                $sm = (($buy['uprice'] - $be) / $buy['uprice']) * 100;

                $exitExecution = ($buy['bid'] > 0 && $sell['ask'] > 0) ? $buy['bid'] - $sell['ask'] : 0;
                $exitQuality   = ($nd > 0 && $exitExecution > 0) ? min(100, ($exitExecution / $nd) * 100) : 0;
                $exitGap       = max(0, $nd - $exitExecution);
                $slippagePct   = ($mp > 0) ? ($exitGap / $mp) * 100 : 999;

                $bcs[] = [
                    'underlying'  => $buy['underlying'], 'expiry' => $buy['expiry'], 'days' => $buy['days'],
                    'uprice'      => $buy['uprice'], 'k1' => $buy['strike'], 'k2' => $sell['strike'],
                    'sym1'        => $buy['symRaw'], 'sym2' => $sell['symRaw'],
                    'p1'          => $buy['lastP'], 'p2' => $sell['lastP'],
                    'v1'          => $buy['volume'], 'v2' => $sell['volume'],
                    'netDebit'    => $nd, 'maxProfit' => $mp, 'maxLoss' => $nd, 'breakeven' => $be,
                    'returnPct'   => $rr * 100, 'safetyMargin' => $sm,
                    'exitQuality' => $exitQuality, 'exitGap' => $exitGap, 'slippagePct' => $slippagePct
                ];
            }
        }
    }
    return $bcs;
}

/* ══ ۲. Bear Put Spread ══ */
function buildBPS($puts, $MIN_VOL) {
    $bps = [];
    $groups = [];
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $groups[$p['underlying'] . '|' . $p['expiry']][] = $p;
    }

    foreach ($groups as $group) {
        usort($group, fn($a, $b) => $a['strike'] <=> $b['strike']);
        $len = count($group);
        for ($i = 0; $i < $len - 1; $i++) {
            for ($j = $i + 1; $j < $len; $j++) {
                $sell = $group[$i]; // فروش K1
                $buy  = $group[$j]; // خرید K2

                $nd = $buy['lastP'] - $sell['lastP'];
                if ($nd <= 0) continue;

                $ks = $buy['strike'] - $sell['strike'];
                $mp = $ks - $nd;
                if ($mp <= 0) continue;

                $be = $buy['strike'] - $nd;
                $rr = $mp / $nd;
                $sm = (($be - $buy['uprice']) / $buy['uprice']) * 100;

                $bps[] = [
                    'underlying' => $buy['underlying'], 'expiry' => $buy['expiry'], 'days' => $buy['days'],
                    'uprice'     => $buy['uprice'], 'k1' => $sell['strike'], 'k2' => $buy['strike'],
                    'sym1'       => $sell['symRaw'], 'sym2' => $buy['symRaw'],
                    'p1'         => $sell['lastP'], 'p2' => $buy['lastP'],
                    'v1'         => $sell['volume'], 'v2' => $buy['volume'],
                    'netDebit'   => $nd, 'maxProfit' => $mp, 'maxLoss' => $nd, 'breakeven' => $be,
                    'returnPct'  => $rr * 100, 'safetyMargin' => $sm
                ];
            }
        }
    }
    return $bps;
}

/* ══ ۳. Covered Call ══ */
function buildCC($calls) {
    $cc = [];
    foreach ($calls as $c) {
        if ($c['uprice'] <= 0 || $c['days'] <= 0) continue;
        $tp = $c['strike'] + $c['lastP'] - $c['uprice'];
        if ($tp <= 0) continue;

        $status = $c['strike'] > $c['uprice'] * 1.02 ? 'OTM' : ($c['strike'] < $c['uprice'] * 0.98 ? 'ITM' : 'ATM');
        $be = $c['uprice'] - $c['lastP'];
        $spct = ($c['lastP'] / $c['uprice']) * 100;

        $cc[] = [
            'symRaw'     => $c['symRaw'], 'underlying' => $c['underlying'], 'expiry' => $c['expiry'],
            'days'       => $c['days'], 'uprice' => $c['uprice'], 'strike' => $c['strike'],
            'premium'    => $c['lastP'], 'volume' => $c['volume'],
            'tpct'       => ($tp / $c['uprice']) * 100,
            'mpct'       => (($tp / $c['uprice']) * 100) / $c['days'] * 30,
            'breakeven'  => $be, 'spct' => $spct, 'status' => $status
        ];
    }
    return $cc;
}

/* ══ ۴. Collar ══ */
function buildCollar($calls, $puts, $MIN_VOL) {
    $collar = [];
    $putMap = [];
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $putMap[$p['underlying'] . '|' . $p['expiry']][] = $p;
    }

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $key = $c['underlying'] . '|' . $c['expiry'];
        if (!isset($putMap[$key])) continue;

        foreach ($putMap[$key] as $p) {
            if ($p['strike'] >= $c['strike']) continue;

            $netP = $c['lastP'] - $p['lastP'];
            $maxProfit = $c['strike'] - $c['uprice'] + $netP;
            $maxLoss = $p['strike'] - $c['uprice'] + $netP;

            $collar[] = [
                'callSym'    => $c['symRaw'], 'putSym' => $p['symRaw'], 'underlying' => $c['underlying'],
                'expiry'     => $c['expiry'], 'days' => $c['days'], 'uprice' => $c['uprice'],
                'Kc'         => $c['strike'], 'Kp' => $p['strike'], 'Pc' => $c['lastP'], 'Pp' => $p['lastP'],
                'netP'       => $netP, 'maxProfit' => $maxProfit, 'maxLoss' => $maxLoss,
                'breakeven'  => $c['uprice'] - $netP,
                'profitPct'  => ($maxProfit / $c['uprice']) * 100,
                'lossPct'    => ($maxLoss / $c['uprice']) * 100,
                'livePnLPct' => ($netP / $c['uprice']) * 100,
                'callVol'    => $c['volume'], 'putVol' => $p['volume']
            ];
        }
    }
    return $collar;
}

/* ══ ۵. Conversion Arbitrage ══ */
function buildConversion($calls, $puts, $MIN_VOL) {
    $conv = [];
    $putMap = [];
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $putMap[$p['underlying'] . '|' . $p['expiry'] . '|' . $p['strike']] = $p;
    }

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0 || $c['days'] <= 0) continue;
        $key = $c['underlying'] . '|' . $c['expiry'] . '|' . $c['strike'];
        if (!isset($putMap[$key])) continue;

        $p = $putMap[$key];
        $netCost = $c['uprice'] + $p['lastP'] - $c['lastP'];
        if ($netCost <= 0) continue;

        $profit = $c['strike'] - $netCost;
        if ($profit <= 0) continue;

        $retPct = ($profit / $netCost) * 100;
        $conv[] = [
            'underlying' => $c['underlying'], 'callSym' => $c['symRaw'], 'putSym' => $p['symRaw'],
            'expiry'     => $c['expiry'], 'days' => $c['days'], 'uprice' => $c['uprice'],
            'strike'     => $c['strike'], 'Pc' => $c['lastP'], 'Pp' => $p['lastP'],
            'netCost'    => $netCost, 'profit' => $profit, 'retPct' => $retPct,
            'annualPct'  => ($retPct / $c['days']) * 365,
            'monthlyPct' => ($retPct / $c['days']) * 30,
            'callVol'    => $c['volume'], 'putVol' => $p['volume']
        ];
    }
    return $conv;
}

/* ══ ۶. Married Put ══ */
function buildMarriedPut($puts) {
    $mrp = [];
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $netCost = $p['uprice'] + $p['lastP'];
        $maxLoss = $p['strike'] - $netCost;
        $lossPct = ($netCost > 0) ? ($maxLoss / $netCost) * 100 : 0;
        $be = $netCost;

        $mrp[] = [
            'underlying' => $p['underlying'], 'sym' => $p['symRaw'], 'expiry' => $p['expiry'],
            'days'       => $p['days'], 'uprice' => $p['uprice'], 'strike' => $p['strike'],
            'premium'    => $p['lastP'], 'netCost' => $netCost, 'maxLoss' => $maxLoss,
            'lossPct'    => $lossPct, 'breakeven' => $be, 'volume' => $p['volume']
        ];
    }
    return $mrp;
}

/* ══ ۷. Long Box Arbitrage ══ */
function buildLongBox($calls, $puts) {
    $boxStrategies = [];
    $groupedCalls = [];
    $groupedPuts  = [];

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $groupedCalls[$c['underlying'] . '|' . $c['expiry']][$c['strike']] = $c;
    }
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $groupedPuts[$p['underlying'] . '|' . $p['expiry']][$p['strike']] = $p;
    }

    foreach ($groupedCalls as $key => $callStrikes) {
        if (!isset($groupedPuts[$key])) continue;
        $putStrikes = $groupedPuts[$key];

        $commonStrikes = array_intersect(array_keys($callStrikes), array_keys($putStrikes));
        sort($commonStrikes);

        $count = count($commonStrikes);
        for ($i = 0; $i < $count - 1; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $k1 = $commonStrikes[$i];
                $k2 = $commonStrikes[$j];

                $c1 = $callStrikes[$k1]; $c2 = $callStrikes[$k2];
                $p1 = $putStrikes[$k1];  $p2 = $putStrikes[$k2];

                $cost = ($c1['lastP'] + $p2['lastP']) - ($c2['lastP'] + $p1['lastP']);
                $valueAtExpiry = $k2 - $k1;
                if ($cost <= 0) continue;

                $profit = $valueAtExpiry - $cost;
                $days = max(1, $c1['days']);
                $retPct = ($profit / $cost) * 100;

                $boxStrategies[] = [
                    'underlying' => $c1['underlying'], 'expiry' => $c1['expiry'], 'days' => $days,
                    'uprice'     => $c1['uprice'], 'k1' => $k1, 'k2' => $k2,
                    'c1Sym'      => $c1['symRaw'], 'c2Sym' => $c2['symRaw'],
                    'p1Sym'      => $p1['symRaw'], 'p2Sym' => $p2['symRaw'],
                    'c1P'        => $c1['lastP'], 'c2P' => $c2['lastP'],
                    'p1P'        => $p1['lastP'], 'p2P' => $p2['lastP'],
                    'c1V'        => $c1['volume'], 'c2V' => $c2['volume'],
                    'p1V'        => $p1['volume'], 'p2V' => $p2['volume'],
                    'cost'       => $cost, 'value' => $valueAtExpiry, 'profit' => $profit,
                    'returnPct'  => $retPct, 'annualPct' => ($retPct / $days) * 365,
                    'monthlyPct' => ($retPct / $days) * 30
                ];
            }
        }
    }
    return $boxStrategies;
}

/* ══ ۸. Short Strangle ══ */
function buildShortStrangle($calls, $puts, $MIN_VOL) {
    $strangles = [];
    $groupedCalls = [];
    $groupedPuts  = [];

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $groupedCalls[$c['underlying'] . '|' . $c['expiry']][] = $c;
    }
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $groupedPuts[$p['underlying'] . '|' . $p['expiry']][] = $p;
    }

    foreach ($groupedCalls as $key => $callList) {
        if (!isset($groupedPuts[$key])) continue;
        $putList = $groupedPuts[$key];

        foreach ($callList as $c) {
            foreach ($putList as $p) {
                if ($p['strike'] >= $c['strike']) continue;

                $totalCredit = $c['lastP'] + $p['lastP'];
                $beUpper = $c['strike'] + $totalCredit;
                $beLower = $p['strike'] - $totalCredit;
                $uprice  = $c['uprice'];

                $distLower = ($uprice > 0) ? (($uprice - $beLower) / $uprice) * 100 : 0;
                $distUpper = ($uprice > 0) ? (($beUpper - $uprice) / $uprice) * 100 : 0;
                $inRange   = ($uprice >= $p['strike'] && $uprice <= $c['strike']);

                $strangles[] = [
                    'underlying'  => $c['underlying'], 'expiry' => $c['expiry'], 'days' => $c['days'],
                    'uprice'      => $uprice, 'callSym' => $c['symRaw'], 'putSym' => $p['symRaw'],
                    'Kc'          => $c['strike'], 'Kp' => $p['strike'],
                    'Pc'          => $c['lastP'], 'Pp' => $p['lastP'],
                    'totalCredit' => $totalCredit, 'beUpper' => $beUpper, 'beLower' => $beLower,
                    'distLower'   => $distLower, 'distUpper' => $distUpper, 'inRange' => $inRange,
                    'callVol'     => $c['volume'], 'putVol' => $p['volume']
                ];
            }
        }
    }
    return $strangles;
}

/* ══ ۹. Long Call Condor ══ */
function buildLongCallCondor($calls, $MIN_VOL) {
    $condors = [];
    $groups = [];
    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $groups[$c['underlying'] . '|' . $c['expiry']][] = $c;
    }

    foreach ($groups as $group) {
        usort($group, fn($a, $b) => $a['strike'] <=> $b['strike']);
        $len = count($group);
        if ($len < 4) continue;

        for ($i = 0; $i < $len - 3; $i++) {
            $c1 = $group[$i];
            $c2 = $group[$i + 1];
            $c3 = $group[$i + 2];
            $c4 = $group[$i + 3];

            if (($c2['strike'] - $c1['strike']) !== ($c4['strike'] - $c3['strike'])) continue;

            $netCost = ($c1['lastP'] + $c4['lastP']) - ($c2['lastP'] + $c3['lastP']);
            if ($netCost <= 0) continue;

            $maxProfit = ($c2['strike'] - $c1['strike']) - $netCost;
            if ($maxProfit <= 0) continue;

            $beLower = $c1['strike'] + $netCost;
            $beUpper = $c4['strike'] - $netCost;
            $uprice  = $c1['uprice'];
            $inRange = ($uprice >= $c2['strike'] && $uprice <= $c3['strike']);

            $condors[] = [
                'underlying' => $c1['underlying'], 'expiry' => $c1['expiry'], 'days' => $c1['days'],
                'uprice'     => $uprice, 'k1' => $c1['strike'], 'k2' => $c2['strike'],
                'k3'         => $c3['strike'], 'k4' => $c4['strike'],
                'netCost'    => $netCost, 'maxProfit' => $maxProfit,
                'beLower'    => $beLower, 'beUpper' => $beUpper,
                'retPct'     => ($maxProfit / $netCost) * 100,
                'inRange'    => $inRange
            ];
        }
    }
    return $condors;
}

/* ══ ۱۰. Long Strangle ══ */
function buildLongStrangle($calls, $puts, $MIN_VOL) {
    $strangles = [];
    $groupedCalls = [];
    $groupedPuts  = [];

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $groupedCalls[$c['underlying'] . '|' . $c['expiry']][] = $c;
    }
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $groupedPuts[$p['underlying'] . '|' . $p['expiry']][] = $p;
    }

    foreach ($groupedCalls as $key => $callList) {
        if (!isset($groupedPuts[$key])) continue;
        $putList = $groupedPuts[$key];

        foreach ($callList as $c) {
            foreach ($putList as $p) {
                if ($p['strike'] >= $c['strike']) continue;

                $totalCost = $c['lastP'] + $p['lastP'];
                $beUpper = $c['strike'] + $totalCost;
                $beLower = $p['strike'] - $totalCost;
                $uprice  = $c['uprice'];

                $moveUpRequired   = ($uprice > 0) ? max(0, ($beUpper - $uprice) / $uprice * 100) : 0;
                $moveDownRequired = ($uprice > 0) ? max(0, ($uprice - $beLower) / $uprice * 100) : 0;

                $strangles[] = [
                    'underlying' => $c['underlying'], 'expiry' => $c['expiry'], 'days' => $c['days'],
                    'uprice'     => $uprice, 'callSym' => $c['symRaw'], 'putSym' => $p['symRaw'],
                    'Kc'         => $c['strike'], 'Kp' => $p['strike'],
                    'totalCost'  => $totalCost, 'beUpper' => $beUpper, 'beLower' => $beLower,
                    'moveUp'     => $moveUpRequired, 'moveDown' => $moveDownRequired,
                    'callVol'    => $c['volume'], 'putVol' => $p['volume']
                ];
            }
        }
    }
    return $strangles;
}

/* ══ ۱۱. Long Straddle ══ */
function buildLongStraddle($calls, $puts, $MIN_VOL) {
    $straddles = [];
    $putMap = [];
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $putMap[$p['underlying'] . '|' . $p['expiry'] . '|' . $p['strike']] = $p;
    }

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0) continue;
        $key = $c['underlying'] . '|' . $c['expiry'] . '|' . $c['strike'];
        if (!isset($putMap[$key])) continue;

        $p = $putMap[$key];
        $totalCost = $c['lastP'] + $p['lastP'];
        $beUpper = $c['strike'] + $totalCost;
        $beLower = $c['strike'] - $totalCost;
        $uprice  = $c['uprice'];

        $moveRequired = ($uprice > 0) ? ($totalCost / $uprice) * 100 : 0;

        $straddles[] = [
            'underlying'   => $c['underlying'], 'expiry' => $c['expiry'], 'days' => $c['days'],
            'uprice'       => $uprice, 'strike' => $c['strike'],
            'callSym'      => $c['symRaw'], 'putSym' => $p['symRaw'],
            'totalCost'    => $totalCost, 'beUpper' => $beUpper, 'beLower' => $beLower,
            'moveRequired' => $moveRequired, 'callVol' => $c['volume'], 'putVol' => $p['volume']
        ];
    }
    return $straddles;
}