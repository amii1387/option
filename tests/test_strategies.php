<?php
require_once __DIR__ . '/../collector/strategies.php';

$rows = [
    [
        'نماد' => 'ضخود100',
        'underlying' => 'خودرو',
        'تاریخ اعمال' => '1403/01/01',
        '_daysLeft' => 30,
        '_base' => 1000,
        'uask' => 1010,
        'قیمت اعمال' => 1000,
        'آخرین قیمت' => 100,
        'ارزش معاملات' => 2000000000,
        'قیمت بهترین تقاضا' => 90,
        'قیمت بهترین عرضه' => 110,
        'side' => 'call'
    ],
    [
        'نماد' => 'ضخود101',
        'underlying' => 'خودرو',
        'تاریخ اعمال' => '1403/01/01',
        '_daysLeft' => 30,
        '_base' => 1000,
        'uask' => 1010,
        'قیمت اعمال' => 1100,
        'آخرین قیمت' => 50,
        'ارزش معاملات' => 2000000000,
        'قیمت بهترین تقاضا' => 45,
        'قیمت بهترین عرضه' => 55,
        'side' => 'call'
    ]
];

$resLast = calculateStrategies($rows, 'last');
$bcsLast = $resLast['bcs'][0];
// K1=1000, K2=1100
// nd = 100 - 50 = 50
assert($bcsLast['netDebit'] == 50, "BCS Last ND");
assert($bcsLast['maxProfit'] == (100 - 50), "BCS Last MP");

$resExec = calculateStrategies($rows, 'exec');
$bcsExec = $resExec['bcs'][0];
// buy k1: ask = 110
// sell k2: bid = 45
// nd = 110 - 45 = 65
assert($bcsExec['netDebit'] == 65, "BCS Exec ND");
assert($bcsExec['maxProfit'] == (100 - 65), "BCS Exec MP");

echo "Strategy tests passed.\n";
