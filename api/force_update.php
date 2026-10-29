<?php
header('Content-Type: application/json; charset=utf-8');
define('IS_MANUAL_UPDATE', true);

$statusFile = __DIR__ . '/../data/status.json';
if (file_exists($statusFile)) {
    $mtime = filemtime($statusFile);
    if (time() - $mtime < 30) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'message' => 'Too many requests. Please wait 30 seconds.']);
        die();
    }
}
// اجرای مستقیم Collector
require_once __DIR__ . '/../collector/fetch.php';

// اگر اجرای fetch.php موفقیت‌آمیز باشد یا قبلاً تمام شده باشد به اینجا می‌رسد
echo json_encode(['ok' => true, 'message' => 'بروزرسانی با موفقیت انجام شد']);