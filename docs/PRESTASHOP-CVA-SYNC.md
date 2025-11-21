# PrestaShop CVA Direct Sync

## Overview

The ATLAS PIM PrestaShop module now includes **direct synchronization** with CVA (Grupo CVA) API, allowing real-time inventory and price updates without going through the ATLAS PIM backend.

This feature is ideal for:
- **High-frequency stock updates** (hourly or more)
- **Real-time checkout validation** (sync stock during cart checkout)
- **Reduced server load** (direct API calls, no middleware)
- **Failover redundancy** (works even if ATLAS PIM backend is down)

## Features

### 1. Direct CVA API Integration
- Authenticate directly with CVA API
- No dependency on ATLAS PIM backend for CVA sync
- Automatic token management (12-hour validity with auto-refresh)

### 2. Automated Sync
- **Hourly inventory sync** (configurable)
- **6-hour price sync** (configurable)
- **Real-time checkout sync** (validate stock before order)

### 3. Multi-Location Stock
- Track stock at **branch** (sucursal)
- Track stock at **CEDIS** (centro de distribución)
- Combined total stock for PrestaShop

### 4. Security
- **Encrypted password storage** (AES-256-GCM)
- **Secure token management**
- **Rate limiting** to prevent API abuse
- **Detailed security logging**

## Installation

### 1. Install Module Files

Upload the ATLAS PIM module to PrestaShop:
```
/modules/atlaspim/
├── atlaspim.php                 # Main module file
├── classes/
│   ├── Security.php             # Security utilities
│   └── CVASync.php              # CVA synchronization
└── sql/
    └── install.sql              # Database schema
```

### 2. Install via PrestaShop Admin

1. Go to **Modules > Module Manager**
2. Search for "ATLAS PIM"
3. Click **Install**
4. Click **Configure**

### 3. Configure CVA Credentials

In the module configuration:

1. **Enable CVA Direct Sync:** Yes
2. **CVA Account Number:** Your GrupoCVA account number
3. **CVA Password:** Your GrupoCVA password (encrypted automatically)
4. **Auto Sync Inventory:** Yes (for hourly updates)
5. **Sync on Checkout:** Yes (for real-time validation)

Click **Save CVA Settings**.

### 4. Test Connection

Click the **Test Connection** button to verify credentials.

You should see: ✓ "CVA connection successful!"

## Configuration Options

### CVA Settings

| Option | Description | Default |
|--------|-------------|---------|
| Enable CVA Direct Sync | Master switch for CVA features | No |
| CVA Account Number | Your GrupoCVA account | - |
| CVA Password | Your GrupoCVA password (encrypted) | - |
| Auto Sync Inventory | Hourly automatic inventory sync | No |
| Sync on Checkout | Real-time sync during checkout | Yes |

### How It Works

#### Hourly Inventory Sync

When enabled, the module automatically syncs inventory every hour:

1. **Trigger:** `hookDisplayBackOfficeHeader` (runs on admin page loads)
2. **Check:** If > 1 hour since last sync
3. **Execute:** Fetch all products from CVA API
4. **Update:** Update PrestaShop stock for matched products

**Product Matching:**
Products are matched by `reference` field in PrestaShop = `clave` in CVA.

**Example:**
```
CVA Product:
  clave: "ABC123"
  disponible: 10 (branch stock)
  disponibleCD: 25 (CEDIS stock)

PrestaShop Product:
  reference: "ABC123"
  → Updated to quantity: 35 (10 + 25)
```

#### Real-Time Checkout Sync

When enabled, stock is validated in real-time during checkout:

1. **Trigger:** Customer clicks "Place Order"
2. **Hook:** `hookActionValidateOrder`
3. **For each product in cart:**
   - Fetch latest stock from CVA API
   - Update PrestaShop stock
4. **Continue:** Order processed with fresh data

**Benefits:**
- Prevents overselling
- Most accurate stock at purchase time
- No race conditions with hourly sync

**Performance:**
- API call per unique product in cart
- ~200-500ms per product
- Async execution (doesn't block checkout UI)

## Database Schema

### CVA Stock Table

Stores detailed CVA stock information:

```sql
CREATE TABLE ps_atlaspim_cva_stock (
    id_stock INT AUTO_INCREMENT PRIMARY KEY,
    id_product INT NOT NULL,           -- PrestaShop product ID
    clave VARCHAR(100) NOT NULL,       -- CVA product code
    stock_branch INT DEFAULT 0,        -- Stock at branch
    stock_cedis INT DEFAULT 0,         -- Stock at CEDIS
    last_price DECIMAL(20,6),          -- Last known price
    currency VARCHAR(10) DEFAULT 'MXN',
    has_promotion BOOLEAN DEFAULT 0,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY (id_product)
);
```

### Sync History Table

Tracks all sync operations:

```sql
CREATE TABLE ps_atlaspim_sync_history (
    id_sync INT AUTO_INCREMENT PRIMARY KEY,
    sync_type VARCHAR(50),             -- 'inventory', 'prices', 'checkout'
    started_at DATETIME,
    completed_at DATETIME,
    products_updated INT DEFAULT 0,
    products_failed INT DEFAULT 0,
    status VARCHAR(20),                -- 'running', 'completed', 'failed'
    error_message TEXT
);
```

## API Endpoints Used

### CVA API Base URL
```
https://apicvaservices.grupocva.com
```

### Authentication
```http
POST /api/v2/user/login
Content-Type: application/json

{
  "cuenta": "YOUR_ACCOUNT_NUMBER",
  "contrasena": "YOUR_PASSWORD"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 43200
}
```

### Products List
```http
GET /api/v2/catalogo_clientes/lista_precios?exist=3&page=1
Authorization: Bearer {token}

Response:
{
  "data": [
    {
      "clave": "ABC123",
      "codigo": "MANUFACTURER_CODE",
      "descripcion": "Product Name",
      "precio": 199.99,
      "moneda": "MXN",
      "disponible": 10,      // Branch stock
      "disponibleCD": 25,    // CEDIS stock
      "promocion": 0,
      "imagenes": ["https://..."]
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 10
  }
}
```

**Query Parameters:**
- `exist=0` - All products
- `exist=1` - Only products with branch stock
- `exist=2` - Only products with CEDIS stock
- `exist=3` - Products with either branch or CEDIS stock
- `clave=ABC123` - Filter by specific product code
- `page=1` - Pagination

## Security Features

### 1. Encrypted Password Storage

CVA passwords are **never stored in plaintext**:

```php
// Encryption (AES-256-GCM)
$key = Configuration::get('ATLASPIM_ENCRYPTION_KEY');
$encrypted = AtlasPimSecurity::encrypt($password, $key);
Configuration::updateValue('ATLASPIM_CVA_PASSWORD_ENCRYPTED', $encrypted);

// Decryption (when needed)
$password = AtlasPimSecurity::decrypt($encrypted, $key);
```

### 2. Automatic Token Refresh

Tokens are valid for 12 hours and automatically refreshed:

```php
private function isTokenValid()
{
    // Refresh if < 1 hour remaining
    return time() < ($this->tokenExpiresAt - 3600);
}
```

### 3. Security Logging

All sync operations and errors are logged:

```php
AtlasPimSecurity::logSecurityEvent(
    'cva_sync',
    'Inventory sync completed',
    ['products_updated' => 245]
);
```

### 4. Rate Limiting

Prevents API abuse:

```php
if (!AtlasPimSecurity::checkRateLimit(
    'cva_api',
    60,  // max requests
    60   // per 60 seconds
)) {
    throw new Exception('Rate limit exceeded');
}
```

## Manual Sync Buttons

### Sync Inventory Button

Trigger full inventory sync manually:

```php
// In admin panel
Click: "Sync Inventory"

// Executes:
$result = $this->cvaSync->syncInventory();

// Returns:
[
  'updated' => 245,
  'errors' => []
]
```

### Sync Prices Button

Update only prices (faster than full sync):

```php
Click: "Sync Prices"

// Executes:
$result = $this->cvaSync->syncPrices();
```

### Test Connection Button

Verify CVA credentials:

```php
Click: "Test Connection"

// Executes:
$connected = $this->cvaSync->testConnection();
```

## Advanced Usage

### Programmatic Sync

Sync specific product by code:

```php
require_once 'modules/atlaspim/classes/CVASync.php';

$cvaSync = new AtlasPimCVASync();

// Sync one product
$result = $cvaSync->syncProduct('ABC123');

// Returns:
[
    'stock_branch' => 10,
    'stock_cedis' => 25,
    'price' => 199.99
]
```

### Custom Cron Setup

If you prefer external cron instead of auto-sync:

```bash
# crontab -e

# Hourly inventory sync
0 * * * * curl -X POST "https://your-store.com/modules/atlaspim/cron.php?action=inventory&key=YOUR_SECRET_KEY"

# Every 6 hours price sync
0 */6 * * * curl -X POST "https://your-store.com/modules/atlaspim/cron.php?action=prices&key=YOUR_SECRET_KEY"
```

Create `/modules/atlaspim/cron.php`:

```php
<?php
require_once '../../config/config.inc.php';
require_once '../../init.php';
require_once 'classes/CVASync.php';

$key = Configuration::get('ATLASPIM_CRON_KEY');
if ($_GET['key'] !== $key) {
    die('Invalid key');
}

$cvaSync = new AtlasPimCVASync();

switch ($_GET['action']) {
    case 'inventory':
        $result = $cvaSync->syncInventory();
        echo json_encode($result);
        break;

    case 'prices':
        $result = $cvaSync->syncPrices();
        echo json_encode($result);
        break;

    default:
        die('Invalid action');
}
```

## Monitoring and Statistics

### View Statistics in Admin Panel

The module shows:
- **Last Sync:** Timestamp of last successful sync
- **Products Synced:** Total products with CVA data
- **Total Stock:** Combined stock across all products

### SQL Queries

**Check stock levels:**
```sql
SELECT
    p.reference,
    p.name,
    c.stock_branch,
    c.stock_cedis,
    (c.stock_branch + c.stock_cedis) as total_stock,
    c.updated_at
FROM ps_product p
JOIN ps_atlaspim_cva_stock c ON p.id_product = c.id_product
ORDER BY c.updated_at DESC;
```

**Recent sync history:**
```sql
SELECT
    sync_type,
    started_at,
    completed_at,
    products_updated,
    status
FROM ps_atlaspim_sync_history
ORDER BY started_at DESC
LIMIT 10;
```

**Products with low stock:**
```sql
SELECT
    p.reference,
    p.name,
    c.stock_branch,
    c.stock_cedis,
    (c.stock_branch + c.stock_cedis) as total
FROM ps_product p
JOIN ps_atlaspim_cva_stock c ON p.id_product = c.id_product
WHERE (c.stock_branch + c.stock_cedis) < 10
ORDER BY total ASC;
```

## Troubleshooting

### Connection Failed

**Error:** "CVA connection failed"

**Solutions:**
1. Verify credentials in CVA configuration
2. Check firewall allows outbound HTTPS to `apicvaservices.grupocva.com`
3. Ensure PHP cURL extension is enabled
4. Check error logs: `/var/log/prestashop/`

### Products Not Syncing

**Error:** Products not updating despite successful sync

**Solutions:**
1. Verify product `reference` matches CVA `clave`
2. Check product mapping:
   ```sql
   SELECT id_product, reference
   FROM ps_product
   WHERE reference = 'YOUR_CVA_CLAVE';
   ```
3. Ensure products are active in PrestaShop
4. Review sync history for errors

### Slow Checkout

**Issue:** Checkout takes too long

**Solutions:**
1. Disable "Sync on Checkout" if not critical
2. Optimize: Only sync products with low stock
3. Implement caching for recently synced products
4. Increase server timeout limits

### Token Expired

**Error:** "CVA API error: HTTP 401"

**Solutions:**
- Tokens auto-refresh, but if issue persists:
  ```sql
  DELETE FROM ps_configuration
  WHERE name LIKE 'ATLASPIM_CVA_TOKEN%';
  ```
- Test connection again to get fresh token

## Best Practices

### 1. Product Mapping

**Always use CVA clave as reference:**
```sql
UPDATE ps_product
SET reference = 'CVA_CLAVE_HERE'
WHERE id_product = 123;
```

### 2. Sync Frequency

**Recommended schedules:**
- **High-volume stores:** Hourly inventory + checkout sync
- **Medium-volume stores:** Every 2-3 hours inventory
- **Low-volume stores:** Every 6-12 hours inventory

### 3. Monitor Sync Failures

Set up alerts for failed syncs:
```sql
-- Count failed syncs in last 24 hours
SELECT COUNT(*)
FROM ps_atlaspim_sync_history
WHERE status = 'failed'
AND started_at > DATE_SUB(NOW(), INTERVAL 24 HOUR);
```

### 4. Stock Alerts

Create low stock notifications:
```sql
-- Products with critical stock levels
SELECT p.name, c.stock_branch, c.stock_cedis
FROM ps_product p
JOIN ps_atlaspim_cva_stock c ON p.id_product = c.id_product
WHERE (c.stock_branch + c.stock_cedis) <= 5;
```

### 5. Backup Before Enabling

Always backup before enabling auto-sync:
```bash
# Database backup
mysqldump -u user -p prestashop > backup_$(date +%Y%m%d).sql

# Test sync manually first
# Then enable auto-sync
```

## Performance Optimization

### 1. Index Optimization

Ensure indexes exist:
```sql
ALTER TABLE ps_atlaspim_cva_stock ADD INDEX idx_clave (clave);
ALTER TABLE ps_atlaspim_cva_stock ADD INDEX idx_updated (updated_at);
ALTER TABLE ps_product ADD INDEX idx_reference (reference);
```

### 2. Partial Sync

Only sync products that changed:
```php
// Custom implementation
$lastSync = Configuration::get('ATLASPIM_CVA_LAST_SYNC');

// Query CVA API with timestamp filter
// (if API supports it)
```

### 3. Batch Processing

Process products in batches:
```php
$batchSize = 100;
$page = 1;

do {
    $products = $this->fetchPage($page, $batchSize);
    $this->processProducts($products);
    $page++;
} while (count($products) === $batchSize);
```

## Support and Updates

For issues or feature requests:
- Check PrestaShop error logs
- Review CVA sync history in database
- Test connection manually
- Verify product reference mapping
- Check server firewall/proxy settings

## Integration with ATLAS PIM Backend

CVA Direct Sync works independently but can complement the ATLAS PIM backend:

- **CVA Sync:** Real-time stock/prices
- **ATLAS PIM:** Enhanced descriptions, images, attributes, AI curation

**Recommended Setup:**
1. Enable CVA sync for stock/prices (hourly)
2. Enable ATLAS PIM sync for product data (daily)
3. Best of both worlds: Fresh stock + rich content
