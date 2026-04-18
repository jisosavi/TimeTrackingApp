<?php
declare(strict_types=1);

// Router for /company/{slug}/admin/ paths
$request_uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$script_name = dirname($_SERVER['SCRIPT_NAME']);

// Extract slug from URL: /company/{slug}/admin/
if (preg_match('~^/company/([a-z0-9-]+)/admin/?(.*)$~', $request_uri, $matches)) {
    $slug = $matches[1];
    $remaining = $matches[2] ?? '';
    
    // Set context for admin panel
    $_REQUEST['_company_slug'] = $slug;
    
    // If it's admin.js or other assets, serve them
    if ($remaining && file_exists(__DIR__ . '/' . $remaining)) {
        // Serve the asset directly
        return false; // PHP development server will serve the file
    }
    
    // Otherwise serve the admin index
    include __DIR__ . '/test-company/admin/index.html';
    exit;
}

// No route matched
http_response_code(404);
echo "Not Found";
