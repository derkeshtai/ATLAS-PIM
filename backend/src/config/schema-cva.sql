-- CVA API Integration Schema
-- Este schema soporta la integración con la API del proveedor CVA

-- Configuración de CVA API (credenciales y opciones)
CREATE TABLE IF NOT EXISTS cva_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_number VARCHAR(100) NOT NULL,
    password_encrypted TEXT NOT NULL, -- Password encriptado
    api_token TEXT, -- Token actual de la API
    token_expires_at TIMESTAMP, -- Cuándo expira el token (12 horas)

    -- Opciones de sincronización
    sync_inventory BOOLEAN DEFAULT true,
    sync_prices BOOLEAN DEFAULT true,
    sync_new_products BOOLEAN DEFAULT true,
    sync_promotions BOOLEAN DEFAULT true,
    sync_images BOOLEAN DEFAULT true,

    -- Configuración de sincronización automática
    auto_sync_enabled BOOLEAN DEFAULT false,
    sync_inventory_cron VARCHAR(50) DEFAULT '0 * * * *', -- Cada hora
    sync_prices_cron VARCHAR(50) DEFAULT '0 */6 * * *', -- Cada 6 horas
    sync_new_products_cron VARCHAR(50) DEFAULT '0 */12 * * *', -- Cada 12 horas

    -- Otras configuraciones
    stock_source VARCHAR(20) DEFAULT 'both', -- 'branch', 'cedis', 'both'
    include_out_of_stock BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Solo permitir una configuración
CREATE UNIQUE INDEX IF NOT EXISTS idx_cva_config_singleton ON cva_config ((id IS NOT NULL));

-- Historial de sincronización CVA
CREATE TABLE IF NOT EXISTS cva_sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL, -- 'full', 'inventory', 'prices', 'promotions', 'new_products'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,

    -- Resultados
    products_processed INTEGER DEFAULT 0,
    products_updated INTEGER DEFAULT 0,
    products_created INTEGER DEFAULT 0,
    products_failed INTEGER DEFAULT 0,

    -- Detalles
    total_pages INTEGER,
    current_page INTEGER,
    errors JSONB,
    summary JSONB, -- Resumen de cambios

    status VARCHAR(20) DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
    user_id UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cva_sync_history_type ON cva_sync_history(sync_type);
CREATE INDEX IF NOT EXISTS idx_cva_sync_history_status ON cva_sync_history(status);
CREATE INDEX IF NOT EXISTS idx_cva_sync_history_created ON cva_sync_history(created_at DESC);

-- Mapeo de productos CVA
CREATE TABLE IF NOT EXISTS cva_product_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,

    -- Identificadores CVA
    clave VARCHAR(100) UNIQUE NOT NULL, -- Código interno CVA
    codigo_fabricante VARCHAR(100), -- Código del fabricante

    -- Stock
    stock_branch INTEGER DEFAULT 0, -- Stock en sucursal (disponible)
    stock_cedis INTEGER DEFAULT 0, -- Stock en centro de distribución (disponibleCD)
    total_stock INTEGER GENERATED ALWAYS AS (stock_branch + stock_cedis) STORED,

    -- Precios
    last_price DECIMAL(10, 2),
    last_currency VARCHAR(10),

    -- Sincronización
    last_synced TIMESTAMP,
    last_inventory_sync TIMESTAMP,
    last_price_sync TIMESTAMP,
    sync_errors INTEGER DEFAULT 0, -- Contador de errores consecutivos

    -- Estado
    is_active_in_cva BOOLEAN DEFAULT true,
    has_promotion BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cva_product_mapping_product ON cva_product_mapping(product_id);
CREATE INDEX IF NOT EXISTS idx_cva_product_mapping_clave ON cva_product_mapping(clave);
CREATE INDEX IF NOT EXISTS idx_cva_product_mapping_codigo ON cva_product_mapping(codigo_fabricante);
CREATE INDEX IF NOT EXISTS idx_cva_product_mapping_last_synced ON cva_product_mapping(last_synced);

-- Sucursales CVA
CREATE TABLE IF NOT EXISTS cva_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_code VARCHAR(50) UNIQUE NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    address TEXT,

    -- Contacto
    phone VARCHAR(50),
    email VARCHAR(100),

    -- Estado
    is_active BOOLEAN DEFAULT true,
    is_warehouse BOOLEAN DEFAULT false, -- Si es CEDIS

    -- Geo
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cva_branches_code ON cva_branches(branch_code);
CREATE INDEX IF NOT EXISTS idx_cva_branches_active ON cva_branches(is_active);

-- Stock por sucursal CVA
CREATE TABLE IF NOT EXISTS cva_product_branch_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES cva_branches(id) ON DELETE CASCADE,
    clave VARCHAR(100) NOT NULL, -- Referencia a CVA

    quantity INTEGER DEFAULT 0,

    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_cva_branch_stock_product ON cva_product_branch_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_cva_branch_stock_branch ON cva_product_branch_stock(branch_id);
CREATE INDEX IF NOT EXISTS idx_cva_branch_stock_clave ON cva_product_branch_stock(clave);

-- Extensiones a la tabla products para CVA
ALTER TABLE products ADD COLUMN IF NOT EXISTS cva_clave VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_cva_sync TIMESTAMP;

-- Agregar índice para búsqueda por clave CVA
CREATE INDEX IF NOT EXISTS idx_products_cva_clave ON products(cva_clave) WHERE cva_clave IS NOT NULL;

-- Estados de curación de productos (para IA)
-- Agregar columna de estado de curación
ALTER TABLE products ADD COLUMN IF NOT EXISTS curation_status VARCHAR(50) DEFAULT 'not_curated';
-- Valores posibles: 'not_curated', 'icecat_curated', 'ai_curated_pending', 'ai_approved', 'manually_curated'

ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_curated_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_approved_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_approved_by UUID REFERENCES users(id);

-- Índices para filtrar por estado de curación
CREATE INDEX IF NOT EXISTS idx_products_curation_status ON products(curation_status);
CREATE INDEX IF NOT EXISTS idx_products_needs_review ON products(needs_review) WHERE needs_review = true;

-- Trigger para actualizar updated_at en cva_product_mapping
CREATE OR REPLACE FUNCTION update_cva_product_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cva_product_mapping_timestamp ON cva_product_mapping;
CREATE TRIGGER trigger_cva_product_mapping_timestamp
    BEFORE UPDATE ON cva_product_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_cva_product_mapping_timestamp();

-- Trigger para actualizar updated_at en cva_config
DROP TRIGGER IF EXISTS trigger_cva_config_timestamp ON cva_config;
CREATE TRIGGER trigger_cva_config_timestamp
    BEFORE UPDATE ON cva_config
    FOR EACH ROW
    EXECUTE FUNCTION update_cva_product_mapping_timestamp();

-- Trigger para actualizar updated_at en cva_branches
DROP TRIGGER IF EXISTS trigger_cva_branches_timestamp ON cva_branches;
CREATE TRIGGER trigger_cva_branches_timestamp
    BEFORE UPDATE ON cva_branches
    FOR EACH ROW
    EXECUTE FUNCTION update_cva_product_mapping_timestamp();

-- Rate limiting sin Redis (usando PostgreSQL)
CREATE TABLE IF NOT EXISTS rate_limit_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL, -- IP, user_id, API key, etc.
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMP,

    UNIQUE(identifier, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_records(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end ON rate_limit_records(window_end);

-- Limpiar registros antiguos de rate limiting (llamar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_records
    WHERE window_end < CURRENT_TIMESTAMP - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE cva_config IS 'Configuración de integración con API CVA del proveedor';
COMMENT ON TABLE cva_sync_history IS 'Historial de sincronizaciones con CVA API';
COMMENT ON TABLE cva_product_mapping IS 'Mapeo entre productos PIM y productos CVA';
COMMENT ON TABLE cva_branches IS 'Catálogo de sucursales CVA';
COMMENT ON TABLE cva_product_branch_stock IS 'Stock por sucursal de cada producto';
COMMENT ON TABLE rate_limit_records IS 'Rate limiting usando PostgreSQL (sin Redis)';

COMMENT ON COLUMN products.curation_status IS 'Estado de curación: not_curated, icecat_curated, ai_curated_pending, ai_approved, manually_curated';
COMMENT ON COLUMN products.needs_review IS 'Marca productos que necesitan revisión manual';
