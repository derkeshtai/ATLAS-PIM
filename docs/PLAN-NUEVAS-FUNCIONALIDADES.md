# Plan de Nuevas Funcionalidades - ATLAS PIM

## 📋 Resumen del Flujo de Datos

```
1. XML Proveedor → PIM (datos base)
2. CVA API → PIM (actualización inventario + nuevos productos)
3. Icecat → PIM (enriquecimiento: specs, imágenes, videos)
4. IA (Claude/LM Studio) → PIM (curación: descripciones, SEO, validación)
5. PIM → Prestashop 9.0 (datos curados y completos)
```

---

## 🔌 Funcionalidad 1: Integración API CVA

### Objetivo
Mantener sincronizado el inventario y descubrir nuevos productos automáticamente desde la API del proveedor CVA.

### Endpoints de CVA Identificados

#### Autenticación
```
POST https://apicvaservices.grupocva.com/api/v2/user/login
- Token válido por 12 horas
- Renovación automática antes de expiración
```

#### Catálogo y Precios
```
GET /api/v2/catalogo_clientes/lista_precios
Parámetros clave:
- clave: código interno CVA
- codigo: código fabricante
- marca, grupo, desc: filtros de búsqueda
- exist: 0=todos, 1=sucursal, 2=CEDIS, 3=ambos
- promos=true: incluir promociones
- images=true: URLs imágenes alta resolución
- sucursales=true: stock por sucursal
- page: paginación (36 items por página)
```

#### Catálogos de Referencia (sin auth)
```
GET /api/v2/catalogo_clientes/marcas
GET /api/v2/catalogo_clientes/grupos
GET /api/v2/catalogo_clientes/soluciones
GET /api/v2/catalogo_clientes/sucursales
```

### Arquitectura Propuesta

#### 1. Servicio de Autenticación CVA
**Archivo**: `backend/src/services/cvaAuthService.ts`

```typescript
class CVAAuthService {
  - login() // Obtener token
  - refreshToken() // Renovar automáticamente
  - getValidToken() // Obtener token válido (refresh si es necesario)
  - scheduleTokenRefresh() // Cron job para renovar cada 11 horas
}
```

#### 2. Servicio CVA API Client
**Archivo**: `backend/src/services/cvaApiService.ts`

```typescript
class CVAApiService {
  // Sincronización de productos
  - fetchProducts(filters) // Obtener lista de productos
  - syncProductInventory(clave) // Actualizar stock de un producto
  - syncAllInventory() // Actualizar stock masivo
  - discoverNewProducts() // Buscar productos nuevos no en PIM

  // Catálogos
  - syncBrands() // Sincronizar marcas
  - syncCategories() // Sincronizar grupos/categorías
  - syncBranches() // Sincronizar sucursales

  // Precios y promociones
  - updatePrices() // Actualizar precios
  - syncPromotions() // Sincronizar promociones activas
}
```

#### 3. Servicio de Sincronización
**Archivo**: `backend/src/services/cvaSyncService.ts`

```typescript
class CVASyncService {
  - fullSync() // Sincronización completa (nuevos productos + inventario)
  - inventorySync() // Solo actualizar inventario
  - priceSync() // Solo actualizar precios
  - promotionSync() // Solo actualizar promociones
  - scheduledSync() // Para cron jobs automáticos
}
```

#### 4. Controlador CVA
**Archivo**: `backend/src/controllers/cvaController.ts`

Endpoints:
```
POST   /api/v1/cva/sync/full           - Sincronización completa
POST   /api/v1/cva/sync/inventory      - Solo inventario
POST   /api/v1/cva/sync/prices         - Solo precios
POST   /api/v1/cva/sync/promotions     - Solo promociones
POST   /api/v1/cva/discover            - Buscar nuevos productos
GET    /api/v1/cva/status              - Estado de sincronización
GET    /api/v1/cva/sync-history        - Historial de sincronizaciones
```

#### 5. Schema de Base de Datos
**Archivo**: `backend/src/config/schema-cva.sql`

```sql
-- Tracking de sincronización CVA
CREATE TABLE cva_sync_history (
  id UUID PRIMARY KEY,
  sync_type VARCHAR(50), -- full, inventory, prices, promotions
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  products_updated INTEGER,
  products_created INTEGER,
  errors JSONB,
  status VARCHAR(20) -- running, completed, failed
);

-- Mapeo de productos CVA
CREATE TABLE cva_product_mapping (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  clave VARCHAR(100) UNIQUE, -- Código CVA
  last_synced TIMESTAMP,
  stock_sucursal INTEGER,
  stock_cedis INTEGER,
  last_price_update TIMESTAMP
);

-- Sucursales CVA (para stock multi-ubicación)
CREATE TABLE cva_branches (
  id UUID PRIMARY KEY,
  branch_code VARCHAR(50) UNIQUE,
  branch_name VARCHAR(255),
  city VARCHAR(100),
  is_active BOOLEAN
);

-- Stock por sucursal
CREATE TABLE cva_product_branch_stock (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  branch_id UUID REFERENCES cva_branches(id),
  quantity INTEGER,
  last_updated TIMESTAMP,
  UNIQUE(product_id, branch_id)
);
```

#### 6. Cron Jobs Automáticos
**Archivo**: `backend/src/jobs/cvaSyncJobs.ts`

```typescript
// Sincronizaciones programadas
- Cada 1 hora: Actualizar inventario
- Cada 6 horas: Actualizar precios
- Cada 12 horas: Buscar nuevos productos
- Cada 24 horas: Sincronización completa
```

### Flujo de Trabajo Recomendado

```
1. Importación inicial XML → PIM (datos base)
2. Sync inicial CVA API → Actualizar stock existente + descubrir nuevos
3. Icecat → Enriquecer productos
4. IA → Curar contenido
5. Exportar a Prestashop
6. Mantener con sync automático (cron jobs)
```

---

## 🤖 Funcionalidad 2: IA para Curación de Datos

### Objetivo
Automatizar la verificación, completado y mejora de información de productos usando IA.

### Dos Opciones de Implementación

#### Opción A: Claude API (Recomendado para empezar)

**Ventajas:**
- ✅ Mejor calidad de generación
- ✅ Contexto de 200K tokens (puede procesar muchos productos)
- ✅ Multimodal (puede analizar imágenes)
- ✅ API simple y estable
- ✅ Sin necesidad de hardware especial

**Desventajas:**
- ❌ Costo por uso (pero muy eficiente)
- ❌ Requiere conexión a internet
- ❌ Datos se envían a Anthropic (pero con privacidad)

**Configuración:**
```env
ANTHROPIC_API_KEY=tu_api_key
AI_PROVIDER=claude  # o 'lmstudio'
```

#### Opción B: LM Studio Local

**Ventajas:**
- ✅ 100% privado (datos no salen del servidor)
- ✅ Sin costos por uso
- ✅ Control total del modelo

**Desventajas:**
- ❌ Requiere GPU potente (mínimo 16GB VRAM para modelos decentes)
- ❌ Calidad inferior a Claude
- ❌ Más lento
- ❌ Configuración más compleja

**Configuración:**
```env
LMSTUDIO_API_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.1-70b-instruct
AI_PROVIDER=lmstudio
```

### Arquitectura del Sistema de IA

#### 1. Servicio de IA Unificado
**Archivo**: `backend/src/services/aiCurationService.ts`

```typescript
class AICurationService {
  // Abstracción para soportar Claude y LM Studio
  private provider: ClaudeProvider | LMStudioProvider;

  // Funciones principales
  - completeProductDescription(product) // Generar descripción completa
  - generateSEOContent(product) // Meta title, description, keywords
  - categorizeProduct(product) // Sugerir categoría correcta
  - validateProductData(product) // Verificar consistencia
  - extractSpecifications(description) // Extraer specs de texto
  - improveProductTitle(title) // Optimizar título
  - generateBulletPoints(product) // Características clave
  - detectLanguageIssues(text) // Detectar errores
  - translateContent(text, targetLang) // Traducir
  - analyzeProductImage(imageUrl) // Describir imagen (solo Claude)
}
```

#### 2. Providers
**Archivo**: `backend/src/services/ai/ClaudeProvider.ts`
**Archivo**: `backend/src/services/ai/LMStudioProvider.ts`

```typescript
interface AIProvider {
  generateText(prompt: string, context?: any): Promise<string>;
  generateStructured(prompt: string, schema: any): Promise<any>;
  analyzeImage(imageUrl: string, prompt: string): Promise<string>;
}
```

#### 3. Prompts Optimizados
**Archivo**: `backend/src/services/ai/prompts.ts`

```typescript
export const PROMPTS = {
  COMPLETE_DESCRIPTION: `Eres un experto en e-commerce...`,
  GENERATE_SEO: `Genera contenido SEO optimizado...`,
  CATEGORIZE: `Clasifica este producto en la categoría correcta...`,
  VALIDATE: `Verifica la consistencia de estos datos...`,
  // etc.
}
```

#### 4. Controlador de IA
**Archivo**: `backend/src/controllers/aiCurationController.ts`

Endpoints:
```
POST   /api/v1/ai/curate/:productId           - Curar un producto
POST   /api/v1/ai/curate/bulk                 - Curar múltiples productos
POST   /api/v1/ai/generate-description/:id    - Solo generar descripción
POST   /api/v1/ai/generate-seo/:id           - Solo generar SEO
POST   /api/v1/ai/validate/:id               - Solo validar datos
POST   /api/v1/ai/categorize/:id             - Solo categorizar
GET    /api/v1/ai/status                     - Estado del servicio IA
GET    /api/v1/ai/stats                      - Estadísticas de uso
```

#### 5. Jobs Automáticos
**Archivo**: `backend/src/jobs/aiCurationJobs.ts`

```typescript
// Procesamiento automático
- Curar productos nuevos automáticamente
- Revisar productos con descripciones vacías
- Validar productos antes de exportar a Prestashop
- Generar SEO para productos sin meta tags
```

#### 6. Schema de Base de Datos
**Archivo**: Extensión a schema existente

```sql
-- Tracking de curación IA
CREATE TABLE ai_curation_history (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  curation_type VARCHAR(50), -- description, seo, validation, etc.
  ai_provider VARCHAR(20), -- claude, lmstudio
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd DECIMAL(10, 6),
  result JSONB,
  created_at TIMESTAMP
);

-- Configuración de curación automática
CREATE TABLE ai_curation_rules (
  id UUID PRIMARY KEY,
  rule_name VARCHAR(100),
  trigger_condition VARCHAR(50), -- on_create, on_update, scheduled
  curation_types JSONB, -- ["description", "seo", "validation"]
  is_active BOOLEAN,
  created_at TIMESTAMP
);

-- Agregar campos a products
ALTER TABLE products ADD COLUMN ai_curated BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN ai_validation_score DECIMAL(3, 2); -- 0.00 - 1.00
ALTER TABLE products ADD COLUMN needs_review BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN seo_title VARCHAR(255);
ALTER TABLE products ADD COLUMN seo_description TEXT;
ALTER TABLE products ADD COLUMN seo_keywords TEXT;
```

### Casos de Uso

#### Caso 1: Producto Nuevo desde XML (descripción pobre)
```
1. XML proveedor → PIM (descripción: "CABLE HDMI 2M")
2. CVA API → Actualizar stock
3. Icecat → Agregar specs técnicas
4. IA → Generar descripción rica:
   "Cable HDMI 2.0 de alta velocidad de 2 metros, compatible con
    resolución 4K UHD, HDR, Audio Return Channel (ARC)..."
5. IA → Generar SEO optimizado
6. Exportar a Prestashop
```

#### Caso 2: Validación Masiva
```
1. Admin: "Curar todos los productos sin descripción larga"
2. Sistema filtra productos
3. IA procesa batch de 100 productos
4. Admin revisa sugerencias
5. Admin aprueba/rechaza
6. Sistema aplica cambios aprobados
```

#### Caso 3: Categorización Automática
```
1. Producto nuevo sin categoría
2. IA analiza: título + specs + imagen
3. IA sugiere: "Cables y Conectores > HDMI > Cables HDMI 2.0"
4. Sistema auto-categoriza o pide confirmación
```

### Interfaz de Revisión (Opcional - Frontend React)

Podríamos crear un dashboard simple para:
- Ver productos pendientes de curación
- Revisar/aprobar sugerencias de IA
- Ver estadísticas de curación
- Configurar reglas automáticas

---

## 🔒 Funcionalidad 3: Hardening de Seguridad Prestashop

### Objetivo
Asegurar el módulo Prestashop 9.0 contra ataques comunes, ya que ATLAS-PIM corre en local pero Prestashop está expuesto a internet.

### Vectores de Ataque a Proteger

1. **SQL Injection** - Inyección de SQL malicioso
2. **XSS (Cross-Site Scripting)** - Inyección de JavaScript
3. **CSRF (Cross-Site Request Forgery)** - Peticiones falsificadas
4. **API Key Theft** - Robo de credenciales
5. **Brute Force** - Ataques de fuerza bruta
6. **Man-in-the-Middle** - Interceptación de comunicaciones
7. **Path Traversal** - Acceso a archivos no autorizados
8. **Denial of Service** - Sobrecarga del sistema

### Mejoras de Seguridad Propuestas

#### 1. Autenticación Mejorada

**Actual:** API Key estática en configuración

**Mejorado:**
```php
// Dual authentication: API Key + HMAC signature
class AtlasPimAuth {
    // API Key rotation cada 90 días
    private function validateRequest($request) {
        // 1. Validar API Key
        // 2. Validar HMAC signature (previene replay attacks)
        // 3. Validar timestamp (request no mayor a 5 minutos)
        // 4. Validar IP whitelist (opcional)
    }
}
```

#### 2. Rate Limiting

```php
// Limitar peticiones por IP/usuario
class AtlasPimRateLimiter {
    private $maxRequestsPerMinute = 60;
    private $maxRequestsPerHour = 1000;

    // Usar Prestashop Cache para tracking
    // Bloquear IPs abusivas temporalmente
}
```

#### 3. Input Validation & Sanitization

```php
class AtlasPimValidator {
    // Validar TODOS los inputs
    private function sanitizeProductData($data) {
        // Whitelist de campos permitidos
        // Validación estricta de tipos
        // Sanitización de HTML (strip_tags + htmlspecialchars)
        // Validación de URLs de imágenes
        // Límite de tamaño de datos
    }
}
```

#### 4. Prepared Statements (Anti SQL Injection)

```php
// NUNCA concatenar SQL
// ❌ MALO
$sql = "SELECT * FROM products WHERE id = " . $id;

// ✅ BUENO
$sql = "SELECT * FROM products WHERE id = ?";
Db::getInstance()->getValue($sql, [$id]);
```

#### 5. CSRF Protection

```php
class AtlasPimCSRF {
    // Generar token para formularios del módulo
    private function generateToken() {
        return Tools::getToken('atlaspim_sync');
    }

    // Validar token en cada POST
    private function validateToken($token) {
        return Tools::getToken('atlaspim_sync') === $token;
    }
}
```

#### 6. HTTPS Obligatorio

```php
// Rechazar peticiones no HTTPS en producción
if (!Tools::usingSecureMode() && !_PS_DEBUG_) {
    die('HTTPS required');
}
```

#### 7. Logging de Seguridad

```php
class AtlasPimSecurityLogger {
    // Log de intentos de acceso
    // Log de errores de autenticación
    // Log de peticiones sospechosas
    // Alertas por email para admin
}
```

#### 8. Encriptación de Credenciales

```php
// Nunca guardar API key en texto plano
Configuration::updateValue(
    'ATLASPIM_API_KEY',
    AtlasPimCrypto::encrypt($apiKey)
);

// Al usar:
$apiKey = AtlasPimCrypto::decrypt(
    Configuration::get('ATLASPIM_API_KEY')
);
```

#### 9. Validación de Firmas en Webhooks

```php
// Si ATLAS-PIM envía webhooks a Prestashop
class AtlasPimWebhook {
    private function validateSignature($payload, $signature) {
        $secret = Configuration::get('ATLASPIM_WEBHOOK_SECRET');
        $expectedSignature = hash_hmac('sha256', $payload, $secret);
        return hash_equals($expectedSignature, $signature);
    }
}
```

#### 10. Sanitización de Imágenes

```php
// Validar que las imágenes descargadas son realmente imágenes
class AtlasPimImageValidator {
    private function validateImage($url) {
        // 1. Validar extensión permitida
        // 2. Validar mime type
        // 3. Validar tamaño máximo
        // 4. Scan antivirus (opcional, con ClamAV)
        // 5. Re-procesar con GD/Imagick (destruye malware embebido)
    }
}
```

### Estructura del Módulo Mejorado

```
prestashop-module/atlaspim/
├── atlaspim.php                    # Módulo principal
├── classes/
│   ├── AtlasPimAuth.php           # Sistema de autenticación
│   ├── AtlasPimRateLimiter.php    # Rate limiting
│   ├── AtlasPimValidator.php      # Validación de inputs
│   ├── AtlasPimCrypto.php         # Encriptación
│   ├── AtlasPimSecurityLogger.php # Logging de seguridad
│   └── AtlasPimWebhook.php        # Manejo de webhooks
├── controllers/
│   └── front/
│       └── sync.php               # Endpoint de sincronización (seguro)
├── config/
│   └── security.yml               # Configuración de seguridad
├── logs/
│   └── security.log               # Logs de seguridad
└── views/
    └── templates/
        └── admin/
            └── security_dashboard.tpl  # Dashboard de seguridad
```

### Checklist de Seguridad

- [ ] Todas las consultas SQL usan prepared statements
- [ ] Todos los inputs se validan y sanitizan
- [ ] HTTPS obligatorio en producción
- [ ] API Keys encriptadas en base de datos
- [ ] Rate limiting activo
- [ ] CSRF tokens en formularios
- [ ] Logging de eventos de seguridad
- [ ] Validación de firmas HMAC
- [ ] IP whitelist (opcional)
- [ ] Monitoreo de intentos de acceso fallidos
- [ ] Auto-ban de IPs maliciosas
- [ ] Headers de seguridad (CSP, X-Frame-Options, etc.)
- [ ] Validación estricta de imágenes
- [ ] Timeouts de sesión apropiados
- [ ] Rotación periódica de API keys

### Monitoreo y Alertas

```php
// Enviar alertas al admin en casos de:
- X intentos de login fallidos
- Actividad sospechosa (muchos requests)
- Cambios en configuración del módulo
- Errores de sincronización
```

---

## 📊 Resumen de Implementación

### Prioridades Sugeridas

**Fase 1 - Crítico (1-2 semanas):**
1. Integración CVA API (sync inventario + precios)
2. Seguridad Prestashop (base mínima)

**Fase 2 - Importante (1 semana):**
3. IA con Claude API (curación básica)
4. Seguridad Prestashop (hardening completo)

**Fase 3 - Optimización (1 semana):**
5. Cron jobs automáticos
6. Dashboard de monitoreo
7. LM Studio como opción alternativa

### Estimación de Esfuerzo

| Funcionalidad | Archivos | Líneas de Código | Tiempo |
|---------------|----------|------------------|--------|
| CVA API Integration | 8 | ~2,000 | 3-4 días |
| AI Curation (Claude) | 6 | ~1,500 | 2-3 días |
| AI Curation (LM Studio) | 2 | ~500 | 1 día |
| Prestashop Security | 10 | ~1,800 | 3-4 días |
| Documentation | 4 | N/A | 1 día |
| **TOTAL** | **30** | **~5,800** | **10-13 días** |

### Dependencias Nuevas

**Backend:**
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",  // Claude API
    "node-cron": "^3.0.3",            // Cron jobs
    "axios": "^1.6.0",                // HTTP client CVA
    "axios-retry": "^4.0.0",          // Retry logic
    "ioredis": "^5.3.0"               // Redis para rate limiting
  }
}
```

**Prestashop:**
```php
// Ninguna dependencia externa (usar APIs nativas de Prestashop)
```

### Configuración .env Completa

```env
# CVA API
CVA_API_URL=https://apicvaservices.grupocva.com
CVA_API_USERNAME=tu_usuario
CVA_API_PASSWORD=tu_password
CVA_AUTO_SYNC_ENABLED=true
CVA_SYNC_INVENTORY_CRON=0 * * * *  # Cada hora
CVA_SYNC_PRICES_CRON=0 */6 * * *   # Cada 6 horas

# AI Curation
AI_PROVIDER=claude  # o 'lmstudio'
ANTHROPIC_API_KEY=tu_api_key
LMSTUDIO_API_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.1-70b-instruct
AI_AUTO_CURATE=false  # true para curación automática
AI_AUTO_CURATE_NEW_PRODUCTS=true

# Redis (para rate limiting)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Prestashop Security
PRESTASHOP_IP_WHITELIST=  # Opcional, separado por comas
PRESTASHOP_WEBHOOK_SECRET=secret_aleatorio_seguro
```

---

## ❓ Decisiones Pendientes

Antes de implementar, necesito tu confirmación en:

### 1. CVA API
- ¿Tienes ya credenciales de la API CVA?
- ¿Prefieres sync automático (cron) o manual desde admin panel?
- ¿Qué prioridad: inventario, precios, o nuevos productos?

### 2. IA para Curación
- ¿Prefieres empezar con Claude API (más fácil, mejor calidad) o LM Studio (local, privado)?
- ¿Quieres curación automática o siempre con revisión manual?
- ¿Qué tipos de curación son prioritarios: descripciones, SEO, validación, categorización?

### 3. Seguridad Prestashop
- ¿Tu Prestashop está en un servidor con IP fija? (para whitelist)
- ¿Prefieres renovación automática de API keys o manual?
- ¿Necesitas dos-factor authentication (2FA) para el admin del módulo?

### 4. Infraestructura
- ¿Tienes Redis disponible? (para rate limiting eficiente)
- ¿Qué versión de PHP tiene tu Prestashop? (7.4, 8.0, 8.1?)
- ¿ATLAS-PIM y Prestashop están en la misma red local o internet?

---

## 🚀 Próximos Pasos

Espero tu feedback para:
1. Confirmar el plan
2. Priorizar las funcionalidades
3. Aclarar las decisiones pendientes
4. ¡Empezar la implementación!

¿Te parece bien este plan? ¿Quieres ajustar algo antes de que empiece a implementar?
