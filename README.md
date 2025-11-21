# ATLAS-PIM - Product Information Management System

Sistema PIM (Product Information Management) diseñado para enriquecer y estandarizar información de productos para e-commerce.

## Características

### Core Features
- 🎯 **Gestión centralizada** de información de productos
- 📸 **Optimización automática** de imágenes
- 🔄 **Importación masiva** desde CSV/Excel/XML de proveedores
- 🚀 **API REST** para integración con múltiples plataformas
- 🛒 **Integración nativa** con Prestashop 9.0
- 🔐 **Autenticación JWT** y hardening de seguridad
- 🌐 **Soporte multi-idioma**
- 📊 **Enriquecimiento de datos** (descripciones, atributos, categorías)

### Advanced Integrations
- 🌟 **Integración Icecat** - Enriquecimiento automático con especificaciones técnicas, imágenes HD, videos, manuales
- 🏪 **CVA API Direct Sync** - Sincronización directa con GrupoCVA para inventario y precios en tiempo real
- 🤖 **AI Curation** - Generación automática de contenido con Claude AI y LM Studio
- ⏰ **CronJobs Automáticos** - Sincronización programada sin dependencias externas

### Security & Performance
- 🔒 **Security Hardening** - HMAC, rate limiting, IP whitelisting, encrypted credentials
- 📈 **PostgreSQL-based Rate Limiting** - Sin dependencia de Redis
- 📝 **Audit Logging** - Registro completo de eventos de seguridad
- 🔑 **AES-256-GCM Encryption** - Para credenciales sensibles

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

## 🏪 CVA Direct Sync (Nuevo)

Sincronización directa con la API de GrupoCVA para inventario y precios en tiempo real:

- ✅ **Sincronización automática** de inventario (cada hora)
- ✅ **Sincronización en checkout** (stock en tiempo real antes de compra)
- ✅ **Multi-ubicación** (sucursal + CEDIS)
- ✅ **Credenciales encriptadas** (AES-256-GCM)
- ✅ **Gestión automática de tokens** (12 horas de validez)

```bash
# En PrestaShop Module: Modules > ATLAS PIM > CVA Configuration
# Configurar cuenta y password de GrupoCVA
# Habilitar auto-sync y sync on checkout
```

Ver documentación: [`docs/PRESTASHOP-CVA-SYNC.md`](docs/PRESTASHOP-CVA-SYNC.md)

## 🤖 AI Curation (Nuevo)

Generación automática de contenido de productos con IA:

- ✅ **Dual AI Support:** Claude API (cloud) y LM Studio (local/privado)
- ✅ **Generación de descripciones** cortas y largas con bullet points
- ✅ **SEO automático:** Meta titles, descriptions, keywords
- ✅ **Validación de datos** con IA
- ✅ **Workflow de aprobación** manual opcional
- ✅ **Tracking de costos** para Claude API

Endpoints:
- `POST /api/v1/ai/config` - Configurar AI provider
- `POST /api/v1/ai/curate/:productId` - Curar un producto
- `POST /api/v1/ai/curate/bulk` - Curación masiva
- `GET /api/v1/ai/stats` - Estadísticas de uso

## ⏰ CronJobs Automáticos (Nuevo)

Sistema de tareas programadas sin dependencias externas (usando node-cron):

**Tareas disponibles:**
- **CVA Inventory Sync** - Cada hora (`0 * * * *`)
- **CVA Price Sync** - Cada 6 horas (`0 */6 * * *`)
- **CVA Product Discovery** - Diario a las 2 AM (`0 2 * * *`)
- **AI Curation** - Diario a las 3 AM (`0 3 * * *`)

**Gestión de CronJobs:**
```bash
# Ver estado
GET /api/v1/cron/status

# Ejecutar manualmente
POST /api/v1/cron/run/cva_inventory_sync

# Recargar configuración
POST /api/v1/cron/reload
```

Ver documentación: [`docs/CRONJOBS.md`](docs/CRONJOBS.md)

## 🔒 Security Hardening (Nuevo)

Mejoras de seguridad implementadas:

### Backend API
- ✅ JWT con expiración y refresh
- ✅ Role-based access control (admin, editor, user)
- ✅ Rate limiting (PostgreSQL-based, sin Redis)
- ✅ AES-256-GCM encryption para credenciales
- ✅ CORS y Helmet.js security headers
- ✅ Input validation con express-validator

### PrestaShop Module
- ✅ HMAC signature validation
- ✅ CSRF protection
- ✅ IP whitelisting (CIDR y wildcards)
- ✅ Rate limiting por IP
- ✅ Security event logging
- ✅ Encrypted password storage
- ✅ SSRF prevention
- ✅ Input sanitization

Ver documentación: [`docs/SECURITY-HARDENING.md`](docs/SECURITY-HARDENING.md)

## 📚 Documentación Completa

### Guías de Usuario
- [`QUICKSTART.md`](QUICKSTART.md) - Inicio rápido y instalación
- [`docs/API.md`](docs/API.md) - Referencia completa de API
- [`docs/ICECAT-INTEGRATION.md`](docs/ICECAT-INTEGRATION.md) - Integración con Icecat
- [`docs/MAPEO-XML-PROVEEDOR.md`](docs/MAPEO-XML-PROVEEDOR.md) - Importación XML proveedores
- [`docs/GUIA-USO-XML-PROVEEDOR.md`](docs/GUIA-USO-XML-PROVEEDOR.md) - Guía de uso XML

### Nuevas Funcionalidades
- [`docs/CRONJOBS.md`](docs/CRONJOBS.md) - Sistema de tareas programadas
- [`docs/PRESTASHOP-CVA-SYNC.md`](docs/PRESTASHOP-CVA-SYNC.md) - CVA Direct Sync
- [`docs/SECURITY-HARDENING.md`](docs/SECURITY-HARDENING.md) - Hardening de seguridad

### Planning
- [`docs/PLAN-NUEVAS-FUNCIONALIDADES.md`](docs/PLAN-NUEVAS-FUNCIONALIDADES.md) - Roadmap y features

## API Endpoints (Completo)

### CVA API
- `POST /api/v1/cva/config` - Configurar credenciales CVA
- `GET /api/v1/cva/config` - Obtener configuración
- `POST /api/v1/cva/sync/full` - Sincronización completa
- `POST /api/v1/cva/sync/inventory` - Solo inventario
- `POST /api/v1/cva/sync/prices` - Solo precios
- `POST /api/v1/cva/discover` - Descubrir nuevos productos
- `GET /api/v1/cva/stats` - Estadísticas
- `POST /api/v1/cva/test` - Test de conexión

### AI Curation
- `POST /api/v1/ai/config` - Configurar AI provider
- `POST /api/v1/ai/curate/:productId` - Curar producto
- `POST /api/v1/ai/curate/bulk` - Curación masiva
- `POST /api/v1/ai/approve/:contentId` - Aprobar contenido IA
- `POST /api/v1/ai/reject/:contentId` - Rechazar contenido IA
- `GET /api/v1/ai/pending-approval` - Obtener pendientes
- `GET /api/v1/ai/stats` - Estadísticas de uso

### CronJobs (Admin only)
- `GET /api/v1/cron/status` - Estado de todos los jobs
- `POST /api/v1/cron/reload` - Recargar configuración
- `POST /api/v1/cron/run/:jobName` - Ejecutar manualmente
- `POST /api/v1/cron/stop/:jobName` - Detener job
- `POST /api/v1/cron/start/:jobName` - Iniciar job
- `POST /api/v1/cron/stop-all` - Detener todos

## Configuración

### Variables de Entorno (.env)

```bash
# Server
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atlas_pim
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-key-change-me
JWT_EXPIRES_IN=7d

# Encryption (for sensitive credentials)
ENCRYPTION_KEY=your-256-bit-encryption-key

# CVA API
CVA_API_URL=https://apicvaservices.grupocva.com

# AI Providers (optional)
ANTHROPIC_API_KEY=your-claude-api-key
LM_STUDIO_URL=http://localhost:1234

# CronJobs
ENABLE_CRON_JOBS=true
CRON_TIMEZONE=America/Mexico_City

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=https://your-frontend.com,https://prestashop.com
```

Ver archivo `.env.example` para referencia completa.

## Deployment

### Docker (Recomendado)

```bash
# Levantar todo el stack
docker-compose up -d

# Ver logs
docker-compose logs -f backend

# Ejecutar migraciones
docker-compose exec backend npm run migrate
```

### PM2 (Producción)

```bash
cd backend
npm run build
pm2 start dist/index.js --name atlas-pim
pm2 startup
pm2 save
```

## Stack Tecnológico

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js + TypeScript
- **Database:** PostgreSQL 14+
- **Authentication:** JWT
- **Image Processing:** Sharp
- **Cron:** node-cron
- **AI:** @anthropic-ai/sdk
- **Security:** Helmet, bcrypt, AES-256-GCM

### PrestaShop Module
- **Version:** PrestaShop 9.0+
- **Language:** PHP 8.0+
- **Security:** AES-256-GCM, HMAC-SHA256
- **API Client:** cURL

## Licencia

MIT
