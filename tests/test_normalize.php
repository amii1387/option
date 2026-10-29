<?php
require_once __DIR__ . '/../collector/normalize.php';

$sampleItem = [
    'buyInstrumentName' => ' ضخود100 ', // Arabic letter? wait, no just spaces
    'buyQeymateEmal' => ['value' => '1000'],
    'buyLastPrice' => ['value' => '100'],
    'buyBuyPrice' => ['value' => '90'],
    'buySellPriceSellPrice' => ['value' => '110'], // Ask for call
    'buyBaqimandeTaSarresId' => ['value' => '30'],
    'buyTradeValue' => ['value' => '500'],

    'sellInstrumentName' => ' طخود100 ',
    'sellQeymateEmal' => ['value' => '1000'],
    'sellLastPrice' => ['value' => '80'],
    'sellBuyPrice' => ['value' => '70'],
    'sellSellPrice' => ['value' => '90'], // Ask for put
    'sellBaqimandeTaSarresId' => ['value' => '30'],
    'sellTradeValue' => ['value' => '400']
];

$res = normalizeTsetmcTradeOption(['Items' => [$sampleItem]]);
$rows = $res['rows'];

// First row should be call
assert($rows[0]['نماد'] === 'ضخود100', "Call symbol normalized");
assert($rows[0]['side'] === 'call', "Call side");
assert($rows[0]['قیمت بهترین عرضه'] == 110, "Call ask price"); // testing buySellPriceSellPrice map

// Second row should be put
assert($rows[1]['نماد'] === 'طخود100', "Put symbol normalized");
assert($rows[1]['side'] === 'put', "Put side");
assert($rows[1]['قیمت بهترین عرضه'] == 90, "Put ask price"); // testing sellSellPrice map

echo "Normalize tests passed.\n";
