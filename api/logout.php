<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

// JWT is stateless — the client removes the token from localStorage.
// This endpoint exists for compatibility and future token blacklisting.
sendJson(['success' => true]);
