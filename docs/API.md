# ATLAS PIM - Documentación de API

## Introducción

La API de ATLAS PIM proporciona acceso completo al sistema de gestión de información de productos. Utiliza REST y devuelve respuestas en formato JSON.

**URL Base:** `http://localhost:3000/api/v1`

## Autenticación

La API utiliza JWT (JSON Web Tokens) para autenticación. Debes incluir el token en el header `Authorization` de todas las peticiones protegidas.

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Obtener Token

**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## Endpoints

### Autenticación

#### Registrar Usuario

**POST** `/auth/register`

```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "full_name": "John Doe"
}
```

#### Login

**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

#### Obtener Perfil

**GET** `/auth/me`

Headers: `Authorization: Bearer TOKEN`

---

### Productos

#### Listar Productos

**GET** `/products`

**Query Parameters:**
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Productos por página (default: 20, max: 100)
- `is_active` (opcional): Filtrar por estado (true/false)
- `category_id` (opcional): Filtrar por categoría
- `brand_id` (opcional): Filtrar por marca
- `search` (opcional): Búsqueda por nombre, SKU o descripción

**Ejemplo:**
```
GET /products?page=1&limit=20&is_active=true&search=laptop
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "sku": "PROD-001",
        "name": "Laptop Dell XPS 15",
        "price": 1299.99,
        "stock_quantity": 10,
        "is_active": true,
        "created_at": "2024-01-15T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

#### Obtener Producto por ID

**GET** `/products/:id`

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sku": "PROD-001",
    "name": "Laptop Dell XPS 15",
    "short_description": "Laptop profesional de alto rendimiento",
    "long_description": "Descripción detallada...",
    "price": 1299.99,
    "sale_price": 1199.99,
    "stock_quantity": 10,
    "images": [
      {
        "url": "/uploads/products/image-123.jpg",
        "thumbnail_url": "/uploads/products/thumbnails/image-123_thumb.jpg",
        "is_primary": true
      }
    ],
    "attributes": [],
    "translations": []
  }
}
```

#### Obtener Producto por SKU

**GET** `/products/sku/:sku`

Similar a obtener por ID pero usando SKU.

#### Crear Producto

**POST** `/products`

Headers: `Authorization: Bearer TOKEN`

Roles permitidos: admin, editor

```json
{
  "sku": "PROD-002",
  "name": "MacBook Pro 16",
  "short_description": "Potencia profesional",
  "long_description": "Descripción completa...",
  "price": 2499.99,
  "cost_price": 2000.00,
  "stock_quantity": 5,
  "weight": 2.0,
  "width": 35.79,
  "height": 1.62,
  "depth": 24.59,
  "is_active": true,
  "meta_title": "MacBook Pro 16 - Comprar",
  "meta_description": "MacBook Pro 16 pulgadas..."
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sku": "PROD-002",
    "name": "MacBook Pro 16",
    "slug": "macbook-pro-16",
    "created_at": "2024-01-15T12:00:00Z"
  }
}
```

#### Actualizar Producto

**PUT** `/products/:id`

Headers: `Authorization: Bearer TOKEN`

Roles permitidos: admin, editor

```json
{
  "name": "MacBook Pro 16 (Updated)",
  "price": 2399.99,
  "stock_quantity": 8
}
```

#### Eliminar Producto

**DELETE** `/products/:id`

Headers: `Authorization: Bearer TOKEN`

Roles permitidos: admin

---

### Imágenes

#### Subir Imagen

**POST** `/images/upload`

Headers:
- `Authorization: Bearer TOKEN`
- `Content-Type: multipart/form-data`

Roles permitidos: admin, editor

**Form Data:**
- `image`: Archivo de imagen (max 10MB)

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "url": "/uploads/products/image-456.jpg",
    "thumbnail_url": "/uploads/products/thumbnails/image-456_thumb.jpg",
    "width": 1920,
    "height": 1080,
    "file_size": 245678
  }
}
```

#### Procesar Imagen desde URL

**POST** `/images/from-url`

Headers: `Authorization: Bearer TOKEN`

```json
{
  "url": "https://example.com/product-image.jpg"
}
```

#### Añadir Imagen a Producto

**POST** `/products/:id/images`

Headers: `Authorization: Bearer TOKEN`

```json
{
  "url": "/uploads/products/image-456.jpg",
  "thumbnail_url": "/uploads/products/thumbnails/image-456_thumb.jpg",
  "alt_text": "MacBook Pro Vista Frontal",
  "is_primary": true
}
```

#### Eliminar Imagen de Producto

**DELETE** `/products/:productId/images/:imageId`

Headers: `Authorization: Bearer TOKEN`

#### Establecer Imagen Principal

**PUT** `/products/:productId/images/:imageId/primary`

Headers: `Authorization: Bearer TOKEN`

---

### Importación

#### Importar desde CSV

**POST** `/import/csv`

Headers:
- `Authorization: Bearer TOKEN`
- `Content-Type: multipart/form-data`

Roles permitidos: admin, editor

**Form Data:**
- `file`: Archivo CSV
- `columnMapping` (opcional): JSON con mapeo de columnas

**Formato CSV esperado:**
```csv
sku,name,description,price,stock,image_url
PROD-001,Product Name,Description here,99.99,10,https://example.com/image.jpg
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "total_rows": 100,
    "successful_rows": 95,
    "failed_rows": 5,
    "errors": [
      {
        "row": 10,
        "error": "Invalid price format",
        "data": {...}
      }
    ]
  }
}
```

#### Importar desde Excel

**POST** `/import/excel`

Similar a CSV pero acepta archivos .xlsx

#### Historial de Importaciones

**GET** `/import/history`

Headers: `Authorization: Bearer TOKEN`

**Query Parameters:**
- `page` (opcional): Número de página
- `limit` (opcional): Resultados por página

---

### Exportación

#### Exportar a JSON (Prestashop)

**GET** `/export/prestashop/json`

Headers: `Authorization: Bearer TOKEN`

**Query Parameters:**
- `category_id` (opcional): Filtrar por categoría
- `brand_id` (opcional): Filtrar por marca

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "reference": "PROD-001",
      "name": "Product Name",
      "description_short": "Short desc",
      "description": "Long description",
      "price": 99.99,
      "quantity": 10,
      "images": ["/uploads/products/image.jpg"],
      "active": 1
    }
  ]
}
```

#### Exportar a CSV (Prestashop)

**GET** `/export/prestashop/csv`

Headers: `Authorization: Bearer TOKEN`

Devuelve un archivo CSV listo para importar en Prestashop.

#### Obtener Producto para Prestashop

**GET** `/export/prestashop/product/:id`

Headers: `Authorization: Bearer TOKEN`

#### Sincronizar con Prestashop

**POST** `/export/prestashop/sync/:id`

Headers: `Authorization: Bearer TOKEN`

Sincroniza directamente un producto con Prestashop vía API.

---

## Códigos de Error

| Código | Descripción |
|--------|-------------|
| 200 | OK - Petición exitosa |
| 201 | Created - Recurso creado |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - No autenticado |
| 403 | Forbidden - No autorizado |
| 404 | Not Found - Recurso no encontrado |
| 409 | Conflict - Recurso duplicado |
| 500 | Internal Server Error - Error del servidor |

## Formato de Respuesta

Todas las respuestas siguen este formato:

**Éxito:**
```json
{
  "success": true,
  "data": {...}
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "details": {...}
  }
}
```

## Rate Limiting

- Límite: 100 peticiones por 15 minutos
- Headers de respuesta incluyen información de rate limit

## Ejemplos de Uso

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Obtener productos
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer YOUR_TOKEN"

# Crear producto
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"PROD-001","name":"Product Name","price":99.99}'
```

### JavaScript (Fetch)

```javascript
// Login
const login = async () => {
  const response = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'password'
    })
  });
  const data = await response.json();
  return data.data.token;
};

// Obtener productos
const getProducts = async (token) => {
  const response = await fetch('http://localhost:3000/api/v1/products', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
};
```

### Python

```python
import requests

# Login
response = requests.post('http://localhost:3000/api/v1/auth/login', json={
    'email': 'user@example.com',
    'password': 'password'
})
token = response.json()['data']['token']

# Obtener productos
headers = {'Authorization': f'Bearer {token}'}
response = requests.get('http://localhost:3000/api/v1/products', headers=headers)
products = response.json()
```

## Soporte

Para más información o soporte, contacta a: support@atlaspim.com
