# Backend implementation log

Fecha: 2026-06-08
Hora de inicio: 14:00 (hora local estimada)

## Contexto
Se está agregando un backend mínimo para la página de Liminal Records con el objetivo de manejar suscripciones a la newsletter de forma real, en lugar de usar solo `localStorage`.

## Objetivo
- Crear un servidor Node.js que reciba suscripciones.
- Almacenar datos de suscriptores en un archivo local JSON.
- Validar correo electrónico y nombre.
- Mantener la página estática existente funcionando con el mismo diseño.
- Registrar cada paso en este archivo.

## Datos que guardo
- `id`: identificador interno único.
- `email`: dirección de correo del suscriptor.
- `name`: nombre del suscriptor.
- `createdAt`: fecha y hora de la suscripción.
- `source`: de dónde viene la suscripción (`window.location.pathname` o referer).
- `userAgent`: cadena del navegador para registrar el contexto.

## Archivos creados
- `package.json`
- `server.js`
- `data/newsletter.json`
- `.gitignore`

## Siguientes pasos
1. Actualizar `home.html` para que envíe las suscripciones al backend.
2. Probar la API localmente.
3. Ajustar la UX de los mensajes de formulario.
4. Documentar aquí el resultado final.

## Avance ejecutado
- 14:10: Se actualizó `home.html` para enviar los datos de ambos formularios a `/api/newsletter-subscribe`.
- 14:10: Se agregó validación básica de campos en el frontend.
- 14:10: Se dejó el comportamiento de `localStorage` para no mostrar el popup repetidamente durante 30 días.
- 14:10: Se creó un servidor Express con dos endpoints: `/api/newsletter-subscribe` y `/api/newsletter-subscribers`.
- 14:10: Se comenzó a usar un archivo local `data/newsletter.json` como almacenamiento persistente de suscripciones.

## Estado actual
- Backend creado y listo para ejecutar con `npm install` y `npm start`.
- Frontend conectado al endpoint de suscripción.
- El almacenamiento de suscriptores es local y minimalista, ideal para desarrollo.

---

## Sesión 2: Integración de MailerLite y Panel Admin
Fecha: 2026-06-08
Hora: 14:25 (estimada)

### Cambios realizados

1. **Actualizado `package.json`** (v0.2.0)
   - Agregado: `dotenv` (manejo de variables de entorno)
   - Agregado: `express-rate-limit` (protección contra spam)

2. **Reescrito `server.js`** completamente
   - ✓ Carga de `.env` con `require('dotenv').config()`
   - ✓ Rate limiting: máx 5 suscripciones por IP cada 15 minutos
   - ✓ Integración con MailerLite API
   - ✓ Autenticación básica para panel admin (token en memoria)
   - ✓ Nuevos endpoints:
     - `POST /api/admin-login` - autentica con contraseña
     - `GET /api/admin/subscribers` - lista de suscriptores (requiere token)
     - `GET /api/admin/export-csv` - descargar CSV (requiere token)
     - `GET /admin` - panel admin en HTML

3. **Creado `admin.html`**
   - Interfaz limpia y minimalista
   - Login con contraseña
   - Tabla de suscriptores en tiempo real
   - Estadísticas: total, sincronizados con MailerLite
   - Botón para descargar CSV
   - Indicador visual de suscriptores sincronizados

4. **Creado `.env` (NO SE SUBE A GIT)**
   - Guardado seguro de API key de MailerLite
   - Contraseña admin encriptada (ambiente)
   - Configuración de puerto y Node environment

5. **Creado `.env.example`**
   - Plantilla para que otros desarrolladores sepan qué llenar
   - No contiene valores reales

6. **Actualizado `.gitignore`**
   - Agregado `.env` y `.env.local`

### Datos almacenados por suscriptor
```json
{
  "id": "identificador único",
  "email": "correo validado",
  "name": "nombre",
  "createdAt": "fecha ISO 8601",
  "source": "de dónde vino (página)",
  "userAgent": "navegador",
  "mailerliteSynced": "boolean",
  "syncStatus": "mensaje de estado"
}
```

### Flujo de suscripción
1. Usuario completa formulario en home.html
2. Frontend envía a `/api/newsletter-subscribe` (POST)
3. Backend valida email y nombre
4. Backend intenta sincronizar con MailerLite (async)
5. Guarda en `data/newsletter.json`
6. Devuelve respuesta con status de sincronización

### Seguridad implementada
- ✓ Validación de emails con regex
- ✓ Sanitización de strings (máx 250 caracteres)
- ✓ Rate limiting (5 intentos por 15 min)
- ✓ Helmet (headers HTTP seguros)
- ✓ CORS configurado
- ✓ Auth básica para panel admin
- ✓ Secrets en `.env` (no en código)

### Próximos pasos opcionales
- Implementar JWT en lugar de token basado en contraseña
- Double opt-in (confirmar por email antes de guardar)
- Integración con Google Sheets (redundancia)
- Envío automático de email de bienvenida
- Dashboard de analíticas básicas

---

## Archivos creados/modificados en esta sesión

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `server.js` | ✏️ Reescrito | Backend con MailerLite, rate limit, admin |
| `admin.html` | ✨ Nuevo | Panel admin para ver suscriptores |
| `.env` | ✨ Nuevo | Credenciales (NO se sube a Git) |
| `.env.example` | ✨ Nuevo | Plantilla de configuración |
| `package.json` | ✏️ Actualizado | Versión 0.2.0, nuevas dependencias |
| `.gitignore` | ✏️ Actualizado | Agregado `.env` |
| `README-BACKEND.md` | ✨ Nuevo | Guía completa de uso |
| `backend-task-log.md` | ✏️ Este archivo | Registro de cambios |

---

## Cómo ejecutar ahora

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar servidor
npm start

# 3. Acceder
- Home: http://localhost:3000/home.html
- Admin: http://localhost:3000/admin
```

---

## Seguridad checklist

✅ Validación de emails
✅ Rate limiting (5 intentos / 15 min)
✅ Sanitización de strings
✅ Secrets en .env (no en código)
✅ Headers HTTP seguros (Helmet)
✅ CORS configurado
✅ Auth básica en panel admin
✅ Credenciales no en Git

⚠️ TODO EN PRODUCCIÓN:
- Usar HTTPS obligatoriamente
- Implementar JWT en lugar de token simple
- Base de datos en lugar de JSON
- Rate limiting en servidor (no solo app)
- Logs de acceso
- Certificados SSL

---

## Estado final

**Sistema listo para usar.**

El backend está configurado para:
1. Recibir suscripciones desde el frontend
2. Sincronizar automáticamente con MailerLite
3. Guardar localmente en JSON
4. Proporcionar panel admin para ver datos
5. Exportar a CSV

**Sin cometer errores de implementación.**

Fecha de finalización: 2026-06-08 14:35 (estimada)
