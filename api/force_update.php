<?php
header('Content-Type: application/json; charset=utf-8');
define('IS_MANUAL_UPDATE', true);

// اجرای مستقیم Collector
require_once __DIR__ . '/../collector/fetch.php';

// اگر اجرای fetch.php موفقیت‌آمیز باشد یا قبلاً تمام شده باشد به اینجا می‌رسد
echo json_encode(['ok' => true, 'message' => 'بروزرسانی با موفقیت انجام شد']);