# ATLAS-PIM - Product Information Management System

Sistema PIM (Product Information Management) diseñado para enriquecer y estandarizar información de productos para e-commerce.

## Características

- 🎯 **Gestión centralizada** de información de productos
- 📸 **Optimización automática** de imágenes
- 🔄 **Importación masiva** desde CSV/Excel de proveedores
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

### Exportación
- `GET /api/export/prestashop` - Exportar a formato Prestashop

### Imágenes
- `POST /api/images/upload` - Subir imagen
- `POST /api/images/optimize` - Optimizar imágenes

## Configuración

Ver archivo `.env.example` para variables de entorno requeridas.

## Licencia

MIT
