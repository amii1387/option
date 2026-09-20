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
    
    // ═══ لاگ ═══
    'log_retention_days' => 7,   // نگه‌داری لاگ‌ها
];