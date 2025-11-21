-- ATLAS PIM Module Database Tables

-- CVA Stock tracking
CREATE TABLE IF NOT EXISTS `PREFIX_atlaspim_cva_stock` (
    `id_stock` int(11) NOT NULL AUTO_INCREMENT,
    `id_product` int(11) NOT NULL,
    `clave` varchar(100) NOT NULL,
    `stock_branch` int(11) DEFAULT 0,
    `stock_cedis` int(11) DEFAULT 0,
    `last_price` decimal(20,6) DEFAULT 0.000000,
    `currency` varchar(10) DEFAULT 'MXN',
    `has_promotion` tinyint(1) DEFAULT 0,
    `updated_at` datetime NOT NULL,
    PRIMARY KEY (`id_stock`),
    UNIQUE KEY `id_product` (`id_product`),
    KEY `clave` (`clave`),
    KEY `updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rate limiting table
CREATE TABLE IF NOT EXISTS `PREFIX_atlaspim_rate_limit` (
    `id_limit` int(11) NOT NULL AUTO_INCREMENT,
    `identifier` varchar(255) NOT NULL,
    `timestamp` int(11) NOT NULL,
    PRIMARY KEY (`id_limit`),
    KEY `identifier` (`identifier`),
    KEY `timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Security log table
CREATE TABLE IF NOT EXISTS `PREFIX_atlaspim_security_log` (
    `id_log` int(11) NOT NULL AUTO_INCREMENT,
    `event_type` varchar(100) NOT NULL,
    `message` text NOT NULL,
    `ip_address` varchar(45) NOT NULL,
    `user_agent` text,
    `context` text,
    `created_at` datetime NOT NULL,
    PRIMARY KEY (`id_log`),
    KEY `event_type` (`event_type`),
    KEY `ip_address` (`ip_address`),
    KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sync history table
CREATE TABLE IF NOT EXISTS `PREFIX_atlaspim_sync_history` (
    `id_sync` int(11) NOT NULL AUTO_INCREMENT,
    `sync_type` varchar(50) NOT NULL,
    `started_at` datetime NOT NULL,
    `completed_at` datetime,
    `products_updated` int(11) DEFAULT 0,
    `products_failed` int(11) DEFAULT 0,
    `status` varchar(20) DEFAULT 'running',
    `error_message` text,
    PRIMARY KEY (`id_sync`),
    KEY `sync_type` (`sync_type`),
    KEY `started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
