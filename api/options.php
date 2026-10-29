<?php
$cfg = require __DIR__ . '/config.php';

$price_mode = isset($_GET['price']) && $_GET['price'] === 'exec' ? 'exec' : 'last';
$latestFile = $cfg['data_dir'] . "/latest_{$price_mode}.json";
if (!file_exists($latestFile)) {
    $latestFile = $cfg['data_dir'] . '/latest.json';
}
$statusFile = $cfg['data_dir'] . '/status.json';

if (!file_exists($latestFile)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'message' => 'داده آماده نیست', 'retry_in' => 5], JSON_UNESCAPED_UNICODE);
    exit;
}

// مدیریت ETag برای کش
$mtime_latest = file_exists($latestFile) ? filemtime($latestFile) : 0;
$mtime_status = file_exists($statusFile) ? filemtime($statusFile) : 0;
$etag = '"' . md5($mtime_latest . '_' . $mtime_status . '_' . $price_mode) . '"';

header('Cache-Control: public, max-age=15'); 
header('ETag: ' . $etag);

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

// فعال‌سازی GZIP
ob_start('ob_gzhandler');

header('Content-Type: application/json; charset=utf-8');
$cors = $cfg['cors_domain'] ?? 'https://hseqi.ir';
header('Access-Control-Allow-Origin: ' . $cors);

$raw = @file_get_contents($latestFile);
$payload = json_decode($raw, true);

if (!is_array($payload)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Invalid JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$age = time() - ($payload['meta']['updated_ts'] ?? 0);
if ($age > 300) {
    $payload['meta']['stale'] = true;
}

if (file_exists($statusFile)) {
    $status = @json_decode(@file_get_contents($statusFile), true);
    if (is_array($status)) {
        $payload['meta']['collector'] = $status;
    }
}

echo json_encode($payload, JSON_UNESCAPED_UNICODE);
ob_end_flush();