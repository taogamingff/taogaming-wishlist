
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$allowedOrigin = '*'; // Khi triển khai, hãy đổi thành domain của bạn.
header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'message' => 'Chỉ hỗ trợ GET.'
    ]);
    exit;
}

$action = $_GET['action'] ?? '';

if ($action === 'item') {
    $id = $_GET['item'] ?? '';

    if (!is_string($id) || !preg_match('/^[0-9]{1,20}$/', $id)) {
        http_response_code(400);
        echo json_encode([
            'ok' => false,
            'message' => 'ID item không hợp lệ.'
        ]);
        exit;
    }

    echo json_encode([
        'ok' => true,
        'itemId' => $id,
        'imageUrl' => 'https://cdn.jsdelivr.net/gh/AfnanTawsif/ff-catalog@main/Item-icons/' . $id . '.webp',
        'libraryUrl' => 'https://kingofgames02.github.io/Free-Fire-Items-Library/?item=' . rawurlencode($id)
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(400);
echo json_encode([
    'ok' => false,
    'message' => 'Action không hợp lệ. Dùng ?action=item&item=907104745'
]);
