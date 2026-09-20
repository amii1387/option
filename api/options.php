<?php
// api/options.php
// Dashboard این را صدا می‌زند و JSON نهایی را می‌گیرد

$cfg = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');

$latestFile = $cfg['data_dir'] . '/latest.json';
$statusFile = $cfg['data_dir'] . '/status.json';

// ─── اگر داده هنوز آماده نیست ───
if (!file_exists($latestFile)) {
    http_response_code(503);
    echo json_encode([
        'ok'       => false,
        'message'  => 'داده هنوز آماده نیست — اولین Collector در حال اجراست',
        'retry_in' => 5,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── خواندن داده ───
$raw = @file_get_contents($latestFile);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Cannot read latest.json'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Invalid JSON in latest.json'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── هشدار اگر داده قدیمی است ───
$age = time() - ($payload['meta']['updated_ts'] ?? 0);
if ($age > 300) {
    // بیش از ۵ دقیقه
    $payload['meta']['stale'] = true;
    $payload['meta']['age_seconds'] = $age;
}

// ─── اضافه کردن وضعیت Collector ───
if (file_exists($statusFile)) {
    $status = @json_decode(@file_get_contents($statusFile), true);
    if (is_array($status)) {
        $payload['meta']['collector'] = $status;
    }
}

echo json_encode($payload, JSON_UNESCAPED_UNICODE);