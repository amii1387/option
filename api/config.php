<?php
// api/config.php
// تنظیمات مشترک پروژه — هم برای collector هم برای api

return [
    // ═══ منبع داده ═══
    'tsetmc_url' => 'https://webgw.tse.ir/InstrumentProvider/api/v1/MarketWatch/MarketWatchTradeOption/fa',
    
    // ═══ مسیرها ═══
    'data_dir' => __DIR__ . '/../data',
    'log_dir'  => __DIR__ . '/../logs',
    
    // ═══ کش و Refresh ═══
    'cache_ttl'  => 50,   // ثانیه — Dashboard اگر داده قدیمی‌تر دید، هشدار می‌دهد
    'min_rows'   => 20,   // حداقل ردیف معتبر (اگر کمتر بیاید یعنی خطا)
    
    // ═══ HTTP Client ═══
    'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'timeout'    => 25,
    'connect_timeout' => 8,
    'ca_bundle'  => true, // Validate SSL by default

    // ═══ CORS ═══
    'cors_domain' => 'https://hseqi.ir',

    // ═══ استراتژی‌ها ═══
    'min_vol' => 1000000000,

    // ═══ فاز ۲: تنظیمات مالی ═══
    'fees' => [
        'opt_buy'  => 0.00103,
        'opt_sell' => 0.00103,
        'stk_buy'  => 0.003712,
        'stk_sell' => 0.0088,
        'etf_buy'  => 0.00232,
        'etf_sell' => 0.0023755,
    ],
    'fee_mode'             => 'roundtrip', // roundtrip | hold_to_expiry
    'margin' => [
        'A'               => 0.20,
        'B'               => 0.10,
        'extra_per_share' => 10,
        'contract_size'   => 1000
    ],
    'box_margin_mode'      => 'none', // none | short_put
    'strangle_margin_mode' => 'sum',  // sum | max
    'condor_margin_mode'   => 'none', // none | k3
    'rf'                   => 0.23,   // Risk-free rate
    'etf_underlyings'      => ['اهرم', 'موج', 'توان'], // Fallback ETF underlying list
    'scanner_weights' => [
        'profit'    => 0.30,
        'safety'    => 0.20,
        'execution' => 0.30,
        'liquidity' => 0.20
    ],
    
    // ═══ لاگ ═══
    'log_retention_days' => 7,   // نگه‌داری لاگ‌ها
];
