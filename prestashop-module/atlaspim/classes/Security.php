<?php
/**
 * Security hardening class for ATLAS PIM module
 *
 * @author    ATLAS PIM
 * @copyright 2024 ATLAS PIM
 * @license   MIT
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class AtlasPimSecurity
{
    /**
     * Generate HMAC signature for request validation
     *
     * @param string $data The data to sign
     * @param string $secret The secret key
     * @return string HMAC signature
     */
    public static function generateHMAC($data, $secret)
    {
        if (empty($secret)) {
            throw new Exception('HMAC secret is not configured');
        }

        return hash_hmac('sha256', $data, $secret);
    }

    /**
     * Verify HMAC signature
     *
     * @param string $data The data to verify
     * @param string $signature The signature to check
     * @param string $secret The secret key
     * @return bool True if signature is valid
     */
    public static function verifyHMAC($data, $signature, $secret)
    {
        if (empty($secret) || empty($signature)) {
            return false;
        }

        $expectedSignature = self::generateHMAC($data, $secret);

        // Use timing-safe comparison to prevent timing attacks
        return hash_equals($expectedSignature, $signature);
    }

    /**
     * Sanitize input data
     *
     * @param mixed $data The data to sanitize
     * @return mixed Sanitized data
     */
    public static function sanitizeInput($data)
    {
        if (is_array($data)) {
            return array_map([self::class, 'sanitizeInput'], $data);
        }

        if (is_string($data)) {
            // Remove null bytes
            $data = str_replace(chr(0), '', $data);

            // Strip tags and encode special characters
            $data = strip_tags($data);
            $data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');

            return trim($data);
        }

        return $data;
    }

    /**
     * Validate API token format
     *
     * @param string $token The token to validate
     * @return bool True if token format is valid
     */
    public static function isValidTokenFormat($token)
    {
        // Token should be alphanumeric with minimum length
        return !empty($token) &&
               is_string($token) &&
               strlen($token) >= 32 &&
               preg_match('/^[a-zA-Z0-9._-]+$/', $token);
    }

    /**
     * Check if IP is whitelisted
     *
     * @param string $ip The IP address to check
     * @param array $whitelist Array of allowed IPs/ranges
     * @return bool True if IP is whitelisted
     */
    public static function isIPWhitelisted($ip, $whitelist)
    {
        if (empty($whitelist)) {
            return true; // No whitelist = allow all
        }

        foreach ($whitelist as $allowed) {
            // Exact match
            if ($ip === $allowed) {
                return true;
            }

            // CIDR notation support (e.g., 192.168.1.0/24)
            if (strpos($allowed, '/') !== false) {
                if (self::ipInRange($ip, $allowed)) {
                    return true;
                }
            }

            // Wildcard support (e.g., 192.168.*.*)
            if (strpos($allowed, '*') !== false) {
                $pattern = str_replace(
                    ['*', '.'],
                    ['[0-9]+', '\.'],
                    $allowed
                );

                if (preg_match('/^' . $pattern . '$/', $ip)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if IP is in CIDR range
     *
     * @param string $ip The IP address
     * @param string $range CIDR range (e.g., 192.168.1.0/24)
     * @return bool True if IP is in range
     */
    private static function ipInRange($ip, $range)
    {
        list($subnet, $bits) = explode('/', $range);

        $ip = ip2long($ip);
        $subnet = ip2long($subnet);
        $mask = -1 << (32 - $bits);
        $subnet &= $mask;

        return ($ip & $mask) == $subnet;
    }

    /**
     * Rate limiting check (using database)
     *
     * @param string $identifier Unique identifier (IP, user_id, etc.)
     * @param int $maxRequests Maximum requests allowed
     * @param int $windowSeconds Time window in seconds
     * @return bool True if within limits
     */
    public static function checkRateLimit($identifier, $maxRequests, $windowSeconds)
    {
        $table = _DB_PREFIX_ . 'atlaspim_rate_limit';
        $now = time();
        $windowStart = $now - $windowSeconds;

        // Clean old records
        Db::getInstance()->execute("
            DELETE FROM `{$table}`
            WHERE timestamp < " . (int)$windowStart
        );

        // Count recent requests
        $count = Db::getInstance()->getValue("
            SELECT COUNT(*) FROM `{$table}`
            WHERE identifier = '" . pSQL($identifier) . "'
            AND timestamp >= " . (int)$windowStart
        );

        if ($count >= $maxRequests) {
            return false;
        }

        // Log this request
        Db::getInstance()->insert('atlaspim_rate_limit', [
            'identifier' => pSQL($identifier),
            'timestamp' => (int)$now,
        ]);

        return true;
    }

    /**
     * Generate CSRF token
     *
     * @return string CSRF token
     */
    public static function generateCSRFToken()
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['atlaspim_csrf_token'])) {
            $_SESSION['atlaspim_csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['atlaspim_csrf_token'];
    }

    /**
     * Verify CSRF token
     *
     * @param string $token The token to verify
     * @return bool True if token is valid
     */
    public static function verifyCSRFToken($token)
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['atlaspim_csrf_token'])) {
            return false;
        }

        return hash_equals($_SESSION['atlaspim_csrf_token'], $token);
    }

    /**
     * Log security event
     *
     * @param string $event Event type
     * @param string $message Event message
     * @param array $context Additional context
     */
    public static function logSecurityEvent($event, $message, $context = [])
    {
        $table = _DB_PREFIX_ . 'atlaspim_security_log';

        $data = [
            'event_type' => pSQL($event),
            'message' => pSQL($message),
            'ip_address' => pSQL(self::getClientIP()),
            'user_agent' => pSQL($_SERVER['HTTP_USER_AGENT'] ?? ''),
            'context' => pSQL(json_encode($context)),
            'created_at' => date('Y-m-d H:i:s'),
        ];

        Db::getInstance()->insert('atlaspim_security_log', $data);

        // Also log to PrestaShop logger if available
        if (class_exists('PrestaShopLogger')) {
            PrestaShopLogger::addLog(
                '[ATLAS PIM Security] ' . $event . ': ' . $message,
                2, // Warning level
                null,
                null,
                null,
                true
            );
        }
    }

    /**
     * Get real client IP address
     *
     * @return string Client IP address
     */
    public static function getClientIP()
    {
        $headers = [
            'HTTP_CF_CONNECTING_IP', // Cloudflare
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'HTTP_CLIENT_IP',
            'REMOTE_ADDR',
        ];

        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];

                // Handle multiple IPs (take first one)
                if (strpos($ip, ',') !== false) {
                    $ips = explode(',', $ip);
                    $ip = trim($ips[0]);
                }

                // Validate IP format
                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    return $ip;
                }
            }
        }

        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    /**
     * Rotate API token
     *
     * @param string $oldToken The old token to invalidate
     * @return string New token
     */
    public static function rotateAPIToken($oldToken)
    {
        $newToken = bin2hex(random_bytes(32));

        // Log rotation
        self::logSecurityEvent(
            'api_token_rotation',
            'API token rotated',
            ['old_token_prefix' => substr($oldToken, 0, 8)]
        );

        return $newToken;
    }

    /**
     * Validate URL to prevent SSRF
     *
     * @param string $url The URL to validate
     * @return bool True if URL is safe
     */
    public static function isValidURL($url)
    {
        // Parse URL
        $parsed = parse_url($url);

        if (!$parsed || empty($parsed['scheme']) || empty($parsed['host'])) {
            return false;
        }

        // Only allow HTTP/HTTPS
        if (!in_array($parsed['scheme'], ['http', 'https'])) {
            return false;
        }

        // Resolve hostname to IP
        $ip = gethostbyname($parsed['host']);

        // Prevent private/local IPs (SSRF protection)
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }

        return true;
    }

    /**
     * Encrypt sensitive data
     *
     * @param string $data Data to encrypt
     * @param string $key Encryption key
     * @return string Encrypted data (base64 encoded)
     */
    public static function encrypt($data, $key)
    {
        $cipher = 'aes-256-gcm';
        $ivlen = openssl_cipher_iv_length($cipher);
        $iv = openssl_random_pseudo_bytes($ivlen);
        $tag = '';

        $ciphertext = openssl_encrypt(
            $data,
            $cipher,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );

        // Combine IV + Tag + Ciphertext
        return base64_encode($iv . $tag . $ciphertext);
    }

    /**
     * Decrypt sensitive data
     *
     * @param string $encrypted Encrypted data (base64 encoded)
     * @param string $key Encryption key
     * @return string|false Decrypted data or false on failure
     */
    public static function decrypt($encrypted, $key)
    {
        $cipher = 'aes-256-gcm';
        $ivlen = openssl_cipher_iv_length($cipher);
        $data = base64_decode($encrypted);

        if (strlen($data) < $ivlen + 16) {
            return false;
        }

        $iv = substr($data, 0, $ivlen);
        $tag = substr($data, $ivlen, 16);
        $ciphertext = substr($data, $ivlen + 16);

        return openssl_decrypt(
            $ciphertext,
            $cipher,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
    }
}
