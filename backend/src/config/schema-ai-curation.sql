-- AI Curation Schema
-- Sistema de curación de productos usando IA (Claude API o LM Studio)

-- Configuración de IA
CREATE TABLE IF NOT EXISTS ai_curation_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Provider activo
    active_provider VARCHAR(20) DEFAULT 'claude', -- 'claude' o 'lmstudio'

    -- Claude API configuration
    claude_api_key_encrypted TEXT,
    claude_model VARCHAR(50) DEFAULT 'claude-sonnet-4-5-20250929',

    -- LM Studio configuration
    lmstudio_endpoint VARCHAR(255),
    lmstudio_model VARCHAR(100),

    -- Opciones de curación
    auto_curate_new_products BOOLEAN DEFAULT false,
    skip_icecat_curated BOOLEAN DEFAULT true, -- No curar productos ya enriquecidos con Icecat
    require_manual_approval BOOLEAN DEFAULT true, -- Requiere aprobación manual

    -- Límites
    max_products_per_batch INTEGER DEFAULT 10,
    max_tokens_per_request INTEGER DEFAULT 4000,

    -- Tipos de curación habilitados
    enable_description BOOLEAN DEFAULT true,
    enable_seo BOOLEAN DEFAULT true,
    enable_categorization BOOLEAN DEFAULT false,
    enable_validation BOOLEAN DEFAULT true,
    enable_translation BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Solo permitir una configuración
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_config_singleton ON ai_curation_config ((id IS NOT NULL));

-- Historial de curación por IA
CREATE TABLE IF NOT EXISTS ai_curation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,

    -- Detalles de curación
    curation_type VARCHAR(50) NOT NULL, -- 'description', 'seo', 'validation', 'categorization', 'translation'
    ai_provider VARCHAR(20) NOT NULL, -- 'claude', 'lmstudio'
    ai_model VARCHAR(100),

    -- Input/Output
    input_data JSONB, -- Datos enviados a la IA
    output_data JSONB, -- Respuesta de la IA

    -- Tokens y costo (solo para Claude)
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd DECIMAL(10, 6),

    -- Estado
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'approved', 'rejected'
    error_message TEXT,

    -- Aprobación
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,

    -- Metadatos
    duration_ms INTEGER, -- Duración en milisegundos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_curation_history_product ON ai_curation_history(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_curation_history_type ON ai_curation_history(curation_type);
CREATE INDEX IF NOT EXISTS idx_ai_curation_history_status ON ai_curation_history(status);
CREATE INDEX IF NOT EXISTS idx_ai_curation_history_provider ON ai_curation_history(ai_provider);
CREATE INDEX IF NOT EXISTS idx_ai_curation_history_created ON ai_curation_history(created_at DESC);

-- Contenido generado por IA (antes de aprobación)
CREATE TABLE IF NOT EXISTS ai_generated_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    curation_history_id UUID REFERENCES ai_curation_history(id) ON DELETE CASCADE,

    -- Contenido generado
    generated_title VARCHAR(255),
    generated_short_description TEXT,
    generated_long_description TEXT,
    generated_seo_title VARCHAR(255),
    generated_seo_description TEXT,
    generated_seo_keywords TEXT,
    generated_bullet_points JSONB, -- Array de características clave
    suggested_category_id UUID REFERENCES categories(id),
    validation_issues JSONB, -- Array de problemas encontrados

    -- Estado de aprobación
    approval_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'partial'
    approved_fields JSONB, -- Array de campos aprobados para aplicar

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(product_id, curation_history_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_product ON ai_generated_content(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_status ON ai_generated_content(approval_status);

-- Reglas de curación automática
CREATE TABLE IF NOT EXISTS ai_curation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name VARCHAR(100) NOT NULL,
    rule_description TEXT,

    -- Condiciones para aplicar la regla
    trigger_condition VARCHAR(50) NOT NULL, -- 'on_create', 'on_update', 'scheduled', 'manual'

    -- Filtros (solo aplicar a productos que cumplan)
    category_filter UUID REFERENCES categories(id), -- Solo esta categoría
    brand_filter UUID REFERENCES brands(id), -- Solo esta marca
    min_price DECIMAL(10, 2), -- Precio mínimo
    max_price DECIMAL(10, 2), -- Precio máximo
    curation_status_filter VARCHAR(50), -- Solo productos con este estado

    -- Acciones a realizar
    curation_types JSONB NOT NULL, -- Array: ["description", "seo", "validation"]
    auto_approve BOOLEAN DEFAULT false, -- Auto-aprobar sin revisión manual

    -- Estado
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Orden de ejecución (mayor = primero)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_curation_rules_active ON ai_curation_rules(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ai_curation_rules_trigger ON ai_curation_rules(trigger_condition);

-- Jobs de curación (para procesos batch)
CREATE TABLE IF NOT EXISTS ai_curation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Configuración del job
    job_type VARCHAR(50) NOT NULL, -- 'batch', 'scheduled', 'manual'
    curation_types JSONB NOT NULL, -- Tipos de curación a aplicar

    -- Filtros de productos
    filters JSONB, -- Criterios de selección de productos

    -- Progreso
    total_products INTEGER DEFAULT 0,
    processed_products INTEGER DEFAULT 0,
    successful_products INTEGER DEFAULT 0,
    failed_products INTEGER DEFAULT 0,
    pending_approval INTEGER DEFAULT 0,

    -- Estado
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'

    -- Usuario
    started_by UUID REFERENCES users(id),

    -- Tiempos
    started_at TIMESTAMP,
    finished_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_curation_jobs_status ON ai_curation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_curation_jobs_created ON ai_curation_jobs(created_at DESC);

-- Estadísticas de uso de IA (agregadas por día)
CREATE TABLE IF NOT EXISTS ai_usage_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    provider VARCHAR(20) NOT NULL, -- 'claude', 'lmstudio'

    -- Contadores
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,

    -- Tokens (solo Claude)
    total_prompt_tokens BIGINT DEFAULT 0,
    total_completion_tokens BIGINT DEFAULT 0,
    total_cost_usd DECIMAL(10, 2) DEFAULT 0,

    -- Tiempos
    avg_duration_ms INTEGER DEFAULT 0,

    -- Por tipo
    by_curation_type JSONB, -- {"description": 50, "seo": 30, ...}

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, provider)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_stats_date ON ai_usage_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_stats_provider ON ai_usage_stats(provider);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_ai_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_config_timestamp ON ai_curation_config;
CREATE TRIGGER trigger_ai_config_timestamp
    BEFORE UPDATE ON ai_curation_config
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_config_timestamp();

DROP TRIGGER IF EXISTS trigger_ai_curation_rules_timestamp ON ai_curation_rules;
CREATE TRIGGER trigger_ai_curation_rules_timestamp
    BEFORE UPDATE ON ai_curation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_config_timestamp();

-- Función para obtener productos que necesitan curación
CREATE OR REPLACE FUNCTION get_products_needing_curation(
    p_limit INTEGER DEFAULT 10,
    p_curation_status VARCHAR DEFAULT 'not_curated'
)
RETURNS TABLE (
    product_id UUID,
    sku VARCHAR,
    name VARCHAR,
    curation_status VARCHAR,
    has_icecat BOOLEAN,
    missing_fields TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.sku,
        p.name,
        p.curation_status,
        CASE WHEN ipm.icecat_id IS NOT NULL THEN true ELSE false END as has_icecat,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN p.long_description IS NULL OR p.long_description = '' THEN 'long_description' END,
            CASE WHEN p.seo_title IS NULL OR p.seo_title = '' THEN 'seo_title' END,
            CASE WHEN p.seo_description IS NULL OR p.seo_description = '' THEN 'seo_description' END,
            CASE WHEN p.seo_keywords IS NULL OR p.seo_keywords = '' THEN 'seo_keywords' END,
            CASE WHEN p.category_id IS NULL THEN 'category' END
        ], NULL) as missing_fields
    FROM products p
    LEFT JOIN icecat_product_mapping ipm ON p.id = ipm.product_id
    WHERE p.curation_status = p_curation_status
        AND p.is_active = true
    ORDER BY p.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE ai_curation_config IS 'Configuración del sistema de curación por IA';
COMMENT ON TABLE ai_curation_history IS 'Historial completo de curaciones realizadas por IA';
COMMENT ON TABLE ai_generated_content IS 'Contenido generado por IA pendiente de aprobación';
COMMENT ON TABLE ai_curation_rules IS 'Reglas automáticas para curación de productos';
COMMENT ON TABLE ai_curation_jobs IS 'Jobs batch de curación masiva';
COMMENT ON TABLE ai_usage_stats IS 'Estadísticas de uso y costo de IA';

COMMENT ON COLUMN ai_curation_config.skip_icecat_curated IS 'Si true, no curar productos que ya tienen datos de Icecat';
COMMENT ON COLUMN ai_curation_config.require_manual_approval IS 'Si true, el contenido generado requiere aprobación antes de aplicarse';
COMMENT ON COLUMN ai_curation_history.cost_usd IS 'Costo estimado de la petición (solo Claude API)';
COMMENT ON COLUMN ai_generated_content.approved_fields IS 'Array de campos aprobados para aplicar al producto';
