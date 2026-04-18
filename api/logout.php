<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Only clear the calling user's own session keys so other concurrent
// sessions (e.g. employee open in another tab) are not destroyed.
if (isset($_SESSION['admin_id'])) {
    unset($_SESSION['admin_id'], $_SESSION['admin_email'],
          $_SESSION['admin_name'], $_SESSION['admin_role'], $_SESSION['company_id']);
}
if (isset($_SESSION['supervisor_id'])) {
    unset($_SESSION['supervisor_id'], $_SESSION['supervisor_company_id']);
}
// Never unset employee_id here — employees have no explicit logout button
// and destroying their session would break the employee UI.

echo json_encode(['success' => true]);
