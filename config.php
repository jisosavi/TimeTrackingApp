<?php
declare(strict_types=1);

// Load local dev overrides (gitignored — never committed)
if (file_exists(__DIR__ . '/config.local.php')) {
    require_once __DIR__ . '/config.local.php';
}

define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: '');
define('JWT_SECRET',     getenv('JWT_SECRET')     ?: '');
define('APP_KEY',        getenv('APP_KEY')         ?: '');

define('SALAXY_API_URL',        getenv('SALAXY_API_URL')        ?: 'https://test-api.salaxy.com/v03/api');
define('SALAXY_TOKEN_URL',      getenv('SALAXY_TOKEN_URL')      ?: 'https://test-api.salaxy.com/oauth2/token');
define('SALAXY_USERNAME',       getenv('SALAXY_USERNAME')       ?: '');
define('SALAXY_PASSWORD',       getenv('SALAXY_PASSWORD')       ?: '');
define('SALAXY_EMPLOYMENT_ID',  getenv('SALAXY_EMPLOYMENT_ID')  ?: '');

define('DB_FILE', __DIR__ . '/data/app.sqlite');
