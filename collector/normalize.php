<?php
// collector/normalize.php
// تبدیل ساختار واقعی TSETMC MarketWatchTradeOption به ساختار Excel قدیمی
//
// ⚠️ نکته کلیدی: هر ردیف در پاسخ TSETMC = یک جفت Call+Put روی یک استرایک
// پس هر ردیف به دو ردیف (کال + پوت) تبدیل می‌شود

/**
 * @param array $response  پاسخ JSON TSETMC به‌صورت array
 * @return array  ['rows' => [...], 'stats' => [...]]
 */
function normalizeTsetmcTradeOption(array $response): array
{
    $items = $response['Items'] ?? [];
    if (!is_array($items)) {
        return ['rows' => [], 'stats' => ['total_pairs' => 0]];
    }

    $out = [];
    $stats = [
        'total_pairs'       => 0,
        'calls'             => 0,
        'puts'              => 0,
        'skipped_halted'    => 0,
        'skipped_no_last'   => 0,
        'skipped_no_strike' => 0,
    ];

    foreach ($items as $item) {
        $stats['total_pairs']++;

        // ═══ پردازش Call (کال) ═══
        $callResult = buildRowFromSide($item, 'buy');
        if ($callResult === false) {
            $stats['skipped_halted']++;
        } elseif ($callResult === null) {
            $stats['skipped_no_last']++;
        } else {
            $out[] = $callResult;
            $stats['calls']++;
        }

        // ═══ پردازش Put (پوت) ═══
        $putResult = buildRowFromSide($item, 'sell');
        if ($putResult === false) {
            $stats['skipped_halted']++;
        } elseif ($putResult === null) {
            $stats['skipped_no_last']++;
        } else {
            $out[] = $putResult;
            $stats['puts']++;
        }
    }

    return ['rows' => $out, 'stats' => $stats];
}

/**
 * ساخت یک ردیف از یک سمت (buy = Call، sell = Put)
 *
 * @param array  $item  یک آیتم از Items
 * @param string $side  'buy' یا 'sell'
 * @return array|null|false
 *   - array = ردیف ساخته‌شده
 *   - null  = داده ناقص (lastPrice یا strike ندارد)
 *   - false = متوقف است
 */
function buildRowFromSide(array $item, string $side)
{
    $p = $side;

    // ─── تشخیص سمت ───
    $instrumentName = trim($item[$p . 'InstrumentName'] ?? '');
    if ($instrumentName === '') return null;

    $stateName = $item[$p . 'statename'] ?? '';
    if (stripos($stateName, 'متوقف') !== false || stripos($stateName, 'ممنوع') !== false) {
        return false;
    }

    // ─── استخراج مقادیر ───
    $strike = extractValue($item[$p . 'QeymateEmal'] ?? null);
    if ($strike === null || $strike <= 0) return null;

    $last = extractValue($item[$p . 'LastPrice'] ?? null);
    if ($last === null || $last <= 0) return null;

    $bid = extractValue($item[$p . 'BuyPrice'] ?? null) ?? 0;
    
    // ⚠️ فیلد Ask در Call و Put نام متفاوتی دارد
    if ($p === 'buy') {
        $ask = extractValue($item['buySellPriceSellPrice'] ?? null) ?? 0;
    } else {
        $ask = extractValue($item[$p . 'SellPrice'] ?? null) ?? 0;
    }

    $tradeValue  = extractValue($item[$p . 'TradeValue'] ?? null) ?? 0;
    $tradeVolume = extractValue($item[$p . 'TradeVolume'] ?? null) ?? 0;
    $basePrice   = extractValue($item[$p . 'QeymateMabna'] ?? null) ?? 0;
    $daysLeft    = (int) extractValue($item[$p . 'BaqimandeTaSarresId'] ?? null);
    $expiryMiladi = $item[$p . 'TarixSarresid'] ?? null;

    // ─── تبدیل سررسید میلادی به شمسی ───
    $expiryJalali = '';
    if (!empty($expiryMiladi)) {
        $expiryJalali = miladiToJalaliString($expiryMiladi);
    } elseif ($daysLeft > 0) {
        $expiryJalali = daysLeftToJalaliString($daysLeft);
    }

    // ─── خروجی به ساختار Excel قدیمی ───
    return [
        'نماد'              => $instrumentName,
        'قیمت اعمال'        => $strike,
        'تاریخ اعمال'       => $expiryJalali,
        'ارزش معاملات'      => $tradeValue,
        'آخرین قیمت'        => $last,
        'قیمت بهترین تقاضا' => $bid,
        'قیمت بهترین عرضه'  => $ask,
        // فیلدهای کمکی برای Dashboard (اختیاری)
        '_base'             => $basePrice,
        '_daysLeft'         => $daysLeft,
    ];
}

/**
 * استخراج مقدار از object {value: X, state: Y}
 */
function extractValue($obj)
{
    if (is_numeric($obj)) return (float)$obj;
    if (!is_array($obj)) return null;
    $v = $obj['value'] ?? null;
    if ($v === null || $v === '') return null;
    if (is_numeric($v)) return (float)$v;
    return null;
}

/**
 * تبدیل ISO datetime میلادی به رشته شمسی YYYY/MM/DD
 * ورودی: "2026-10-21T00:00:00"
 * خروجی: "1405/07/29"
 */
function miladiToJalaliString(string $iso): string
{
    try {
        $dt = new DateTime($iso, new DateTimeZone('Asia/Tehran'));
        [$jy, $jm, $jd] = gregorianToJalali(
            (int)$dt->format('Y'),
            (int)$dt->format('n'),
            (int)$dt->format('j')
        );
        return sprintf('%04d/%02d/%02d', $jy, $jm, $jd);
    } catch (Exception $e) {
        return '';
    }
}

/**
 * تبدیل روزهای باقی‌مانده به تاریخ شمسی
 */
function daysLeftToJalaliString(int $days): string
{
    if ($days <= 0) return '';
    try {
        $today = new DateTime('now', new DateTimeZone('Asia/Tehran'));
        $expiry = clone $today;
        $expiry->modify("+{$days} days");
        [$jy, $jm, $jd] = gregorianToJalali(
            (int)$expiry->format('Y'),
            (int)$expiry->format('n'),
            (int)$expiry->format('j')
        );
        return sprintf('%04d/%02d/%02d', $jy, $jm, $jd);
    } catch (Exception $e) {
        return '';
    }
}

/**
 * تبدیل تاریخ میلادی به شمسی
 */
function gregorianToJalali(int $gy, int $gm, int $gd): array
{
    $g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    $gy2 = ($gm > 2) ? ($gy + 1) : $gy;
    $days = 355666 + (365 * $gy) + ((int)(($gy2 + 3) / 4))
          - ((int)(($gy2 + 99) / 100)) + ((int)(($gy2 + 399) / 400))
          + $gd + $g_d_m[$gm - 1];
    $jy = -1595 + (33 * ((int)($days / 12053)));
    $days %= 12053;
    $jy += 4 * ((int)($days / 1461));
    $days %= 1461;
    if ($days > 365) {
        $jy += (int)(($days - 1) / 365);
        $days = ($days - 1) % 365;
    }
    if ($days < 186) {
        $jm = 1 + (int)($days / 31);
        $jd = 1 + ($days % 31);
    } else {
        $jm = 7 + (int)(($days - 186) / 30);
        $jd = 1 + (($days - 186) % 30);
    }
    return [$jy, $jm, $jd];
}