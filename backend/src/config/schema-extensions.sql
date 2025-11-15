-- Extension to schema for supplier-specific features

-- Add promotions/discounts table
CREATE TABLE IF NOT EXISTS product_promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    promotion_code VARCHAR(100),
    promotion_description TEXT,
    discount_amount DECIMAL(10, 2),
    discount_currency VARCHAR(3) DEFAULT 'MXN',
    discounted_price DECIMAL(10, 2),
    discounted_price_currency VARCHAR(3) DEFAULT 'MXN',
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add warehouse locations table for multi-location inventory
CREATE TABLE IF NOT EXISTS warehouse_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add product stock by location
CREATE TABLE IF NOT EXISTS product_stock_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouse_locations(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id)
);

-- Add additional supplier fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_code VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_class VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS solution VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10, 4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS exchange_rate_date TIMESTAMP;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_promotions_product ON product_promotions(product_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON product_promotions(is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_stock_locations_product ON product_stock_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_locations_warehouse ON product_stock_locations(warehouse_id);

-- Trigger for updating product_stock_locations timestamp
CREATE OR REPLACE FUNCTION update_stock_location_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stock_locations_timestamp BEFORE UPDATE ON product_stock_locations
    FOR EACH ROW EXECUTE FUNCTION update_stock_location_timestamp();

-- Insert common warehouse locations (based on XML data)
INSERT INTO warehouse_locations (code, name) VALUES
    ('MEXICO_CD', 'México Centro de Distribución'),
    ('MONTERREY_CD', 'Monterrey Centro de Distribución'),
    ('CANCUN', 'Ventas Cancún'),
    ('CHIHUAHUA', 'Ventas Chihuahua'),
    ('CULIACAN', 'Ventas Culiacán'),
    ('GUADALAJARA', 'Ventas Guadalajara'),
    ('HERMOSILLO', 'Ventas Hermosillo'),
    ('LEON', 'Ventas León'),
    ('MERIDA', 'Ventas Mérida'),
    ('MONTERREY', 'Ventas Monterrey'),
    ('MORELIA', 'Ventas Morelia'),
    ('OAXACA', 'Ventas Oaxaca'),
    ('PACHUCA', 'Ventas Pachuca'),
    ('PUEBLA', 'Ventas Puebla'),
    ('QUERETARO', 'Ventas Querétaro'),
    ('TEPIC', 'Ventas Tepic'),
    ('TOLUCA', 'Ventas Toluca'),
    ('TORREON', 'Ventas Torreón'),
    ('TUXTLA', 'Ventas Tuxtla'),
    ('VERACRUZ', 'Ventas Veracruz'),
    ('VILLAHERMOSA', 'Ventas Villahermosa')
ON CONFLICT (code) DO NOTHING;
