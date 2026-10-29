<?php
date_default_timezone_set('Asia/Tehran');
require_once __DIR__ . '/normalize.php';

$cfg = require __DIR__ . '/../api/config.php';

if (!is_dir($cfg['data_dir'])) @mkdir($cfg['data_dir'], 0755, true);
if (!is_dir($cfg['log_dir']))  @mkdir($cfg['log_dir'],  0755, true);

$latestFile  = $cfg['data_dir'] . '/latest.json';
$statusFile  = $cfg['data_dir'] . '/status.json';
$lockFile    = $cfg['data_dir'] . '/collector.lock';
$logFile     = $cfg['log_dir']  . '/collector-' . date('Y-m-d') . '.log';

$lock = fopen($lockFile, 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    if (defined('IS_MANUAL_UPDATE')) {
        echo json_encode(['ok' => false, 'message' => 'بروزرسانی در حال انجام است.']);
        exit;
    }
    exit(0);
}

$startTime = microtime(true);
$logEntry  = ['at' => date('Y-m-d H:i:s'), 'result' => null];

function cleanSymbolName($str) {
    $str = trim((string)$str);
    $arabic = ['ي', 'ك', 'ى', 'ئ', '‌', '‏', ' '];
    $persian = ['ی', 'ک', 'ی', 'ی', '', '', ''];
    return str_replace($arabic, $persian, $str);
}

try {
    $nowMs = round(microtime(true) * 1000);
    $urlOptions = $cfg['tsetmc_url'] . (strpos($cfg['tsetmc_url'], '?') === false ? '?' : '&') . 't=' . $nowMs;
    $rawOptions = fetchSingle($urlOptions, $cfg);

    if (empty($rawOptions)) throw new Exception('پاسخی از وب‌سرویس مشتقه دریافت نشد');
    $parsedOptions = json_decode($rawOptions, true);
    if (!is_array($parsedOptions)) throw new Exception('فرمت JSON مشتقه نامعتبر است');

    $result = normalizeTsetmcTradeOption($parsedOptions);
    $rows   = $result['rows'];
    $stats  = $result['stats'];

    if (count($rows) < $cfg['min_rows']) {
        throw new Exception('تعداد سطرهای دریافتی بسیار کم است: ' . count($rows));
    }

    require_once __DIR__ . '/strategies.php';

    $urlLive = 'https://cdn.tsetmc.com/api/ClosingPrice/GetMarketWatch?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3&paperTypes[3]=4&paperTypes[4]=7&paperTypes[5]=8&paperTypes[6]=9&withBestLimits=false&hEven=0&RefID=' . $nowMs;
    $rawLive = fetchSingle($urlLive, $cfg, 10);

    $lastPriceMap = [];
    if (!empty($rawLive)) {
        $parsedLive = json_decode($rawLive, true);
        $stockList = [];
        if (isset($parsedLive['marketwatch'])) {
            $stockList = $parsedLive['marketwatch'];
        } elseif (isset($parsedLive['closingPriceObject'])) {
            $stockList = $parsedLive['closingPriceObject'];
        } elseif (is_array($parsedLive)) {
            $stockList = $parsedLive;
        }

        foreach ($stockList as $s) {
            if (!is_array($s)) continue;
            $rawSym = $s['lva'] ?? ($s['lVal18AFC'] ?? '');
            $cleanSym = cleanSymbolName($rawSym);
            if ($cleanSym === '') continue;

            $lastP = 0;
            if (isset($s['pdv']) && (float)$s['pdv'] > 0) $lastP = (float)$s['pdv'];
            elseif (isset($s['pDrCotVal']) && (float)$s['pDrCotVal'] > 0) $lastP = (float)$s['pDrCotVal'];
            elseif (isset($s['pl']) && (float)$s['pl'] > 0) $lastP = (float)$s['pl'];

            if ($lastP > 0) {
                $askP = 0;
                // find ask price for underlying
                if (isset($s['blDs']) && is_array($s['blDs']) && count($s['blDs']) > 0) {
                    $askP = (float)($s['blDs'][0]['pMeDem'] ?? 0);
                }
                $lastPriceMap[$cleanSym] = ['last' => $lastP, 'ask' => $askP];
            }
        }
    }

    $logEntry['matched_last_prices'] = count($lastPriceMap);
    $replacedCount = 0;
    
    foreach ($rows as &$r) {
        $und = cleanSymbolName(extractUnderlying($r['نماد']));
        if (isset($lastPriceMap[$und]) && $lastPriceMap[$und]['last'] > 0) {
            $r['_base'] = $lastPriceMap[$und]['last'];
            $r['uask'] = $lastPriceMap[$und]['ask'];
            $replacedCount++;
        }
    }
    unset($r);

    $logEntry['replaced_rows'] = $replacedCount;
    $now = time();
    $meta = [
        'updated_at' => date('c'),
        'updated_ts' => $now,
        'source'     => 'TSETMC Live',
        'rows'       => count($rows),
        'stats'      => $stats,
        'raw_rows'   => $rows
    ];

    // With Fees
    global $USE_FEES;
    $USE_FEES = true;
    $payload_last = ['meta' => $meta, 'data' => calculateStrategies($rows, 'last')];
    writeAtomic($cfg['data_dir'] . '/latest_last_1.json', json_encode($payload_last, JSON_UNESCAPED_UNICODE));
    $payload_exec = ['meta' => $meta, 'data' => calculateStrategies($rows, 'exec')];
    writeAtomic($cfg['data_dir'] . '/latest_exec_1.json', json_encode($payload_exec, JSON_UNESCAPED_UNICODE));

    // Without Fees
    $USE_FEES = false;
    $payload_last_0 = ['meta' => $meta, 'data' => calculateStrategies($rows, 'last')];
    writeAtomic($cfg['data_dir'] . '/latest_last_0.json', json_encode($payload_last_0, JSON_UNESCAPED_UNICODE));
    $payload_exec_0 = ['meta' => $meta, 'data' => calculateStrategies($rows, 'exec')];
    writeAtomic($cfg['data_dir'] . '/latest_exec_0.json', json_encode($payload_exec_0, JSON_UNESCAPED_UNICODE));

    // Also keep latest.json as a copy of latest_last.json for backward compatibility or simple default
    writeAtomic($latestFile, json_encode($payload_last, JSON_UNESCAPED_UNICODE));
    writeAtomic($statusFile, json_encode([
        'success'      => true,
        'last_success' => date('Y-m-d H:i:s'),
        'rows'         => count($rows),
        'last_p_count' => count($lastPriceMap)
    ], JSON_UNESCAPED_UNICODE));

    $logEntry['result'] = 'ok';
    $logEntry['rows']   = count($rows);

} catch (Throwable $e) {
    $prev = @json_decode(@file_get_contents($statusFile), true) ?: [];
    writeAtomic($statusFile, json_encode([
        'success'      => false,
        'last_success' => $prev['last_success'] ?? null,
        'error'        => $e->getMessage(),
        'at'           => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE));

    $logEntry['result']  = 'error';
    $logEntry['message'] = $e->getMessage();
}

$logEntry['duration_ms'] = round((microtime(true) - $startTime) * 1000);
@file_put_contents($logFile, json_encode($logEntry, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
cleanOldLogs($cfg['log_dir'], $cfg['log_retention_days']);

flock($lock, LOCK_UN);
fclose($lock);

if (defined('IS_MANUAL_UPDATE')) {
    if ($logEntry['result'] === 'ok') {
        echo json_encode(['ok' => true, 'message' => 'داده‌ها با موفقیت دریافت شدند.', 'matched' => $logEntry['replaced_rows'] ?? 0]);
    } else {
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => $logEntry['message'] ?? 'خطا در دریافت']);
    }
    exit;
}
exit(0);

function fetchSingle(string $url, array $cfg, int $timeout = 15): string {
    $ch = curl_init($url);
    $verify_ssl = isset($cfg['ca_bundle']) ? $cfg['ca_bundle'] : true;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => $cfg['timeout'] ?? $timeout,
        CURLOPT_CONNECTTIMEOUT => $cfg['connect_timeout'] ?? 5, CURLOPT_SSL_VERIFYPEER => $verify_ssl, CURLOPT_SSL_VERIFYHOST => $verify_ssl ? 2 : 0,
        CURLOPT_USERAGENT      => $cfg['user_agent'] ?? 'Mozilla/5.0',
        CURLOPT_HTTPHEADER     => ['Accept: application/json', 'Cache-Control: no-cache', 'Pragma: no-cache', 'Referer: https://tsetmc.com/'],
    ]);
    $res = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
    if ($res === false || !empty($err)) throw new Exception("cURL Error: " . $err);
    return (string)$res;
}
function writeAtomic(string $path, string $content) {
    $tmp = $path . '.tmp.' . getmypid() . '.' . mt_rand(1000, 9999);
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) throw new Exception("Cannot write");
    if (!@rename($tmp, $path)) { @unlink($tmp); throw new Exception("Cannot rename"); }
    @chmod($path, 0644);
}
function cleanOldLogs(string $dir, int $days) {
    $threshold = time() - ($days * 86400);
    foreach (glob($dir . '/collector-*.log') as $file) { if (filemtime($file) < $threshold) @unlink($file); }
}