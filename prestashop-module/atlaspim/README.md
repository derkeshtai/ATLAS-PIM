# ATLAS PIM Connector for PrestaShop 9.0

Módulo oficial de ATLAS PIM para PrestaShop 9.0 que permite sincronizar productos enriquecidos desde tu sistema PIM.

## Características

- ✅ Sincronización automática de productos
- ✅ Sincronización manual bajo demanda
- ✅ Actualización de productos existentes
- ✅ Importación de imágenes optimizadas
- ✅ Configuración sencilla desde el panel de administración
- ✅ Soporte para datos SEO enriquecidos
- ✅ Sincronización de stock y precios

## Instalación

### Método 1: Instalación Manual

1. Descarga el módulo completo
2. Copia la carpeta `atlaspim` a `/modules/` de tu instalación de PrestaShop
3. Ve a **Módulos** > **Module Manager** en el panel de administración
4. Busca "ATLAS PIM Connector"
5. Haz clic en **Instalar**

### Método 2: Subir ZIP

1. Comprime la carpeta `atlaspim` en un archivo ZIP
2. Ve a **Módulos** > **Module Manager** en el panel de administración
3. Haz clic en **Subir un módulo**
4. Selecciona el archivo ZIP
5. El módulo se instalará automáticamente

## Configuración

1. Ve a **Módulos** > **Module Manager**
2. Busca "ATLAS PIM Connector" y haz clic en **Configurar**
3. Introduce los siguientes datos:
   - **API URL**: La URL de tu API de ATLAS PIM (ej: `https://tu-dominio.com/api/v1`)
   - **API Token**: Tu token de autenticación JWT
   - **Auto Sync**: Activa para sincronización automática
   - **Sync Interval**: Intervalo de sincronización en segundos (por defecto: 3600 = 1 hora)

4. Haz clic en **Guardar**

## Uso

### Sincronización Manual

1. Ve a la página de configuración del módulo
2. En la sección "Sync Status", haz clic en **Sync Now**
3. El módulo importará todos los productos activos desde ATLAS PIM

### Sincronización Automática

Si activas "Auto Sync", el módulo sincronizará automáticamente los productos según el intervalo configurado.

## Datos Sincronizados

El módulo sincroniza la siguiente información:

- **Datos básicos**: SKU, nombre, descripciones
- **Precios**: Precio de venta, precio mayorista, ofertas
- **Stock**: Cantidad disponible
- **Imágenes**: Imágenes optimizadas del PIM
- **SEO**: Meta title, meta description, keywords
- **Dimensiones**: Peso, ancho, alto, profundidad
- **Estado**: Activo/Inactivo

## Requisitos

- PrestaShop 9.0 o superior
- PHP 7.4 o superior
- Extensión cURL habilitada
- Acceso a API de ATLAS PIM
- Token de autenticación válido

## Solución de Problemas

### Los productos no se sincronizan

1. Verifica que la URL de API y el token sean correctos
2. Asegúrate de que la API de ATLAS PIM esté accesible desde tu servidor
3. Revisa los logs de PrestaShop en `var/logs/`

### Las imágenes no se importan

1. Verifica los permisos de la carpeta `img/p/`
2. Asegúrate de que las URLs de imágenes sean accesibles
3. Verifica que el servidor tenga suficiente espacio en disco

### Error de autenticación

1. Verifica que el token JWT sea válido
2. Asegúrate de que el token no haya expirado
3. Regenera el token desde el panel de ATLAS PIM

## Soporte

Para soporte técnico o reportar problemas:
- Email: support@atlaspim.com
- GitHub: https://github.com/atlaspim/prestashop-connector

## Licencia

MIT License - Ver archivo LICENSE para más detalles.
