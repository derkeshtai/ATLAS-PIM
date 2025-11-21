# ATLAS PIM - Cron Jobs Documentation

## Overview

ATLAS PIM includes an automated cron job system for scheduled synchronization and maintenance tasks. The system uses `node-cron` to schedule and execute tasks without external dependencies.

## Features

- **CVA Inventory Sync** - Automatic hourly synchronization of stock levels
- **CVA Price Sync** - Periodic price updates (every 6 hours by default)
- **CVA Product Discovery** - Daily discovery of new products from CVA
- **AI Curation** - Scheduled AI-powered product content generation
- **Configurable Schedules** - All schedules are database-driven and customizable
- **Manual Execution** - Run any job on-demand via API
- **Status Monitoring** - Track job execution and history

## Configuration

### Database Configuration

Cron job schedules are stored in the database:

#### CVA Configuration (`cva_config` table)
```sql
-- Enable auto-sync
auto_sync_enabled: true

-- Cron schedules (standard cron syntax)
sync_inventory_cron: '0 * * * *'        -- Every hour at minute 0
sync_prices_cron: '0 */6 * * *'         -- Every 6 hours
sync_new_products_cron: '0 2 * * *'     -- Daily at 2 AM
```

#### AI Curation Configuration (`ai_curation_config` table)
```sql
-- Enable auto-curation
auto_curation_enabled: true

-- Cron schedule
auto_curation_schedule: '0 3 * * *'     -- Daily at 3 AM

-- Batch size
batch_size: 50                           -- Products per run
```

### Environment Variables

```bash
# Disable cron jobs (useful for development/testing)
ENABLE_CRON_JOBS=false

# Timezone for cron schedules (default: America/Mexico_City)
CRON_TIMEZONE=America/Mexico_City
```

## Cron Syntax Reference

```
 ┌────────────── minute (0 - 59)
 │ ┌──────────── hour (0 - 23)
 │ │ ┌────────── day of month (1 - 31)
 │ │ │ ┌──────── month (1 - 12)
 │ │ │ │ ┌────── day of week (0 - 7) (Sunday=0 or 7)
 │ │ │ │ │
 * * * * *
```

### Common Examples

```bash
'0 * * * *'        # Every hour
'*/30 * * * *'     # Every 30 minutes
'0 */6 * * *'      # Every 6 hours
'0 0 * * *'        # Daily at midnight
'0 2 * * *'        # Daily at 2 AM
'0 0 * * 0'        # Weekly on Sunday at midnight
'0 0 1 * *'        # Monthly on the 1st at midnight
```

## API Endpoints

All cron job management endpoints require admin authentication.

### Get Job Status
```http
GET /api/v1/cron/status
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "name": "cva_inventory_sync",
        "running": true
      },
      {
        "name": "cva_price_sync",
        "running": true
      },
      {
        "name": "ai_curation",
        "running": true
      }
    ],
    "totalJobs": 3
  }
}
```

### Reload Configuration
Reload cron schedules from database (useful after changing configurations):

```http
POST /api/v1/cron/reload
Authorization: Bearer {admin_token}
```

### Run Job Manually
Execute a job immediately (bypasses schedule):

```http
POST /api/v1/cron/run/{jobName}
Authorization: Bearer {admin_token}
```

**Available Job Names:**
- `cva_inventory_sync` - Sync inventory from CVA
- `cva_price_sync` - Sync prices from CVA
- `cva_product_discovery` - Discover new products
- `ai_curation` - Run AI curation batch

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/cron/run/cva_inventory_sync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Stop/Start Jobs

**Stop a specific job:**
```http
POST /api/v1/cron/stop/{jobName}
Authorization: Bearer {admin_token}
```

**Start a specific job:**
```http
POST /api/v1/cron/start/{jobName}
Authorization: Bearer {admin_token}
```

**Stop all jobs:**
```http
POST /api/v1/cron/stop-all
Authorization: Bearer {admin_token}
```

## Job Details

### CVA Inventory Sync
- **Default Schedule:** Hourly (`0 * * * *`)
- **Purpose:** Update product stock levels from CVA API
- **Duration:** ~2-5 minutes (depends on product count)
- **Database Table:** `cva_sync_history`

### CVA Price Sync
- **Default Schedule:** Every 6 hours (`0 */6 * * *`)
- **Purpose:** Update product prices from CVA API
- **Duration:** ~2-5 minutes
- **Database Table:** `cva_sync_history`

### CVA Product Discovery
- **Default Schedule:** Daily at 2 AM (`0 2 * * *`)
- **Purpose:** Find new products available in CVA catalog
- **Duration:** ~5-10 minutes
- **Database Table:** `cva_sync_history`

### AI Curation
- **Default Schedule:** Daily at 3 AM (`0 3 * * *`)
- **Purpose:** Generate AI-powered product descriptions
- **Batch Size:** Configurable (default 50 products)
- **Duration:** Varies based on batch size and AI provider
- **Database Table:** `ai_curation_history`

## Monitoring and Logging

### View Sync History

**CVA Sync History:**
```sql
SELECT
  sync_type,
  started_at,
  finished_at,
  products_processed,
  products_updated,
  status,
  error_message
FROM cva_sync_history
ORDER BY started_at DESC
LIMIT 20;
```

**AI Curation History:**
```sql
SELECT
  operation_type,
  started_at,
  completed_at,
  products_processed,
  products_updated,
  status,
  error_message
FROM ai_curation_history
ORDER BY started_at DESC
LIMIT 20;
```

### Log Output

Cron jobs log to stdout/stderr with timestamps:

```
[2024-11-21 10:00:00] Initializing cron jobs...
[2024-11-21 10:00:00] Scheduled CVA inventory sync: 0 * * * *
[2024-11-21 10:00:00] Scheduled CVA price sync: 0 */6 * * *
[2024-11-21 10:00:00] ✓ Cron jobs initialized successfully

[2024-11-21 11:00:00] Running scheduled task: cva_inventory_sync
[2024-11-21 11:00:05] CVA inventory sync completed: {updated: 245}
[2024-11-21 11:00:05] Completed scheduled task: cva_inventory_sync
```

## Troubleshooting

### Jobs Not Running

**Check if cron jobs are enabled:**
```bash
# In .env file
ENABLE_CRON_JOBS=true  # Should NOT be 'false'
```

**Check logs on startup:**
```bash
# Should see this message
✓ Cron jobs initialized
```

**Verify database configuration:**
```sql
-- Check CVA config
SELECT auto_sync_enabled, sync_inventory_cron
FROM cva_config
WHERE id = 1;

-- Should return: auto_sync_enabled = true
```

### Invalid Cron Schedule

If a cron schedule is invalid, you'll see an error in logs:
```
Invalid cron schedule for cva_inventory_sync: invalid_schedule
```

**Fix:**
```sql
-- Update with valid cron syntax
UPDATE cva_config
SET sync_inventory_cron = '0 * * * *'
WHERE id = 1;

-- Reload cron jobs
POST /api/v1/cron/reload
```

### Job Fails Silently

Check the sync history tables for error messages:

```sql
SELECT error_message
FROM cva_sync_history
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 5;
```

### Memory Issues

If jobs consume too much memory:

**Reduce AI batch size:**
```sql
UPDATE ai_curation_config
SET batch_size = 20  -- Reduce from 50
WHERE id = 1;
```

**Adjust Node.js memory limit:**
```bash
# In package.json or startup script
node --max-old-space-size=2048 dist/index.js
```

## Best Practices

### 1. Schedule Non-Overlapping Jobs
Avoid scheduling heavy jobs at the same time:
```
✓ GOOD:
- Inventory sync: 0 * * * *    (hourly)
- Price sync: 30 */6 * * *      (every 6 hours at :30)
- AI curation: 0 3 * * *        (daily at 3 AM)

✗ BAD:
- All jobs at: 0 * * * *        (can cause resource contention)
```

### 2. Monitor Job Duration
Track how long jobs take and adjust schedules accordingly:
```sql
SELECT
  sync_type,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM cva_sync_history
WHERE status = 'completed'
GROUP BY sync_type;
```

### 3. Set Up Alerts
Create alerts for failed jobs:
```sql
-- Example: Check for failed jobs in last hour
SELECT COUNT(*)
FROM cva_sync_history
WHERE status = 'failed'
AND started_at > NOW() - INTERVAL '1 hour';
```

### 4. Regular Cleanup
Old sync history can be cleaned up periodically:
```sql
-- Delete sync history older than 30 days
DELETE FROM cva_sync_history
WHERE started_at < NOW() - INTERVAL '30 days';

DELETE FROM ai_curation_history
WHERE started_at < NOW() - INTERVAL '30 days';
```

### 5. Test Before Enabling
Always test cron jobs manually before enabling automatic scheduling:
```bash
# 1. Test manually first
curl -X POST http://localhost:3000/api/v1/cron/run/cva_inventory_sync \
  -H "Authorization: Bearer TOKEN"

# 2. Verify results

# 3. Enable auto-sync
UPDATE cva_config SET auto_sync_enabled = true WHERE id = 1;

# 4. Reload cron jobs
curl -X POST http://localhost:3000/api/v1/cron/reload \
  -H "Authorization: Bearer TOKEN"
```

## Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name atlas-pim

# Enable startup on boot
pm2 startup
pm2 save

# Monitor logs
pm2 logs atlas-pim
```

### Using Docker

Cron jobs work automatically with Docker Compose:
```bash
docker-compose up -d
docker-compose logs -f backend
```

### Systemd Service

Create `/etc/systemd/system/atlas-pim.service`:
```ini
[Unit]
Description=ATLAS PIM Backend
After=network.target postgresql.service

[Service]
Type=simple
User=atlas
WorkingDirectory=/opt/atlas-pim/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable atlas-pim
sudo systemctl start atlas-pim
sudo journalctl -u atlas-pim -f
```

## Security Considerations

1. **Admin-Only Access** - All cron management endpoints require admin role
2. **Rate Limiting** - API endpoints are rate-limited to prevent abuse
3. **Input Validation** - Job names are validated before execution
4. **Error Logging** - All errors are logged with context for auditing
5. **No Sensitive Data in Logs** - Credentials are never logged

## Support

For issues or questions:
- Check logs: `docker-compose logs backend`
- Review sync history in database
- Verify configuration with `/api/v1/cron/status`
- Test jobs manually before enabling auto-sync
