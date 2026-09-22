<?php
// collector/strategies.php

function calculateStrategies(array $rows): array {
    $calls = [];
    $puts = [];
    $MIN_VOL = 1000000000;

    foreach ($rows as $row) {
        $isCall = mb_substr(trim($row['نماد']), 0, 1, 'UTF-8') === 'ض';
        $item = [
            'underlying' => extractUnderlying($row['نماد']),
            'expiry' => $row['تاریخ اعمال'],
            'days' => $row['_daysLeft'],
            'uprice' => $row['_base'],
            'strike' => $row['قیمت اعمال'],
            'lastP' => $row['آخرین قیمت'],
            'symRaw' => $row['نماد'],
            'volume' => $row['ارزش معاملات'],
            'bid' => $row['قیمت بهترین تقاضا'],
            'ask' => $row['قیمت بهترین عرضه'],
        ];

        if ($isCall && $item['strike'] > 0 && $item['lastP'] > 0) {
            $calls[] = $item;
        } elseif (!$isCall && $item['strike'] > 0 && $item['lastP'] > 0 && $item['volume'] >= $MIN_VOL) {
            $puts[] = $item;
        }
    }

    return [
        'bcs' => buildBCS($calls, $MIN_VOL),
        'cc' => buildCC($calls),
        'collar' => buildCollar($calls, $puts, $MIN_VOL),
        'conversion' => buildConversion($calls, $puts, $MIN_VOL)
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
    
    $b = trim($sym);
    $firstChar = mb_substr($b, 0, 1, 'UTF-8');
    if ($firstChar === 'ض' || $firstChar === 'ط' || $firstChar === 'ح') {
        $b = mb_substr($b, 1, null, 'UTF-8');
    }
    
    $b = preg_replace('/[0-9٠-٩۰-۹]+$/u', '', $b);
    $b = trim($b);
    
    return $umap[$b] ?? $b;
}

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
                
                if ($buy['volume'] < $MIN_VOL || $sell['volume'] < $MIN_VOL) continue;
                
                $nd = $buy['lastP'] - $sell['lastP'];
                if ($nd <= 0) continue;
                
                $ks = $sell['strike'] - $buy['strike'];
                $mp = $ks - $nd;
                if ($mp <= 0) continue;

                $be = $buy['strike'] + $nd;
                $rr = $mp / $nd;
                $sm = (($buy['uprice'] - $be) / $buy['uprice']) * 100;
                
                $ndb = ($buy['bid'] > 0 && $sell['ask'] > 0) ? $buy['bid'] - $sell['ask'] : null;
                $rb = ($ndb !== null && $ndb > 0) ? (($ks - $ndb) / $ndb * 100) : null;

                $ndw = ($buy['ask'] > 0 && $sell['bid'] > 0) ? $buy['ask'] - $sell['bid'] : null;
                $rw = ($ndw !== null && $ndw > 0) ? (($ks - $ndw) / $ndw * 100) : null;

                $bcs[] = [
                    'underlying' => $buy['underlying'], 'expiry' => $buy['expiry'], 'days' => $buy['days'],
                    'uprice' => $buy['uprice'], 'k1' => $buy['strike'], 'k2' => $sell['strike'],
                    'sym1' => $buy['symRaw'], 'sym2' => $sell['symRaw'], 'p1' => $buy['lastP'], 'p2' => $sell['lastP'],
                    'v1' => $buy['volume'], 'v2' => $sell['volume'],
                    'netDebit' => $nd, 'maxProfit' => $mp, 'maxLoss' => $nd, 'breakeven' => $be,
                    'retBest' => $rb, 'retWorst' => $rw,
                    'returnPct' => $rr * 100, 'safetyMargin' => $sm
                ];
            }
        }
    }
    return $bcs;
}

function buildCC($calls) {
    $cc = [];
    foreach ($calls as $c) {
        if ($c['uprice'] <= 0 || $c['days'] <= 0) continue;
        
        $tp = $c['strike'] + $c['lastP'] - $c['uprice'];
        if ($tp <= 0) continue;
        
        $status = $c['strike'] > $c['uprice'] * 1.02 ? 'OTM' : ($c['strike'] < $c['uprice'] * 0.98 ? 'ITM' : 'ATM');
        
        $cc[] = [
            'symRaw' => $c['symRaw'], 'underlying' => $c['underlying'], 'expiry' => $c['expiry'],
            'days' => $c['days'], 'uprice' => $c['uprice'], 'strike' => $c['strike'],
            'premium' => $c['lastP'], 'volume' => $c['volume'],
            'tpct' => ($tp / $c['uprice']) * 100,
            'mpct' => (($tp / $c['uprice']) * 100) / $c['days'] * 30,
            'breakeven' => $c['uprice'] - $c['lastP'],
            'spct' => ($c['lastP'] / $c['uprice']) * 100,
            'mpStartPct' => (($c['strike'] - $c['uprice']) / $c['uprice']) * 100,
            'status' => $status
        ];
    }
    return $cc;
}

function buildCollar($calls, $puts, $MIN_VOL) {
    $collar = [];
    $putMap = [];
    
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $putMap[$p['underlying'] . '|' . $p['expiry']][] = $p;
    }

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0 || $c['volume'] < $MIN_VOL) continue;
        
        $key = $c['underlying'] . '|' . $c['expiry'];
        if (!isset($putMap[$key])) continue;

        foreach ($putMap[$key] as $p) {
            if ($p['strike'] >= $c['strike']) continue;
            
            $netP = $c['lastP'] - $p['lastP'];
            $maxProfit = $c['strike'] - $c['uprice'] + $netP;
            if ($maxProfit <= 0) continue;

            $maxLoss = $p['strike'] - $c['uprice'] + $netP;

            $collar[] = [
                'callSym' => $c['symRaw'], 'putSym' => $p['symRaw'], 'underlying' => $c['underlying'],
                'expiry' => $c['expiry'], 'days' => $c['days'], 'uprice' => $c['uprice'],
                'Kc' => $c['strike'], 'Kp' => $p['strike'], 'Pc' => $c['lastP'], 'Pp' => $p['lastP'],
                'netP' => $netP, 'maxProfit' => $maxProfit, 'maxLoss' => $maxLoss,
                'breakeven' => $c['uprice'] - $netP,
                'profitPct' => ($maxProfit / $c['uprice']) * 100,
                'lossPct' => ($maxLoss / $c['uprice']) * 100,
                'livePnLPct' => ($netP / $c['uprice']) * 100,
                'callVol' => $c['volume'], 'putVol' => $p['volume']
            ];
        }
    }
    return $collar;
}

function buildConversion($calls, $puts, $MIN_VOL) {
    $conv = [];
    $putMap = [];
    
    foreach ($puts as $p) {
        if ($p['uprice'] <= 0) continue;
        $putMap[$p['underlying'] . '|' . $p['expiry'] . '|' . $p['strike']] = $p;
    }

    foreach ($calls as $c) {
        if ($c['uprice'] <= 0 || $c['days'] <= 0 || $c['volume'] < $MIN_VOL) continue;
        
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
            'expiry' => $c['expiry'], 'days' => $c['days'], 'uprice' => $c['uprice'],
            'strike' => $c['strike'], 'Pc' => $c['lastP'], 'Pp' => $p['lastP'],
            'netCost' => $netCost, 'profit' => $profit, 'retPct' => $retPct,
            'annualPct' => ($retPct / $c['days']) * 365,
            'monthlyPct' => ($retPct / $c['days']) * 30,
            'callVol' => $c['volume'], 'putVol' => $p['volume']
        ];
    }
    return $conv;
}