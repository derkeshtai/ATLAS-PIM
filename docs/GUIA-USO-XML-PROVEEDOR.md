# Guía de Uso - Importación XML del Proveedor

Esta guía te muestra cómo usar el sistema ATLAS PIM con los archivos XML de tu proveedor.

## 🚀 Inicio Rápido

### Paso 1: Configurar la Base de Datos

Después de iniciar el sistema, ejecuta las extensiones de schema:

```bash
# Si usas Docker
docker-compose exec postgres psql -U postgres -d atlas_pim -f /app/src/config/schema-extensions.sql

# Si usas instalación manual
psql -U postgres -d atlas_pim -f backend/src/config/schema-extensions.sql
```

Esto creará las tablas adicionales necesarias:
- `product_promotions` - Para promociones y descuentos
- `warehouse_locations` - Ubicaciones de almacén
- `product_stock_locations` - Stock por ubicación
- Campos adicionales en `products`

### Paso 2: Obtener Token de Autenticación

```bash
# Registrar usuario
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tuempresa.com",
    "password": "TuPassword123",
    "full_name": "Admin"
  }'

# Login (si ya estás registrado)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tuempresa.com",
    "password": "TuPassword123"
  }'
```

Guarda el token JWT que recibes.

### Paso 3: Importar XML del Proveedor

```bash
# Guardar el token en una variable
export TOKEN="tu_token_jwt_aqui"

# Importar archivo XML
curl -X POST http://localhost:3000/api/v1/import/xml/supplier \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@productos_proveedor.xml"
```

**Respuesta esperada:**

```json
{
  "success": true,
  "data": {
    "total_items": 12,
    "successful_items": 12,
    "failed_items": 0,
    "categories_created": 8,
    "brands_created": 6,
    "warehouses_synced": 12,
    "errors": []
  }
}
```

## 📊 Verificar Importación

### Ver Productos Importados

```bash
curl -X GET "http://localhost:3000/api/v1/products?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Buscar un Producto Específico

```bash
# Por SKU del proveedor
curl -X GET "http://localhost:3000/api/v1/products/sku/AA-139" \
  -H "Authorization: Bearer $TOKEN"
```

### Ver Detalles Completos de un Producto

```bash
# Por ID (obtienes el ID del listado anterior)
curl -X GET "http://localhost:3000/api/v1/products/PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## 🏷️ Trabajar con Categorías

### Ver Todas las Categorías

```sql
-- Conectar a la base de datos
psql -U postgres -d atlas_pim

-- Ver jerarquía de categorías
SELECT
  COALESCE(parent.name, c.name) as grupo,
  CASE WHEN parent.id IS NOT NULL THEN c.name ELSE NULL END as subgrupo,
  c.is_active,
  COUNT(p.id) as total_productos
FROM categories c
LEFT JOIN categories parent ON c.parent_id = parent.id
LEFT JOIN products p ON c.id = p.category_id
GROUP BY c.id, parent.name, c.name, parent.id
ORDER BY grupo, subgrupo;
```

**Ejemplo de salida:**

```
       grupo        |  subgrupo  | is_active | total_productos
--------------------+------------+-----------+-----------------
 ACCESORIOS         | ADAPTADORES|     t     |       2
 ACCESORIOS         | CONECTIVIDAD|    t     |       2
 ACCESORIOS         | GAMERS     |     t     |       3
 AIRE ACONDICIONADO | SITE       |     t     |       5
```

## 🎁 Consultar Promociones

### Ver Productos con Promoción Activa

```sql
SELECT
  p.sku,
  p.name,
  p.price,
  p.currency,
  pp.promotion_code,
  pp.promotion_description,
  pp.discounted_price,
  pp.discount_amount,
  pp.valid_until,
  CASE
    WHEN pp.valid_until > CURRENT_TIMESTAMP THEN 'ACTIVA'
    WHEN pp.valid_until IS NULL THEN 'SIN VENCIMIENTO'
    ELSE 'VENCIDA'
  END as estado
FROM products p
JOIN product_promotions pp ON p.id = pp.product_id
WHERE pp.is_active = true
ORDER BY pp.valid_until;
```

### Actualizar Promoción Manualmente

```sql
UPDATE product_promotions
SET valid_until = '2025-12-31'::timestamp
WHERE promotion_code = '582929';
```

## 📦 Consultar Stock por Ubicación

### Ver Stock de un Producto por Ubicación

```sql
SELECT
  p.sku,
  p.name,
  wl.name as ubicacion,
  psl.quantity as stock,
  psl.updated_at as ultima_actualizacion
FROM products p
JOIN product_stock_locations psl ON p.id = psl.product_id
JOIN warehouse_locations wl ON psl.warehouse_id = wl.id
WHERE p.sku = 'AC-10009'
ORDER BY psl.quantity DESC;
```

**Ejemplo de salida:**

```
   sku     |        name         |       ubicacion        | stock | ultima_actualizacion
-----------+---------------------+------------------------+-------+---------------------
 AC-10009  | ADAPTADOR TP-LINK   | Ventas Guadalajara     |  21   | 2024-11-15 10:30:00
 AC-10009  | ADAPTADOR TP-LINK   | Ventas Querétaro       |   5   | 2024-11-15 10:30:00
 AC-10009  | ADAPTADOR TP-LINK   | Ventas Cancún          |   4   | 2024-11-15 10:30:00
```

### Ver Productos con Stock Bajo

```sql
SELECT
  p.sku,
  p.name,
  p.stock_quantity as stock_total,
  p.low_stock_threshold as umbral,
  COUNT(psl.id) as ubicaciones_con_stock
FROM products p
LEFT JOIN product_stock_locations psl ON p.id = psl.product_id AND psl.quantity > 0
WHERE p.stock_quantity <= p.low_stock_threshold
GROUP BY p.id
ORDER BY p.stock_quantity;
```

## 🔄 Actualizar Productos Existentes

Si importas el XML nuevamente, los productos existentes se **actualizarán** automáticamente:

```bash
# Segunda importación (actualiza productos existentes)
curl -X POST http://localhost:3000/api/v1/import/xml/supplier \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@productos_proveedor_actualizado.xml"
```

**El sistema:**
- ✅ Actualiza precios, stock y descripciones
- ✅ Actualiza promociones activas
- ✅ Actualiza stock por ubicación
- ✅ Descarga nuevas imágenes si la URL cambió
- ✅ Mantiene el mismo ID del producto

## 🎨 Enriquecer Información

Después de importar, puedes enriquecer los productos:

### Actualizar Descripción

```bash
curl -X PUT "http://localhost:3000/api/v1/products/PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "short_description": "Descripción mejorada y más atractiva",
    "long_description": "Especificaciones técnicas completas...",
    "meta_title": "Título SEO Optimizado",
    "meta_description": "Descripción para buscadores",
    "meta_keywords": "palabra1, palabra2, palabra3"
  }'
```

### Agregar Imágenes Adicionales

```bash
# Subir imagen local
curl -X POST "http://localhost:3000/api/v1/images/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@mi-imagen-mejorada.jpg"

# Guardar la URL que te devuelve, luego:
curl -X POST "http://localhost:3000/api/v1/products/PRODUCT_ID/images" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "/uploads/products/imagen-123.jpg",
    "thumbnail_url": "/uploads/products/thumbnails/imagen-123_thumb.jpg",
    "alt_text": "Vista frontal del producto",
    "is_primary": false
  }'
```

## 📤 Exportar a Prestashop

### Exportar Todos los Productos

```bash
# Formato JSON
curl -X GET "http://localhost:3000/api/v1/export/prestashop/json" \
  -H "Authorization: Bearer $TOKEN" > productos_prestashop.json

# Formato CSV
curl -X GET "http://localhost:3000/api/v1/export/prestashop/csv" \
  -H "Authorization: Bearer $TOKEN" > productos_prestashop.csv
```

### Exportar por Categoría

```bash
# Obtener ID de categoría primero
curl -X GET "http://localhost:3000/api/v1/products?limit=1" \
  -H "Authorization: Bearer $TOKEN"

# Exportar solo esa categoría
curl -X GET "http://localhost:3000/api/v1/export/prestashop/json?category_id=CATEGORY_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## 🔍 Búsquedas Avanzadas

### Buscar por Texto

```bash
curl -X GET "http://localhost:3000/api/v1/products?search=HUAWEI" \
  -H "Authorization: Bearer $TOKEN"
```

### Filtrar por Marca

```bash
curl -X GET "http://localhost:3000/api/v1/products?brand_id=BRAND_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Filtrar por Categoría

```bash
curl -X GET "http://localhost:3000/api/v1/products?category_id=CATEGORY_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Combinar Filtros

```bash
curl -X GET "http://localhost:3000/api/v1/products?is_active=true&category_id=CATEGORY_ID&search=gaming&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

## 📊 Reportes Útiles

### Productos Más Caros

```sql
SELECT
  p.sku,
  p.name,
  p.price,
  p.currency,
  b.name as marca,
  CASE
    WHEN p.currency = 'USD' THEN p.price * p.exchange_rate
    ELSE p.price
  END as precio_mxn
FROM products p
LEFT JOIN brands b ON p.brand_id = b.id
ORDER BY precio_mxn DESC
LIMIT 10;
```

### Productos con Promoción Próxima a Vencer

```sql
SELECT
  p.sku,
  p.name,
  pp.promotion_description,
  pp.discounted_price,
  pp.valid_until,
  pp.valid_until - CURRENT_TIMESTAMP as tiempo_restante
FROM products p
JOIN product_promotions pp ON p.id = pp.product_id
WHERE pp.valid_until > CURRENT_TIMESTAMP
  AND pp.valid_until < CURRENT_TIMESTAMP + INTERVAL '7 days'
ORDER BY pp.valid_until;
```

### Stock Total por Marca

```sql
SELECT
  b.name as marca,
  COUNT(p.id) as total_productos,
  SUM(p.stock_quantity) as stock_total,
  AVG(p.price) as precio_promedio
FROM products p
JOIN brands b ON p.brand_id = b.id
GROUP BY b.name
ORDER BY stock_total DESC;
```

## 🔧 Mantenimiento

### Limpiar Promociones Vencidas

```sql
UPDATE product_promotions
SET is_active = false
WHERE valid_until < CURRENT_TIMESTAMP
  AND is_active = true;
```

### Ver Historial de Importaciones

```bash
curl -X GET "http://localhost:3000/api/v1/import/history" \
  -H "Authorization: Bearer $TOKEN"
```

### Recalcular Stock Total

```sql
-- Actualizar stock_quantity basado en suma de ubicaciones
UPDATE products p
SET stock_quantity = (
  SELECT COALESCE(SUM(psl.quantity), 0)
  FROM product_stock_locations psl
  WHERE psl.product_id = p.id
);
```

## 🚨 Troubleshooting

### Error: "No se puede procesar imagen"

Si algunas imágenes fallan al importar:

1. Verifica que las URLs de imágenes sean accesibles
2. Las imágenes se procesarán en segundo plano
3. Los productos se crearán de todos modos sin imagen

```bash
# Ver errores de importación
curl -X GET "http://localhost:3000/api/v1/import/history" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.data[0].error_log'
```

### Error: "Producto duplicado"

Si el `supplier_sku` ya existe, el producto se actualizará automáticamente en lugar de crear uno nuevo.

### Verificar Integridad de Datos

```sql
-- Productos sin categoría
SELECT sku, name FROM products WHERE category_id IS NULL;

-- Productos sin marca
SELECT sku, name FROM products WHERE brand_id IS NULL;

-- Productos sin imagen
SELECT p.sku, p.name
FROM products p
LEFT JOIN product_images pi ON p.id = pi.product_id
WHERE pi.id IS NULL;
```

## 💡 Mejores Prácticas

1. **Importa regularmente** - Programa importaciones automáticas del XML del proveedor
2. **Enriquece después de importar** - Mejora descripciones, agrega imágenes de calidad
3. **Revisa promociones** - Verifica fechas de vencimiento periódicamente
4. **Monitorea stock** - Configura alertas para stock bajo
5. **Haz backups** - Respalda la base de datos antes de importaciones grandes

## 📞 Soporte

Si tienes problemas o necesitas ayuda:

- **Documentación API**: `docs/API.md`
- **Mapeo de Campos**: `docs/MAPEO-XML-PROVEEDOR.md`
- **Issues**: GitHub Issues
- **Email**: support@atlaspim.com
