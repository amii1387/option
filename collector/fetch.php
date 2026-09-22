<?php
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
        echo json_encode(['ok' => false, 'message' => 'بروزرسانی در پس‌زمینه در حال انجام است.']);
        exit;
    }
    exit(0);
}

$startTime = microtime(true);
$logEntry  = ['at' => date('Y-m-d H:i:s'), 'result' => null];

try {
    $rawJson = fetchFromTsetmc($cfg);
    if (!$rawJson) throw new Exception('Empty response from TSETMC');

    $parsed = json_decode($rawJson, true);
    if (!is_array($parsed)) throw new Exception('Invalid JSON: ' . json_last_error_msg());

    $result = normalizeTsetmcTradeOption($parsed);
    $rows   = $result['rows'];
    $stats  = $result['stats'];

    if (count($rows) < $cfg['min_rows']) {
        throw new Exception('Too few rows: ' . count($rows));
    }

    require_once __DIR__ . '/strategies.php';
    $strategies = calculateStrategies($rows);

    $now = time();
    $payload = [
        'meta' => [
            'updated_at' => date('Y-m-d H:i:s'),
            'updated_ts' => $now,
            'source'     => 'TSETMC MarketWatchTradeOption',
            'rows'       => count($rows),
            'stats'      => $stats,
        ],
        'data' => $strategies
    ];
    
    writeAtomic($latestFile, json_encode($payload, JSON_UNESCAPED_UNICODE));

    writeAtomic($statusFile, json_encode([
        'success'      => true,
        'last_success' => date('Y-m-d H:i:s'),
        'rows'         => count($rows),
    ], JSON_UNESCAPED_UNICODE));

    $logEntry['result'] = 'ok';
    $logEntry['rows']   = count($rows);

} catch (Exception $e) {
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

if (!defined('IS_MANUAL_UPDATE')) {
    exit(0);
}

// === توابع ===
function fetchFromTsetmc(array $cfg) {
    $ch = curl_init($cfg['tsetmc_url']);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => $cfg['timeout'],
        CURLOPT_CONNECTTIMEOUT => $cfg['connect_timeout'],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => $cfg['user_agent'],
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json, text/plain, */*',
            'Accept-Language: fa-IR,fa;q=0.9,en;q=0.8',
            'Referer: https://www.tse.ir/',
        ],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($code !== 200 || !$body) throw new Exception("TSETMC HTTP $code — $err");
    return $body;
}

function writeAtomic(string $path, string $content) {
    $tmp = $path . '.tmp.' . getmypid() . '.' . mt_rand(1000, 9999);
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) throw new Exception("Cannot write to $tmp");
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new Exception("Cannot rename $tmp to $path");
    }
    @chmod($path, 0644);
}

function cleanOldLogs(string $dir, int $days) {
    $threshold = time() - ($days * 86400);
    foreach (glob($dir . '/collector-*.log') as $file) {
        if (filemtime($file) < $threshold) @unlink($file);
    }
}