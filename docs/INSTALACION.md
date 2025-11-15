# Guía de Instalación - ATLAS PIM

Esta guía te ayudará a instalar y configurar ATLAS PIM en tu servidor.

## Requisitos del Sistema

### Backend API

- **Node.js**: v18.0.0 o superior
- **PostgreSQL**: v14.0 o superior
- **Sistema Operativo**: Linux, macOS o Windows
- **RAM**: Mínimo 2GB (recomendado 4GB)
- **Espacio en Disco**: Mínimo 5GB para aplicación e imágenes

### Prestashop Module

- **PrestaShop**: v9.0.0 o superior
- **PHP**: v7.4 o superior
- **Extensión cURL**: Habilitada
- **Permisos**: Escritura en directorios de módulos e imágenes

## Instalación del Backend

### Opción 1: Instalación Manual

#### 1. Clonar el Repositorio

```bash
git clone https://github.com/your-org/ATLAS-PIM.git
cd ATLAS-PIM/backend
```

#### 2. Instalar Dependencias

```bash
npm install
```

#### 3. Configurar Base de Datos

Crear base de datos PostgreSQL:

```bash
# Conectar a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE atlas_pim;

# Crear usuario (opcional)
CREATE USER atlas_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE atlas_pim TO atlas_user;

\q
```

#### 4. Ejecutar Schema SQL

```bash
psql -U postgres -d atlas_pim -f src/config/schema.sql
```

#### 5. Configurar Variables de Entorno

```bash
cp .env.example .env
```

Editar `.env` con tus valores:

```env
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atlas_pim
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Image
IMAGE_QUALITY=80
IMAGE_MAX_WIDTH=2000
IMAGE_MAX_HEIGHT=2000
THUMBNAIL_WIDTH=300
THUMBNAIL_HEIGHT=300
```

#### 6. Compilar TypeScript

```bash
npm run build
```

#### 7. Iniciar el Servidor

**Desarrollo:**
```bash
npm run dev
```

**Producción:**
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Opción 2: Instalación con Docker

#### 1. Prerrequisitos

Instalar Docker y Docker Compose:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose

# macOS
brew install docker docker-compose
```

#### 2. Construir y Ejecutar

```bash
cd ATLAS-PIM
docker-compose up -d
```

Esto iniciará:
- API Backend en puerto 3000
- PostgreSQL en puerto 5432
- Volúmenes persistentes para datos e imágenes

#### 3. Verificar Instalación

```bash
docker-compose ps
docker-compose logs -f api
```

Acceder a: `http://localhost:3000`

## Instalación del Módulo Prestashop

### 1. Preparar el Módulo

```bash
cd ATLAS-PIM/prestashop-module
zip -r atlaspim.zip atlaspim/
```

### 2. Subir a PrestaShop

**Opción A: Panel de Administración**

1. Acceder al panel de administración de PrestaShop
2. Ir a **Módulos** > **Module Manager**
3. Clic en **Subir un módulo**
4. Seleccionar `atlaspim.zip`
5. Esperar a que se instale
6. Clic en **Configurar**

**Opción B: Instalación Manual**

1. Descomprimir el archivo
2. Copiar carpeta `atlaspim` a `/modules/` de PrestaShop
3. Ir a **Módulos** > **Module Manager**
4. Buscar "ATLAS PIM Connector"
5. Clic en **Instalar**

### 3. Configurar el Módulo

1. Ir a configuración del módulo
2. Introducir:
   - **API URL**: `http://tu-servidor:3000/api/v1`
   - **API Token**: (obtener del backend)
3. Configurar sincronización automática (opcional)
4. Guardar configuración

## Configuración Inicial

### 1. Crear Usuario Administrador

Usar la API para crear el primer usuario:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tuempresa.com",
    "password": "SecurePassword123",
    "full_name": "Admin User"
  }'
```

Guardar el token JWT recibido.

### 2. Actualizar Rol a Admin

Conectar a la base de datos y actualizar el rol:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@tuempresa.com';
```

### 3. Probar la API

```bash
# Obtener perfil
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# Listar productos
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Configuración de Producción

### 1. Variables de Entorno

Asegúrate de configurar:

```env
NODE_ENV=production
JWT_SECRET=generate-a-strong-random-secret
DB_PASSWORD=use-a-strong-password
```

### 2. Proxy Reverso (Nginx)

Configurar Nginx como proxy:

```nginx
server {
    listen 80;
    server_name api.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /uploads {
        alias /path/to/ATLAS-PIM/backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. SSL/HTTPS

Configurar certificado SSL con Let's Encrypt:

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.tudominio.com
```

### 4. Process Manager (PM2)

Usar PM2 para mantener la aplicación ejecutándose:

```bash
npm install -g pm2

# Iniciar aplicación
pm2 start dist/index.js --name atlas-pim

# Configurar auto-inicio
pm2 startup
pm2 save
```

### 5. Monitoreo

```bash
# Ver logs
pm2 logs atlas-pim

# Ver estado
pm2 status

# Reiniciar
pm2 restart atlas-pim
```

## Backup

### Base de Datos

```bash
# Backup
pg_dump -U postgres atlas_pim > backup_$(date +%Y%m%d).sql

# Restaurar
psql -U postgres atlas_pim < backup_20240115.sql
```

### Imágenes

```bash
# Backup
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz backend/uploads/

# Restaurar
tar -xzf uploads_backup_20240115.tar.gz -C backend/
```

## Actualización

### Backend

```bash
cd ATLAS-PIM/backend
git pull origin main
npm install
npm run build
pm2 restart atlas-pim
```

### Módulo Prestashop

1. Descargar nueva versión
2. Ir a **Módulos** > **Module Manager**
3. Buscar "ATLAS PIM Connector"
4. Clic en **Actualizar**

## Solución de Problemas

### El servidor no inicia

1. Verificar logs: `pm2 logs` o `docker-compose logs`
2. Verificar conexión a base de datos
3. Verificar permisos de archivos
4. Verificar puerto 3000 disponible

### Error de conexión a base de datos

1. Verificar PostgreSQL ejecutándose: `sudo systemctl status postgresql`
2. Verificar credenciales en `.env`
3. Verificar firewall permite conexión
4. Probar conexión manual: `psql -U postgres -h localhost`

### Imágenes no se suben

1. Verificar permisos carpeta `uploads/`: `chmod -R 755 uploads/`
2. Verificar espacio en disco: `df -h`
3. Verificar límite de tamaño en `MAX_FILE_SIZE`

### Módulo Prestashop no sincroniza

1. Verificar URL API accesible desde servidor Prestashop
2. Verificar token JWT válido y no expirado
3. Revisar logs de Prestashop en `var/logs/`
4. Probar endpoint manualmente con cURL

## Soporte

Para ayuda adicional:

- **Documentación API**: `/docs/API.md`
- **Email**: support@atlaspim.com
- **GitHub Issues**: https://github.com/your-org/ATLAS-PIM/issues

## Recursos Adicionales

- [Documentación PostgreSQL](https://www.postgresql.org/docs/)
- [Documentación Node.js](https://nodejs.org/docs/)
- [Documentación PrestaShop](https://devdocs.prestashop.com/)
- [Guía PM2](https://pm2.keymetrics.io/docs/)
