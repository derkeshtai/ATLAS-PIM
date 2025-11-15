# Guía de Integración Icecat

Esta guía explica cómo integrar tu sistema ATLAS PIM con Icecat para enriquecer automáticamente los productos con especificaciones técnicas detalladas, imágenes de alta calidad, videos, manuales y más.

## 🚀 Formas de Integración

Icecat ofrece **dos formas** de obtener datos enriquecidos:

1. **📊 Importación desde archivo Excel** - Icecat te proporciona un archivo .xls/.xlsx con miles de productos enriquecidos
2. **🔌 API en tiempo real** - Consulta la API de Icecat por GTIN/EAN para obtener datos actualizados

Ambas formas están completamente implementadas en ATLAS PIM.

---

## 📋 Paso 1: Configuración

### 1.1 Configurar Base de Datos

Ejecuta el schema de Icecat para crear las tablas necesarias:

```bash
# Con Docker
docker-compose exec postgres psql -U postgres -d atlas_pim -f /app/src/config/schema-icecat.sql

# Sin Docker
psql -U postgres -d atlas_pim -f backend/src/config/schema-icecat.sql
```

Esto creará:
- `product_specifications` - Almacenamiento flexible key-value para cientos de especificaciones
- `icecat_product_mapping` - Mapeo de IDs de Icecat y seguimiento de sincronización
- `product_multimedia` - Imágenes, videos, PDFs, manuales de Icecat

### 1.2 Configurar Credenciales de Icecat (Para API)

Edita tu archivo `.env` en el backend:

```bash
# Icecat Integration
ICECAT_USERNAME=tu_usuario_icecat
ICECAT_PASSWORD=tu_password_icecat
ICECAT_LANGUAGE=es  # o 'en' para inglés
```

**Nota:** Las credenciales solo son necesarias si usarás la API de Icecat. Para importar Excel no se requieren.

---

## 📊 Método 1: Importación desde Excel

### ¿Cuándo usar este método?

- Icecat te proporciona un archivo Excel con productos enriquecidos
- Quieres importar masivamente miles de productos de una vez
- No necesitas datos en tiempo real

### Paso 1: Obtener Token

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tuempresa.com",
    "password": "TuPassword123"
  }'

# Guarda el token
export TOKEN="tu_token_jwt"
```

### Paso 2: Importar Archivo Excel

```bash
curl -X POST http://localhost:3000/api/v1/import/icecat/excel \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@icecat_products.xlsx"
```

**Respuesta esperada:**

```json
{
  "success": true,
  "data": {
    "total_items": 1500,
    "successful_items": 1485,
    "failed_items": 15,
    "specifications_added": 45620,
    "multimedia_added": 8920,
    "errors": [
      {
        "row": 234,
        "icecat_id": "12345678",
        "error": "Missing required identifiers",
        "data": {...}
      }
    ]
  }
}
```

### ¿Qué hace la importación?

1. **Productos nuevos** - Se crean automáticamente
2. **Productos existentes** - Se actualizan (busca por GTIN, Icecat ID o supplier SKU)
3. **Especificaciones** - Todas las columnas tipo "Category::Specification" se guardan como key-value
4. **Multimedia** - Descarga imágenes, videos, PDFs, manuales
5. **Categorías y Marcas** - Se crean automáticamente si no existen

---

## 🔌 Método 2: API en Tiempo Real

### ¿Cuándo usar este método?

- Necesitas datos actualizados en tiempo real
- Tienes GTINs/EANs de productos y quieres enriquecerlos
- Quieres sincronizar productos existentes con datos frescos de Icecat

### 2.1 Probar Conexión con Icecat API

Primero verifica que tu conexión funciona:

```bash
curl -X GET "http://localhost:3000/api/v1/import/icecat/test/7331021041875" \
  -H "Authorization: Bearer $TOKEN"
```

**Nota:** Reemplaza `7331021041875` con un GTIN válido de tu catálogo.

**Respuesta esperada:**

```json
{
  "success": true,
  "data": {
    "message": "Successfully fetched from Icecat API",
    "data": {
      "icecat_id": "12345678",
      "gtin": "7331021041875",
      "model": "XPS 15",
      "brand": "Dell",
      "category": "Notebooks",
      "title": "Dell XPS 15 9500",
      "short_description": "15.6\" FHD, Intel i7...",
      "long_description": "Complete description...",
      "quality": "ICECAT",
      "on_market": true,
      "specifications": [
        {
          "group": "Processor",
          "key": "Processor family",
          "value": "Intel Core i7"
        },
        ...
      ],
      "images": [...],
      "videos": [...],
      "pdfs": [...]
    }
  }
}
```

### 2.2 Sincronizar Producto por GTIN

Crea o actualiza un producto consultando Icecat:

```bash
curl -X POST "http://localhost:3000/api/v1/import/icecat/sync/7331021041875" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "icecat_id": "12345678",
    "gtin": "7331021041875",
    "specifications_added": 45,
    "multimedia_added": 12
  }
}
```

### 2.3 Sincronizar Múltiples Productos (Bulk)

```bash
curl -X POST "http://localhost:3000/api/v1/import/icecat/sync/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gtins": [
      "7331021041875",
      "0884116239635",
      "5051964040830",
      "0190198716774"
    ]
  }'
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "total": 4,
    "successful": 3,
    "failed": 1,
    "results": [
      {
        "success": true,
        "gtin": "7331021041875",
        "product_id": "...",
        "specifications_added": 45
      },
      {
        "success": false,
        "gtin": "0884116239635",
        "error": "Product not found in Icecat"
      },
      ...
    ]
  }
}
```

**Límites:**
- Máximo 100 GTINs por request
- Rate limiting: 500ms entre cada consulta (automático)

### 2.4 Actualizar Producto Existente

Si ya tienes un producto en el PIM con GTIN o Icecat ID, actualízalo con datos frescos:

```bash
curl -X PUT "http://localhost:3000/api/v1/import/icecat/update/PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Esto:
1. Lee el GTIN o Icecat ID del producto
2. Consulta la API de Icecat
3. Actualiza todas las especificaciones y multimedia

---

## 📊 Consultar Datos Enriquecidos

### Ver Especificaciones de un Producto

```sql
-- Conectar a la base de datos
psql -U postgres -d atlas_pim

-- Ver todas las especificaciones de un producto
SELECT
  p.name as producto,
  ps.spec_group as categoria,
  ps.spec_key as especificacion,
  ps.spec_value as valor
FROM products p
JOIN product_specifications ps ON p.id = ps.product_id
WHERE p.sku = 'TU_SKU'
ORDER BY ps.spec_group, ps.spec_order;
```

**Ejemplo de salida:**

```
       producto        |  categoria  |    especificacion     |      valor
-----------------------+-------------+-----------------------+------------------
 Dell XPS 15 9500      | Display     | Display diagonal      | 15.6"
 Dell XPS 15 9500      | Display     | Display resolution    | 1920 x 1080
 Dell XPS 15 9500      | Display     | Touchscreen           | Yes
 Dell XPS 15 9500      | Processor   | Processor family      | Intel Core i7
 Dell XPS 15 9500      | Processor   | Processor model       | i7-10750H
 Dell XPS 15 9500      | Memory      | Internal memory       | 16 GB
 Dell XPS 15 9500      | Storage     | Total storage capacity| 512 GB
```

### Ver Multimedia de un Producto

```sql
SELECT
  p.name as producto,
  pm.media_type as tipo,
  pm.url,
  pm.is_primary as principal
FROM products p
JOIN product_multimedia pm ON p.id = pm.product_id
WHERE p.sku = 'TU_SKU'
ORDER BY pm.position;
```

**Ejemplo de salida:**

```
       producto        |    tipo     |                  url                    | principal
-----------------------+-------------+-----------------------------------------+-----------
 Dell XPS 15 9500      | image       | https://icecat.biz/img/12345_high.jpg   |     t
 Dell XPS 15 9500      | image       | https://icecat.biz/img/12345_2.jpg      |     f
 Dell XPS 15 9500      | video       | https://icecat.biz/video/12345.mp4      |     f
 Dell XPS 15 9500      | pdf         | https://icecat.biz/pdf/datasheet.pdf    |     f
 Dell XPS 15 9500      | manual      | https://icecat.biz/manual/user.pdf      |     f
```

### Productos Sincronizados con Icecat

```sql
SELECT
  p.sku,
  p.name,
  ipm.icecat_id,
  ipm.gtin_ean_upc,
  ipm.quality,
  ipm.on_market,
  ipm.product_views,
  ipm.last_synced,
  COUNT(ps.id) as total_specs,
  COUNT(pm.id) as total_multimedia
FROM products p
JOIN icecat_product_mapping ipm ON p.id = ipm.product_id
LEFT JOIN product_specifications ps ON p.id = ps.product_id
LEFT JOIN product_multimedia pm ON p.id = pm.product_id
GROUP BY p.id, ipm.id
ORDER BY ipm.last_synced DESC
LIMIT 20;
```

### Buscar por Especificación

Encuentra productos con una especificación específica:

```sql
-- Ejemplo: Todos los productos con pantalla de 15.6"
SELECT DISTINCT
  p.sku,
  p.name,
  ps.spec_value
FROM products p
JOIN product_specifications ps ON p.id = ps.product_id
WHERE ps.spec_key ILIKE '%display diagonal%'
  AND ps.spec_value ILIKE '%15.6%'
ORDER BY p.name;
```

---

## 🔄 Flujos de Trabajo Recomendados

### Flujo 1: Importación Inicial Masiva (Excel)

Para importar todo tu catálogo inicial de Icecat:

```bash
# 1. Descargar archivo Excel de Icecat
# 2. Importar a PIM
curl -X POST http://localhost:3000/api/v1/import/icecat/excel \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@icecat_full_catalog.xlsx"

# 3. Verificar importación
curl -X GET "http://localhost:3000/api/v1/import/history" \
  -H "Authorization: Bearer $TOKEN"
```

### Flujo 2: Enriquecimiento Incremental (API)

Para enriquecer productos conforme los agregas:

```bash
# 1. Importar productos del proveedor (XML)
curl -X POST http://localhost:3000/api/v1/import/xml/supplier \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@productos_proveedor.xml"

# 2. Obtener GTINs de productos sin enriquecer
# 3. Sincronizar con Icecat
curl -X POST "http://localhost:3000/api/v1/import/icecat/sync/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gtins": ["GTIN1", "GTIN2", "GTIN3"]
  }'
```

### Flujo 3: Actualización Periódica

Para mantener datos actualizados:

```sql
-- Script SQL: Obtener productos que no se han actualizado en 30 días
SELECT
  p.id,
  p.gtin_ean_upc,
  ipm.last_synced
FROM products p
JOIN icecat_product_mapping ipm ON p.id = ipm.product_id
WHERE ipm.last_synced < CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND p.gtin_ean_upc IS NOT NULL
LIMIT 100;
```

Luego usa esos GTINs para actualizar:

```bash
# Usar bulk sync con los GTINs obtenidos
```

---

## 🎯 Mapeo de Datos

### Campos Core

| Campo Icecat | Campo Base de Datos | Tabla |
|--------------|---------------------|-------|
| Icecat_id | icecat_id | products |
| GTIN | gtin_ean_upc | products |
| ProductTitle | name | products |
| ShortDesc | short_description | products |
| LongDesc | long_description | products |
| Model | model_name | products |
| Supplier | brand_id | products (FK brands) |
| Category | category_id | products (FK categories) |
| Quality | quality_rating | products |
| OnMarket | on_market | products |
| Warranty | warranty | products |

### Especificaciones Dinámicas

Cualquier columna con formato `Category::Specification Name` se guarda en `product_specifications`:

- **spec_group** = "Category" (ej: "Display", "Processor")
- **spec_key** = "Specification Name" (ej: "Display diagonal", "Processor family")
- **spec_value** = valor de la celda

**Ejemplos:**
- `Display::Display diagonal` → group="Display", key="Display diagonal", value="15.6\""
- `Processor::Processor family` → group="Processor", key="Processor family", value="Intel Core i7"

### Multimedia

| Campo Icecat | media_type | Descripción |
|--------------|------------|-------------|
| ProductGallery | image | Galería de imágenes (separadas por `\|`) |
| HighPic | image_high | Imagen alta resolución |
| LowPic | image_low | Imagen baja resolución |
| ThumbPic | image_thumb | Miniatura |
| Video | video | URL del video |
| Video360 | video_360 | Video 360° |
| PDF | pdf | Ficha técnica PDF |
| Manual | manual | Manual de usuario |
| Pdf360 | pdf_360 | PDF 360° |

---

## 🔍 Casos de Uso

### Caso 1: Crear Filtros Dinámicos en tu Tienda

```sql
-- Obtener todos los valores únicos para una especificación
SELECT DISTINCT spec_value
FROM product_specifications
WHERE spec_key = 'Display diagonal'
ORDER BY spec_value;

-- Resultado: 13.3", 14", 15.6", 17.3", etc.
-- Usa estos valores para crear filtros en la UI
```

### Caso 2: Comparador de Productos

```sql
-- Obtener especificaciones para comparar 2 productos
SELECT
  p.name,
  ps.spec_group,
  ps.spec_key,
  ps.spec_value
FROM products p
JOIN product_specifications ps ON p.id = ps.product_id
WHERE p.id IN ('PRODUCT_ID_1', 'PRODUCT_ID_2')
ORDER BY ps.spec_group, ps.spec_order;
```

### Caso 3: SEO - Generar Meta Descriptions

```sql
-- Obtener especificaciones clave para meta description
SELECT
  p.name,
  STRING_AGG(ps.spec_value, ', ')
FROM products p
JOIN product_specifications ps ON p.id = ps.product_id
WHERE p.id = 'PRODUCT_ID'
  AND ps.spec_key IN (
    'Display diagonal',
    'Processor family',
    'Internal memory',
    'Total storage capacity'
  )
GROUP BY p.name;
```

---

## 🚨 Troubleshooting

### Error: "Icecat API credentials not configured"

**Solución:** Verifica que el archivo `.env` contenga:

```
ICECAT_USERNAME=tu_usuario
ICECAT_PASSWORD=tu_password
```

Reinicia el servidor después de editar `.env`.

### Error: "HTTP 401: Unauthorized"

**Causa:** Credenciales incorrectas de Icecat.

**Solución:**
1. Verifica que tu suscripción de Icecat esté activa
2. Confirma usuario y contraseña en el portal de Icecat
3. Actualiza las credenciales en `.env`

### Error: "Product not found in Icecat"

**Causa:** El GTIN no existe en la base de datos de Icecat.

**Solución:**
- Verifica que el GTIN sea correcto (13 dígitos, sin espacios)
- No todos los productos tienen datos en Icecat
- Considera enriquecer manualmente estos productos

### Error: "Missing required identifiers"

**Causa:** El producto en Excel no tiene Icecat_id, GTIN, ni Requested_prod_id.

**Solución:**
- Limpia el archivo Excel para eliminar filas vacías
- Verifica que las columnas tengan datos válidos

### Imágenes no se descargan

**Causa:** URLs de Icecat pueden expirar o requerir autenticación.

**Solución:**
- Las URLs se guardan en `product_multimedia` aunque no se descarguen
- Puedes procesar las imágenes manualmente más tarde
- Verifica conectividad de red del servidor

### Rate Limiting de Icecat

**Síntoma:** Errores después de varias consultas rápidas.

**Solución:**
- El sistema ya incluye un delay de 500ms entre requests
- Para importaciones masivas, usa el archivo Excel en lugar de API
- Considera dividir requests bulk en lotes más pequeños

---

## 📈 Mejores Prácticas

1. **Importación Inicial**
   - Usa archivo Excel de Icecat para carga masiva inicial
   - Reserva la API para actualizaciones y nuevos productos

2. **Mantenimiento**
   - Sincroniza productos con Icecat cada 30-60 días
   - Los datos de Icecat se actualizan periódicamente

3. **Optimización**
   - Indexa las columnas `spec_key` y `spec_group` para búsquedas rápidas
   - Usa consultas con `LIMIT` para evitar timeouts en tablas grandes

4. **Backup**
   - Haz backup antes de importaciones masivas de Excel
   - Las especificaciones existentes se eliminan y reemplazan en cada import

5. **Validación**
   - Revisa el `error_log` en `import_history` después de cada importación
   - Procesa los errores y reintenta productos fallidos

---

## 📞 Soporte

**Documentación relacionada:**
- `MAPEO-XML-PROVEEDOR.md` - Importación de datos del proveedor
- `GUIA-USO-XML-PROVEEDOR.md` - Guía de uso del sistema PIM
- `API.md` - Documentación completa de la API

**Recursos de Icecat:**
- Portal de Icecat: https://icecat.biz
- API Documentation: https://icecat.biz/api
- Support: support@icecat.biz

**ATLAS PIM Support:**
- GitHub Issues: https://github.com/your-repo/issues
- Email: support@atlaspim.com
