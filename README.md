# ATLAS-PIM - Product Information Management System

Sistema PIM (Product Information Management) diseñado para enriquecer y estandarizar información de productos para e-commerce.

## Características

- 🎯 **Gestión centralizada** de información de productos
- 📸 **Optimización automática** de imágenes
- 🔄 **Importación masiva** desde CSV/Excel/XML de proveedores
- 🌟 **Integración Icecat** - Enriquecimiento automático con especificaciones técnicas, imágenes HD, videos, manuales
- 🚀 **API REST** para integración con múltiples plataformas
- 🛒 **Integración nativa** con Prestashop 9.0
- 🔐 **Autenticación JWT** para seguridad
- 🌐 **Soporte multi-idioma**
- 📊 **Enriquecimiento de datos** (descripciones, atributos, categorías)

## Arquitectura

### Backend (Node.js + TypeScript + Express)
- API RESTful para CRUD de productos
- PostgreSQL para almacenamiento
- Sharp para optimización de imágenes
- JWT para autenticación

### Prestashop Module
- Módulo PHP para Prestashop 9.0
- Sincronización bidireccional
- Configuración vía panel admin

## Estructura del Proyecto

```
ATLAS-PIM/
├── backend/                 # API Backend
│   ├── src/
│   │   ├── controllers/    # Controladores API
│   │   ├── models/         # Modelos de datos
│   │   ├── routes/         # Rutas API
│   │   ├── services/       # Lógica de negocio
│   │   ├── middleware/     # Middleware (auth, validation)
│   │   └── utils/          # Utilidades
│   ├── uploads/            # Almacenamiento temporal
│   └── tests/              # Tests
│
├── prestashop-module/      # Módulo Prestashop 9.0
│   └── atlaspim/          # Módulo connector
│
├── docs/                   # Documentación
└── docker/                 # Configuración Docker
```

## Inicio Rápido

### Requisitos
- Node.js 18+
- PostgreSQL 14+
- Docker (opcional)

### Instalación

1. **Backend**
```bash
cd backend
npm install
cp .env.example .env
# Configurar variables de entorno
npm run dev
```

2. **Prestashop Module**
```bash
cd prestashop-module
# Copiar carpeta atlaspim/ a prestashop/modules/
```

## API Endpoints

### Productos
- `GET /api/products` - Listar productos
- `GET /api/products/:id` - Obtener producto
- `POST /api/products` - Crear producto
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto

### Importación
- `POST /api/import/csv` - Importar desde CSV
- `POST /api/import/excel` - Importar desde Excel
- `POST /api/import/xml/supplier` - **Importar XML del proveedor** (incluye promociones, ubicaciones de stock, etc.)

### Integración Icecat
- `POST /api/import/icecat/excel` - **Importar archivo Excel de Icecat**
- `POST /api/import/icecat/sync/:gtin` - **Sincronizar producto por GTIN desde API Icecat**
- `POST /api/import/icecat/sync/bulk` - **Sincronizar múltiples productos (hasta 100 GTINs)**
- `PUT /api/import/icecat/update/:productId` - **Actualizar producto con datos frescos de Icecat**
- `GET /api/import/icecat/test/:gtin` - Test de conexión con Icecat API

### Exportación
- `GET /api/export/prestashop` - Exportar a formato Prestashop

### Imágenes
- `POST /api/images/upload` - Subir imagen
- `POST /api/images/optimize` - Optimizar imágenes

## 🎯 Importación XML del Proveedor

El sistema está **optimizado para importar directamente los archivos XML** que proporciona tu proveedor:

```bash
curl -X POST http://localhost:3000/api/v1/import/xml/supplier \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@productos_proveedor.xml"
```

### Características de la Importación XML:

✅ **Mapeo automático** de todos los campos del proveedor
✅ **Creación automática** de categorías jerárquicas (grupo → subgrupo)
✅ **Creación automática** de marcas
✅ **Gestión de promociones** con fechas de vencimiento
✅ **Stock multi-ubicación** (21 ubicaciones de almacén)
✅ **Descarga y optimización** automática de imágenes
✅ **Actualización inteligente** de productos existentes
✅ **Soporte para tipo de cambio** (Dólares/Pesos)

Ver documentación completa: [`docs/MAPEO-XML-PROVEEDOR.md`](docs/MAPEO-XML-PROVEEDOR.md)

## 🌟 Integración Icecat

El sistema incluye **integración completa con Icecat** para enriquecer automáticamente tus productos con:

- ✅ **Especificaciones técnicas detalladas** (cientos de atributos por producto)
- ✅ **Imágenes de alta calidad** (ProductGallery, HighPic, LowPic)
- ✅ **Videos demostrativos** y videos 360°
- ✅ **Documentación** (fichas técnicas PDF, manuales de usuario)
- ✅ **Datos estructurados** (categorías, modelos, garantías)

### Dos formas de integración:

**1. Importación desde Excel** (carga masiva):
```bash
curl -X POST http://localhost:3000/api/v1/import/icecat/excel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@icecat_products.xlsx"
```

**2. API en tiempo real** (por GTIN/EAN):
```bash
curl -X POST http://localhost:3000/api/v1/import/icecat/sync/7331021041875 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Ver guía completa: [`docs/ICECAT-INTEGRATION.md`](docs/ICECAT-INTEGRATION.md)

## Configuración

Ver archivo `.env.example` para variables de entorno requeridas.

## Licencia

MIT
