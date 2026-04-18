<?php
declare(strict_types=1);

/**
 * Router for PHP development server
 * Maps /{slug}/admin/* to /company/{slug}/admin/index.html or asset files
 */

$request_path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

$mime_types = [
    'js'   => 'application/javascript',
    'css'  => 'text/css',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'gif'  => 'image/gif',
    'ico'  => 'image/x-icon',
    'svg'  => 'image/svg+xml',
    'woff' => 'font/woff',
    'ttf'  => 'font/ttf',
];

function serveAsset(string $real_path, array $mime_types): void
{
    $ext = strtolower(pathinfo($real_path, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($mime_types[$ext] ?? 'application/octet-stream'));
    readfile($real_path);
    exit;
}

// Handle /{slug}/admin/* routes
if (preg_match('~^/([a-z0-9-]+)/admin(/.*)?$~', $request_path, $matches)) {
    $slug = $matches[1];
    $file_path = $matches[2] ?? '/';

    if ($file_path !== '/' && preg_match('~\.(?:js|css|png|jpg|gif|ico|svg|woff|ttf)$~', $file_path)) {
        $real_path = __DIR__ . "/company/$slug/admin" . $file_path;
        if (file_exists($real_path)) {
            serveAsset($real_path, $mime_types);
        }
    }

    $real_path = __DIR__ . "/company/$slug/admin/index.html";
    if (file_exists($real_path)) {
        include $real_path;
        exit;
    }

    http_response_code(404);
    exit("Company not found: $slug");
}

// Backwards compatibility for /company/{slug}/admin/* routes
if (preg_match('~^/company/([a-z0-9-]+)/admin(/.*)?$~', $request_path, $matches)) {
    $slug = $matches[1];
    $file_path = $matches[2] ?? '/';

    if ($file_path !== '/' && preg_match('~\.(?:js|css|png|jpg|gif|ico|svg|woff|ttf)$~', $file_path)) {
        $real_path = __DIR__ . "/company/$slug/admin" . $file_path;
        if (file_exists($real_path)) {
            serveAsset($real_path, $mime_types);
        }
    }

    $real_path = __DIR__ . "/company/$slug/admin/index.html";
    if (file_exists($real_path)) {
        include $real_path;
        exit;
    }

    http_response_code(404);
    exit("Company not found: $slug");
}

// Handle /{slug}/approval/* routes - supervisor portal
if (preg_match('~^/([a-z0-9-]+)/approval(/.*)?$~', $request_path, $matches)) {
    $slug = $matches[1];
    if (is_dir(__DIR__ . "/company/$slug")) {
        include __DIR__ . '/approval.html';
        exit;
    }
    http_response_code(404);
    exit("Company not found: $slug");
}

// Handle /{slug}/ employee routes - serve root index.html
if (preg_match('~^/([a-z0-9-]+)/?$~', $request_path, $matches)) {
    $slug = $matches[1];
    if (is_dir(__DIR__ . "/company/$slug")) {
        include __DIR__ . '/index.html';
        exit;
    }
}

// Default: let PHP dev server handle it
return false;
