<?php
declare(strict_types=1);

function jwtBase64UrlEncode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function jwtBase64UrlDecode(string $data): string
{
    $padded = $data . str_repeat('=', (4 - strlen($data) % 4) % 4);
    return base64_decode(strtr($padded, '-_', '+/'));
}

function generateToken(int $userId, string $userType, int $companyId): string
{
    $header  = jwtBase64UrlEncode((string) json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload = jwtBase64UrlEncode((string) json_encode([
        'iss'        => 'timetrackingapp',
        'iat'        => time(),
        'exp'        => time() + 86400 * 7,
        'user_id'    => $userId,
        'user_type'  => $userType,
        'company_id' => $companyId,
    ]));
    $sig = jwtBase64UrlEncode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$sig";
}

function verifyToken(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$header, $payload, $sig] = $parts;
    $expected = jwtBase64UrlEncode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $claims = json_decode(jwtBase64UrlDecode($payload), true);
    if (!is_array($claims)) {
        return null;
    }
    if (isset($claims['exp']) && $claims['exp'] < time()) {
        return null;
    }
    return $claims;
}

function getBearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        return $m[1];
    }
    return null;
}
