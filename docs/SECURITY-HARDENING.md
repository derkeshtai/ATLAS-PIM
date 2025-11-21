# ATLAS PIM - Security Hardening Documentation

## Overview

ATLAS PIM implements comprehensive security hardening for both the backend API and PrestaShop module, following industry best practices and OWASP guidelines.

## Security Features

### Backend API Security

1. **Authentication & Authorization**
   - JWT token-based authentication
   - Role-based access control (admin, editor, user)
   - Token expiration and refresh
   - Secure password hashing (bcrypt)

2. **Data Protection**
   - AES-256-GCM encryption for sensitive data
   - Encrypted API credentials in database
   - HMAC signatures for request validation
   - SQL injection prevention (parameterized queries)

3. **Network Security**
   - CORS configuration
   - Helmet.js security headers
   - Rate limiting (PostgreSQL-based, no Redis needed)
   - IP whitelisting support

4. **Input Validation**
   - express-validator for all inputs
   - XSS prevention
   - Path traversal prevention
   - File upload restrictions

### PrestaShop Module Security

1. **Credential Protection**
   - Encrypted password storage
   - Secure token management
   - No plaintext credentials in database

2. **Request Security**
   - HMAC signature validation
   - CSRF protection
   - IP whitelisting
   - Rate limiting

3. **Audit Logging**
   - Security event logging
   - API access logs
   - Failed authentication tracking

4. **Input Sanitization**
   - SQL injection prevention (pSQL)
   - XSS filtering
   - NULL byte removal
   - Tag stripping

## PrestaShop Security Classes

### AtlasPimSecurity Class

Location: `/prestashop-module/atlaspim/classes/Security.php`

#### HMAC Signatures

**Generate HMAC:**
```php
$data = json_encode(['product_id' => 123, 'action' => 'sync']);
$secret = Configuration::get('ATLASPIM_HMAC_SECRET');
$signature = AtlasPimSecurity::generateHMAC($data, $secret);

// Send in header:
// X-HMAC-Signature: {$signature}
```

**Verify HMAC:**
```php
$data = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HMAC_SIGNATURE'] ?? '';
$secret = Configuration::get('ATLASPIM_HMAC_SECRET');

if (!AtlasPimSecurity::verifyHMAC($data, $signature, $secret)) {
    die('Invalid signature');
}
```

#### Input Sanitization

**Sanitize user input:**
```php
$userInput = $_POST['product_name'];
$clean = AtlasPimSecurity::sanitizeInput($userInput);

// Removes:
// - NULL bytes
// - HTML tags
// - Special characters (encoded)
```

**Array sanitization:**
```php
$formData = $_POST;
$cleanData = AtlasPimSecurity::sanitizeInput($formData);
// Recursively sanitizes all array values
```

#### IP Whitelisting

**Configure whitelist:**
```php
// In module configuration
Configuration::updateValue('ATLASPIM_IP_WHITELIST', "
192.168.1.100
192.168.1.0/24
10.0.*.*
");
```

**Check IP:**
```php
$clientIP = AtlasPimSecurity::getClientIP();
$whitelist = explode("\n", Configuration::get('ATLASPIM_IP_WHITELIST'));

if (!AtlasPimSecurity::isIPWhitelisted($clientIP, $whitelist)) {
    AtlasPimSecurity::logSecurityEvent(
        'ip_blocked',
        'Blocked request from non-whitelisted IP',
        ['ip' => $clientIP]
    );
    die('Access denied');
}
```

**Supported formats:**
- Exact IP: `192.168.1.100`
- CIDR notation: `192.168.1.0/24`
- Wildcards: `192.168.*.*` or `10.0.*.100`

#### Rate Limiting

**Database-based rate limiting:**
```php
$identifier = AtlasPimSecurity::getClientIP();
$maxRequests = 60;
$windowSeconds = 60;

if (!AtlasPimSecurity::checkRateLimit($identifier, $maxRequests, $windowSeconds)) {
    AtlasPimSecurity::logSecurityEvent(
        'rate_limit_exceeded',
        'Too many requests',
        ['ip' => $identifier]
    );
    http_response_code(429);
    die('Rate limit exceeded');
}
```

**Configurable limits:**
```sql
-- In ps_configuration
UPDATE ps_configuration
SET value = '60'
WHERE name = 'ATLASPIM_RATE_LIMIT_REQUESTS';

UPDATE ps_configuration
SET value = '60'
WHERE name = 'ATLASPIM_RATE_LIMIT_WINDOW';
```

#### CSRF Protection

**Generate token:**
```php
$token = AtlasPimSecurity::generateCSRFToken();

// In form:
echo '<input type="hidden" name="csrf_token" value="' . $token . '">';
```

**Verify token:**
```php
$submittedToken = $_POST['csrf_token'] ?? '';

if (!AtlasPimSecurity::verifyCSRFToken($submittedToken)) {
    die('Invalid CSRF token');
}
```

#### Encryption

**Encrypt sensitive data:**
```php
$secretData = 'my_api_password';
$key = Configuration::get('ATLASPIM_ENCRYPTION_KEY');

$encrypted = AtlasPimSecurity::encrypt($secretData, $key);
Configuration::updateValue('MY_SECRET', $encrypted);
```

**Decrypt data:**
```php
$encrypted = Configuration::get('MY_SECRET');
$key = Configuration::get('ATLASPIM_ENCRYPTION_KEY');

$decrypted = AtlasPimSecurity::decrypt($encrypted, $key);
```

**Encryption details:**
- Algorithm: AES-256-GCM
- Authenticated encryption (AEAD)
- Random IV per encryption
- Authentication tag included

#### Security Logging

**Log events:**
```php
AtlasPimSecurity::logSecurityEvent(
    'login_attempt',
    'Failed login from admin',
    [
        'username' => 'admin',
        'ip' => $_SERVER['REMOTE_ADDR']
    ]
);
```

**View logs:**
```sql
SELECT *
FROM ps_atlaspim_security_log
WHERE event_type = 'login_attempt'
ORDER BY created_at DESC
LIMIT 50;
```

**Log retention:**
```sql
-- Delete logs older than 90 days
DELETE FROM ps_atlaspim_security_log
WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

#### SSRF Prevention

**Validate URLs:**
```php
$externalURL = $_POST['image_url'];

if (!AtlasPimSecurity::isValidURL($externalURL)) {
    die('Invalid or unsafe URL');
}

// Safe to fetch
$imageData = file_get_contents($externalURL);
```

**Protection against:**
- Local file access (`file://`)
- Private IP ranges (10.x.x.x, 192.168.x.x)
- Localhost (127.0.0.1, ::1)
- Link-local addresses

#### Client IP Detection

**Get real client IP:**
```php
$ip = AtlasPimSecurity::getClientIP();

// Checks headers in order:
// 1. HTTP_CF_CONNECTING_IP (Cloudflare)
// 2. HTTP_X_FORWARDED_FOR
// 3. HTTP_X_REAL_IP
// 4. HTTP_CLIENT_IP
// 5. REMOTE_ADDR
```

**Validate IP:**
```php
// Filters out private/reserved IPs from proxies
// Returns first public IP found
```

### CVASync Security

Location: `/prestashop-module/atlaspim/classes/CVASync.php`

#### Encrypted Credentials

**Save credentials:**
```php
$cvaSync = new AtlasPimCVASync();
$cvaSync->saveCredentials(
    'YOUR_ACCOUNT_NUMBER',
    'YOUR_PASSWORD'
);

// Password encrypted with AES-256-GCM
// Encryption key auto-generated
// Stored in: ATLASPIM_CVA_PASSWORD_ENCRYPTED
```

**Automatic decryption:**
```php
// Credentials decrypted only when needed for API calls
// Never stored in memory longer than necessary
private function getDecryptedPassword()
{
    $encrypted = Configuration::get('ATLASPIM_CVA_PASSWORD_ENCRYPTED');
    $key = $this->getEncryptionKey();
    return AtlasPimSecurity::decrypt($encrypted, $key);
}
```

#### Token Security

**Token storage:**
- Tokens stored in database (not in code)
- Automatic expiration (12 hours)
- Auto-refresh before expiry
- Cleared on credential change

**Token validation:**
```php
private function isTokenValid()
{
    // Refresh if < 1 hour remaining
    return time() < ($this->tokenExpiresAt - 3600);
}
```

## Backend API Security

### Authentication

**Generate token:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "secure_password"
  }'

# Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Use token:**
```bash
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Role-Based Access Control

**Roles:**
- `admin` - Full access to all endpoints
- `editor` - CRUD on products, limited admin access
- `user` - Read-only access

**Middleware usage:**
```typescript
import { authenticate, authorize } from './middleware/auth';

// Require authentication
router.use(authenticate);

// Require admin role
router.use(authorize('admin'));

// Allow multiple roles
router.use(authorize('admin', 'editor'));
```

### Rate Limiting

**PostgreSQL-based (no Redis):**
```typescript
// Default: 100 requests per 15 minutes per IP
// Configurable in .env:
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Implementation:**
```sql
-- Rate limit tracking table
CREATE TABLE rate_limit_records (
    identifier VARCHAR(255),
    endpoint VARCHAR(255),
    request_count INTEGER,
    window_start TIMESTAMP,
    window_end TIMESTAMP
);
```

### Encryption

**Encrypt API credentials:**
```typescript
import { encryptData, decryptData } from './utils/encryption';

const encrypted = encryptData(apiKey, process.env.ENCRYPTION_KEY);
await pool.query(
  'UPDATE cva_config SET password_encrypted = $1',
  [encrypted]
);
```

**Decryption:**
```typescript
const result = await pool.query('SELECT password_encrypted FROM cva_config');
const decrypted = decryptData(
  result.rows[0].password_encrypted,
  process.env.ENCRYPTION_KEY
);
```

## Security Configuration

### Backend (.env)

```bash
# JWT
JWT_SECRET=your-super-secret-key-change-me
JWT_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=your-256-bit-encryption-key

# CORS
CORS_ORIGIN=https://your-frontend.com,https://prestashop.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### PrestaShop Module

In **Modules > ATLAS PIM > Security Configuration**:

1. **Enable Security Features:** Yes
2. **Enable HMAC Signatures:** Yes (recommended for production)
3. **IP Whitelist:** Your server IPs (one per line)
4. **Enable Rate Limiting:** Yes
5. **Rate Limit:** 60 requests per 60 seconds

## Security Best Practices

### 1. Strong Secrets

**Generate secure secrets:**
```bash
# JWT Secret (256-bit)
openssl rand -hex 32

# Encryption Key (256-bit)
openssl rand -hex 32

# HMAC Secret (256-bit)
openssl rand -hex 32
```

### 2. HTTPS Only

**Enforce HTTPS:**
```nginx
# Nginx
server {
    listen 80;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
}
```

### 3. Regular Security Audits

**Check security logs:**
```sql
-- Failed login attempts
SELECT COUNT(*), ip_address
FROM ps_atlaspim_security_log
WHERE event_type = 'login_failed'
AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY ip_address
HAVING COUNT(*) > 5;

-- Suspicious IPs
SELECT ip_address, COUNT(*) as events
FROM ps_atlaspim_security_log
WHERE event_type IN ('ip_blocked', 'rate_limit_exceeded', 'invalid_token')
GROUP BY ip_address
ORDER BY events DESC;
```

### 4. Credential Rotation

**Rotate API tokens periodically:**
```php
// Every 90 days
$oldToken = Configuration::get('ATLASPIM_API_TOKEN');
$newToken = AtlasPimSecurity::rotateAPIToken($oldToken);
Configuration::updateValue('ATLASPIM_API_TOKEN', $newToken);
```

**Rotate encryption keys:**
```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Re-encrypt all data with new key
# Update ENCRYPTION_KEY in .env
```

### 5. Principle of Least Privilege

**Use specific roles:**
```typescript
// ✓ GOOD
router.post('/products', authenticate, authorize('editor', 'admin'), createProduct);

// ✗ BAD
router.post('/products', authenticate, createProduct);
```

### 6. Input Validation

**Always validate and sanitize:**
```php
// ✓ GOOD
$productId = (int)$_GET['id'];
$name = AtlasPimSecurity::sanitizeInput($_POST['name']);

// ✗ BAD
$productId = $_GET['id'];
$name = $_POST['name'];
```

### 7. Error Handling

**Don't leak sensitive info:**
```php
// ✓ GOOD
catch (Exception $e) {
    error_log($e->getMessage());
    die('An error occurred');
}

// ✗ BAD
catch (Exception $e) {
    die('Error: ' . $e->getMessage());  // May leak paths, queries
}
```

## Security Checklist

### Pre-Production

- [ ] Change all default secrets (JWT, encryption, HMAC)
- [ ] Enable HTTPS with valid certificate
- [ ] Configure IP whitelist for admin endpoints
- [ ] Enable rate limiting
- [ ] Set up security logging
- [ ] Review and remove debug code
- [ ] Test authentication and authorization
- [ ] Verify encrypted credentials work
- [ ] Check CORS configuration
- [ ] Enable CSRF protection

### Production

- [ ] Monitor security logs daily
- [ ] Review failed authentication attempts
- [ ] Check rate limit violations
- [ ] Audit user permissions monthly
- [ ] Rotate credentials quarterly
- [ ] Update dependencies regularly
- [ ] Backup encryption keys securely
- [ ] Test disaster recovery
- [ ] Review IP whitelist monthly
- [ ] Monitor unusual API patterns

### Incident Response

- [ ] Document security contacts
- [ ] Create incident response plan
- [ ] Set up alerting for security events
- [ ] Regular security backups
- [ ] Test restore procedures
- [ ] Maintain audit trail
- [ ] Know how to revoke tokens
- [ ] Know how to block IPs
- [ ] Document escalation procedures

## Vulnerability Reporting

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Email security details to: security@your-domain.com
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Updates

Stay informed:
- Subscribe to security advisories
- Monitor dependency vulnerabilities
- Review OWASP Top 10 annually
- Update PrestaShop and modules regularly
- Follow security best practices

## Compliance

### GDPR

- Personal data encrypted at rest
- Secure data transmission (HTTPS)
- Access logging for audit
- Right to be forgotten (data deletion)
- Data minimization (only store necessary data)

### PCI DSS (if handling payments)

- Secure password storage (bcrypt)
- Encryption of sensitive data
- Access control and authentication
- Logging and monitoring
- Regular security testing

## Support

For security questions:
- Review this documentation
- Check security logs
- Test in development first
- Contact security team for incidents
