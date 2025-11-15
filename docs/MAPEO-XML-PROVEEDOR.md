# Mapeo de Campos XML del Proveedor

Este documento explica cómo se mapean los campos del XML del proveedor a la base de datos del PIM ATLAS.

## 📋 Estructura XML del Proveedor

El proveedor envía archivos XML con la siguiente estructura:

```xml
<articulos>
  <item>
    <clave>AA-139</clave>
    <codigo_fabricante>02233WNAN-DPS</codigo_fabricante>
    <descripcion>HUAWEI FUSIONMODULE500...</descripcion>
    <solucion>ENERGÍA</solucion>
    <grupo>AIRE ACONDICIONADO</grupo>
    <subgrupo>SITE</subgrupo>
    <marca>HUAWEI</marca>
    <garantia>12 MESES</garantia>
    <!-- ... más campos ... -->
  </item>
</articulos>
```

## 🔄 Mapeo de Campos

### Tabla: `products`

| Campo XML | Campo Base de Datos | Tipo | Notas |
|-----------|---------------------|------|-------|
| `clave` | `supplier_sku` | VARCHAR(100) | SKU del proveedor (único) |
| `clave` | `sku` | VARCHAR(100) | Se usa también como SKU principal |
| `descripcion` | `name` | VARCHAR(500) | Nombre del producto |
| `descripcion` | `slug` | VARCHAR(500) | Se genera automáticamente |
| `codigo_fabricante` | `manufacturer_code` | VARCHAR(255) | Código del fabricante |
| `precio` | `price` | DECIMAL(10,2) | Precio del producto |
| `moneda` | `currency` | VARCHAR(3) | USD o MXN |
| `disponible` | `stock_quantity` | INTEGER | Stock total disponible |
| `ficha_tecnica` | `long_description` | TEXT | Especificaciones técnicas |
| `ficha_comercial` | `short_description` | TEXT | Descripción comercial |
| `garantia` | `warranty` | VARCHAR(100) | Garantía del producto |
| `clase` | `product_class` | VARCHAR(50) | Clase del producto |
| `solucion` | `solution` | VARCHAR(100) | Solución/aplicación |
| `tipocambio` | `exchange_rate` | DECIMAL(10,4) | Tipo de cambio |
| `marca` | `brand_id` | UUID | FK a tabla `brands` |
| `grupo` + `subgrupo` | `category_id` | UUID | FK a tabla `categories` |

### Tabla: `brands`

**Creación automática si no existe**

| Campo XML | Campo Base de Datos | Notas |
|-----------|---------------------|-------|
| `marca` | `name` | Nombre de la marca |
| Auto-generado | `slug` | Slug de la marca |

### Tabla: `categories`

**Jerarquía: grupo → subgrupo**

| Campo XML | Campo Base de Datos | Nivel | Notas |
|-----------|---------------------|-------|-------|
| `grupo` | `name` | Padre | Categoría principal |
| `grupo` | `slug` | Padre | Auto-generado |
| `subgrupo` | `name` | Hijo | Subcategoría |
| `subgrupo` | `slug` | Hijo | Auto-generado |
| - | `parent_id` | Hijo | Referencia al grupo padre |

**Ejemplo de jerarquía:**
```
AIRE ACONDICIONADO (grupo)
  └── SITE (subgrupo)
```

### Tabla: `product_images`

| Campo XML | Campo Base de Datos | Notas |
|-----------|---------------------|-------|
| `imagen` | `url` | URL procesada y optimizada |
| Auto-generado | `thumbnail_url` | Miniatura generada |
| Auto-detectado | `width` | Ancho de la imagen |
| Auto-detectado | `height` | Alto de la imagen |
| Auto-detectado | `file_size` | Tamaño del archivo |
| `true` | `is_primary` | Siempre es imagen principal |

### Tabla: `product_promotions`

| Campo XML | Campo Base de Datos | Notas |
|-----------|---------------------|-------|
| `ClavePromocion` | `promotion_code` | Código de la promoción |
| `DescripcionPromocion` | `promotion_description` | Descripción |
| `TotalDescuento` | `discount_amount` | Monto del descuento |
| `PrecioDescuento` | `discounted_price` | Precio con descuento |
| `MonedaPrecioDescuento` | `discounted_price_currency` | Moneda del descuento |
| `VencimientoPromocion` | `valid_until` | Fecha de vencimiento (DD/MM/YYYY) |

**Nota:** Si los campos de promoción contienen "Sin Descuento", no se crea el registro.

### Tabla: `product_stock_locations`

Múltiples ubicaciones de almacén:

| Campo XML | Warehouse Code | Nombre |
|-----------|----------------|--------|
| `MEXICO_CENTRO_DE_DISTRIBUCION` | MEXICO_CD | México Centro de Distribución |
| `MONTERREY_CENTRO_DE_DISTRIBUCION` | MONTERREY_CD | Monterrey Centro de Distribución |
| `VENTAS_CANCUN` | CANCUN | Ventas Cancún |
| `VENTAS_CHIHUAHUA` | CHIHUAHUA | Ventas Chihuahua |
| `VENTAS_CULIACAN` | CULIACAN | Ventas Culiacán |
| `VENTAS_GUADALAJARA` | GUADALAJARA | Ventas Guadalajara |
| `VENTAS_HERMOSILLO` | HERMOSILLO | Ventas Hermosillo |
| `VENTAS_LEON` | LEON | Ventas León |
| `VENTAS_MERIDA` | MERIDA | Ventas Mérida |
| `VENTAS_MONTERREY` | MONTERREY | Ventas Monterrey |
| `VENTAS_MORELIA` | MORELIA | Ventas Morelia |
| `VENTAS_OAXACA` | OAXACA | Ventas Oaxaca |
| `VENTAS_PACHUCA` | PACHUCA | Ventas Pachuca |
| `VENTAS_PUEBLA` | PUEBLA | Ventas Puebla |
| `VENTAS_QUERETARO` | QUERETARO | Ventas Querétaro |
| `VENTAS_TEPIC` | TEPIC | Ventas Tepic |
| `VENTAS_TOLUCA` | TOLUCA | Ventas Toluca |
| `VENTAS_TORREON` | TORREON | Ventas Torreón |
| `VENTAS_TUXTLA` | TUXTLA | Ventas Tuxtla |
| `VENTAS_VERACRUZ` | VERACRUZ | Ventas Veracruz |
| `VENTAS_VILLAHERMOSA` | VILLAHERMOSA | Ventas Villahermosa |

## 🔍 Campos No Utilizados

Los siguientes campos del XML no se mapean actualmente (pueden agregarse como atributos personalizados si se necesitan):

- `disponibleCD`
- `fechaactualizatipoc`
- `MonedaDescuento`
- `DisponibleEnPromocion`
- `TipoProducto`
- `IdDepartamento`
- `Departamento`

## 🎯 Lógica de Importación

### 1. Creación vs Actualización

- **Si existe** un producto con el mismo `supplier_sku` → **Actualiza** el producto existente
- **Si no existe** → **Crea** un nuevo producto

### 2. Categorías y Marcas

- **Marcas**: Se crean automáticamente si no existen
- **Categorías**: Se crean con jerarquía grupo/subgrupo automáticamente

### 3. Imágenes

- Se **elimina** la imagen anterior del producto
- Se **descarga** la imagen desde la URL del proveedor
- Se **optimiza** y se genera thumbnail automáticamente
- Se guarda localmente en el PIM

### 4. Promociones

- Se **eliminan** promociones anteriores del producto
- Se **crea** nueva promoción si está activa
- Se parsea la fecha de vencimiento (formato DD/MM/YYYY)

### 5. Ubicaciones de Almacén

- Se **eliminan** ubicaciones anteriores
- Se **crean** solo ubicaciones con stock > 0
- Suma total se refleja en `products.stock_quantity`

## 📝 Ejemplo de Uso

### Importar XML vía API

```bash
curl -X POST http://localhost:3000/api/v1/import/xml/supplier \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@productos_proveedor.xml"
```

### Respuesta

```json
{
  "success": true,
  "data": {
    "total_items": 100,
    "successful_items": 98,
    "failed_items": 2,
    "categories_created": 15,
    "brands_created": 8,
    "warehouses_synced": 98,
    "errors": [
      {
        "item": "AA-999",
        "error": "Invalid image URL",
        "data": {...}
      }
    ]
  }
}
```

## 🔧 Mapeo de Moneda

| Valor XML | Código Currency |
|-----------|-----------------|
| "Dolares" / "Dolar" | USD |
| "Pesos" / "Peso" | MXN |
| Otros | MXN (default) |

## 📊 Consultas Útiles

### Ver productos con sus promociones

```sql
SELECT
  p.sku,
  p.name,
  p.price,
  pp.promotion_code,
  pp.discounted_price,
  pp.valid_until
FROM products p
LEFT JOIN product_promotions pp ON p.id = pp.product_id
WHERE pp.is_active = true;
```

### Ver stock por ubicación

```sql
SELECT
  p.sku,
  p.name,
  wl.name as warehouse,
  psl.quantity
FROM products p
JOIN product_stock_locations psl ON p.id = psl.product_id
JOIN warehouse_locations wl ON psl.warehouse_id = wl.id
WHERE psl.quantity > 0
ORDER BY p.sku, wl.name;
```

### Ver jerarquía de categorías

```sql
SELECT
  parent.name as grupo,
  child.name as subgrupo,
  COUNT(p.id) as productos
FROM categories parent
LEFT JOIN categories child ON parent.id = child.parent_id
LEFT JOIN products p ON child.id = p.category_id
WHERE parent.parent_id IS NULL
GROUP BY parent.name, child.name
ORDER BY parent.name, child.name;
```

## 🚀 Próximos Pasos

Después de importar:

1. **Revisar productos importados**: Verificar que la información se haya mapeado correctamente
2. **Enriquecer información**: Agregar descripciones mejoradas, imágenes adicionales, atributos
3. **Configurar precios**: Ajustar márgenes si es necesario
4. **Sincronizar con Prestashop**: Usar el endpoint de exportación

## 📞 Soporte

Si encuentras problemas con el mapeo o necesitas campos adicionales, contacta al equipo de desarrollo.
