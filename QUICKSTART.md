# ATLAS PIM - Guía de Inicio Rápido

Pon en marcha tu sistema PIM en menos de 5 minutos.

## 🚀 Inicio Rápido con Docker

### Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/your-org/ATLAS-PIM.git
cd ATLAS-PIM
```

### Paso 2: Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita `.env` y cambia al menos estos valores:

```env
DB_PASSWORD=tu_password_seguro
JWT_SECRET=genera_un_secret_muy_seguro_aqui
```

### Paso 3: Iniciar con Docker Compose

```bash
docker-compose up -d
```

Esto iniciará:
- ✅ PostgreSQL (puerto 5432)
- ✅ API Backend (puerto 3000)
- ✅ Volúmenes persistentes para datos

### Paso 4: Verificar que Todo Funciona

```bash
# Ver estado de los servicios
docker-compose ps

# Ver logs
docker-compose logs -f api

# Probar el endpoint de salud
curl http://localhost:3000/health
```

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "uptime": 123.456
}
```

### Paso 5: Crear Tu Primer Usuario

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tuempresa.com",
    "password": "SecurePassword123",
    "full_name": "Admin User"
  }'
```

Guarda el token JWT que recibes.

### Paso 6: Hacer Admin al Usuario

```bash
# Conectar a PostgreSQL
docker-compose exec postgres psql -U postgres -d atlas_pim

# Ejecutar en psql:
UPDATE users SET role = 'admin' WHERE email = 'admin@tuempresa.com';
\q
```

### Paso 7: Probar la API

```bash
# Reemplaza YOUR_TOKEN con el token que recibiste
export TOKEN="tu_token_jwt_aqui"

# Obtener perfil
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Crear un producto de prueba
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "TEST-001",
    "name": "Producto de Prueba",
    "short_description": "Mi primer producto en ATLAS PIM",
    "price": 99.99,
    "stock_quantity": 10
  }'

# Listar productos
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $TOKEN"
```

## ✅ ¡Listo!

Tu sistema PIM está funcionando. Ahora puedes:

1. **Explorar la API**: Ver `docs/API.md`
2. **Importar productos**: Usar endpoints de importación CSV/Excel
3. **Instalar módulo Prestashop**: Ver `prestashop-module/atlaspim/README.md`
4. **Personalizar configuración**: Editar `.env` según tus necesidades

## 📋 Comandos Útiles

### Docker Compose

```bash
# Iniciar servicios
docker-compose up -d

# Detener servicios
docker-compose down

# Ver logs
docker-compose logs -f

# Ver logs solo de API
docker-compose logs -f api

# Reiniciar API
docker-compose restart api

# Reconstruir y reiniciar
docker-compose up -d --build

# Detener y eliminar todo (incluyendo volúmenes)
docker-compose down -v
```

### Base de Datos

```bash
# Conectar a PostgreSQL
docker-compose exec postgres psql -U postgres -d atlas_pim

# Backup de base de datos
docker-compose exec postgres pg_dump -U postgres atlas_pim > backup.sql

# Restaurar backup
docker-compose exec -T postgres psql -U postgres atlas_pim < backup.sql
```

### Logs y Debug

```bash
# Ver todos los logs
docker-compose logs -f

# Ver últimas 100 líneas
docker-compose logs --tail=100 api

# Ver logs con timestamps
docker-compose logs -ft api
```

## 🛠️ Instalación sin Docker

Si prefieres instalación manual:

### Paso 1: Instalar Dependencias del Sistema

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nodejs npm postgresql-14

# macOS
brew install node postgresql@14
```

### Paso 2: Configurar PostgreSQL

```bash
# Iniciar PostgreSQL
sudo systemctl start postgresql

# Crear base de datos
sudo -u postgres psql
CREATE DATABASE atlas_pim;
CREATE USER atlas_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE atlas_pim TO atlas_user;
\q
```

### Paso 3: Instalar y Configurar Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus valores

# Ejecutar schema
psql -U postgres -d atlas_pim -f src/config/schema.sql

# Compilar
npm run build

# Iniciar
npm start
```

## 📊 Importar Datos de Ejemplo

### Crear CSV de ejemplo

Crea un archivo `productos.csv`:

```csv
sku,name,description,price,stock
PROD-001,Laptop Dell XPS 15,Laptop profesional de alto rendimiento,1299.99,5
PROD-002,iPhone 14 Pro,Smartphone Apple última generación,1099.99,10
PROD-003,Sony WH-1000XM5,Auriculares con cancelación de ruido,349.99,15
```

### Importar vía API

```bash
curl -X POST http://localhost:3000/api/v1/import/csv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@productos.csv"
```

## 🔧 Configuración de Prestashop

### Paso 1: Instalar Módulo

```bash
cd prestashop-module
zip -r atlaspim.zip atlaspim/
```

Subir `atlaspim.zip` a PrestaShop:
1. Panel Admin → Módulos → Module Manager
2. Subir un módulo → Seleccionar ZIP
3. Instalar

### Paso 2: Configurar

1. Buscar "ATLAS PIM Connector"
2. Configurar:
   - **API URL**: `http://tu-servidor:3000/api/v1`
   - **API Token**: Tu token JWT
3. Guardar

### Paso 3: Sincronizar

Clic en "Sync Now" para importar productos a PrestaShop.

## 🆘 Problemas Comunes

### El servidor no inicia

```bash
# Ver logs detallados
docker-compose logs api

# Verificar que PostgreSQL está funcionando
docker-compose ps postgres

# Reiniciar todo
docker-compose restart
```

### Error de conexión a base de datos

```bash
# Verificar que la DB está corriendo
docker-compose exec postgres psql -U postgres -c "SELECT 1"

# Verificar configuración en .env
cat .env | grep DB_
```

### Puerto 3000 ya en uso

Editar `.env`:
```env
PORT=3001
```

Y reiniciar:
```bash
docker-compose down
docker-compose up -d
```

## 📚 Próximos Pasos

1. **Leer la documentación completa**: `docs/API.md`
2. **Configurar producción**: `docs/INSTALACION.md`
3. **Explorar ejemplos de uso**: Probar diferentes endpoints
4. **Configurar backup automático**: Scripts en `docs/INSTALACION.md`

## 💬 Soporte

- **Documentación**: Ver carpeta `/docs`
- **Issues**: GitHub Issues
- **Email**: support@atlaspim.com

---

¡Bienvenido a ATLAS PIM! 🎉
