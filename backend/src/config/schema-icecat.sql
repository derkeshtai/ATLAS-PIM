-- Schema extensions for Icecat integration

-- Product technical specifications (flexible key-value storage)
CREATE TABLE IF NOT EXISTS product_specifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    spec_key VARCHAR(255) NOT NULL,
    spec_value TEXT,
    spec_group VARCHAR(100), -- Category of specification (e.g., "Display", "Processor", etc.)
    spec_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, spec_key)
);

-- Icecat product mapping (to track Icecat IDs)
CREATE TABLE IF NOT EXISTS icecat_product_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    icecat_id VARCHAR(100),
    gtin_ean_upc VARCHAR(100),
    requested_prod_id VARCHAR(100),
    supplier_icecat VARCHAR(100),
    quality VARCHAR(50), -- ICECAT quality rating
    on_market BOOLEAN DEFAULT true,
    product_views INTEGER DEFAULT 0,
    last_synced TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- Product multimedia (for Icecat images, videos, PDFs)
CREATE TABLE IF NOT EXISTS product_multimedia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    media_type VARCHAR(50) NOT NULL, -- 'image', 'video', 'pdf', 'manual', etc.
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    resolution VARCHAR(50),
    file_size INTEGER,
    description TEXT,
    is_primary BOOLEAN DEFAULT false,
    position INTEGER DEFAULT 0,
    expiration_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add Icecat-specific fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS icecat_id VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin_ean_upc VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_family VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_series VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_name VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_rating VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS on_market BOOLEAN DEFAULT true;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_specifications_product ON product_specifications(product_id);
CREATE INDEX IF NOT EXISTS idx_specifications_key ON product_specifications(spec_key);
CREATE INDEX IF NOT EXISTS idx_specifications_group ON product_specifications(spec_group);
CREATE INDEX IF NOT EXISTS idx_icecat_mapping_product ON icecat_product_mapping(product_id);
CREATE INDEX IF NOT EXISTS idx_icecat_mapping_icecat_id ON icecat_product_mapping(icecat_id);
CREATE INDEX IF NOT EXISTS idx_icecat_mapping_gtin ON icecat_product_mapping(gtin_ean_upc);
CREATE INDEX IF NOT EXISTS idx_multimedia_product ON product_multimedia(product_id);
CREATE INDEX IF NOT EXISTS idx_multimedia_type ON product_multimedia(media_type);
CREATE INDEX IF NOT EXISTS idx_products_icecat_id ON products(icecat_id);
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin_ean_upc);

-- Trigger for updating icecat_product_mapping timestamp
CREATE OR REPLACE FUNCTION update_icecat_sync_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_synced = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_icecat_mapping_timestamp BEFORE UPDATE ON icecat_product_mapping
    FOR EACH ROW EXECUTE FUNCTION update_icecat_sync_timestamp();
