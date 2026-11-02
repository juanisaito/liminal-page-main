# Liminal Records - Backend Setup Guide

## Instalación y ejecución

### 1. Instalar dependencias
```bash
npm install
```

### 2. Verificar configuración `.env`
Asegurate que el archivo `.env` tenga:
- `MAILERLITE_API_KEY` - tu API key de MailerLite
- `ADMIN_PASSWORD` - contraseña para el panel admin

Ver `.env.example` para la estructura.

### 3. Ejecutar el servidor
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

---

## URLs principales

| URL | Descripción | Auth |
|-----|-------------|------|
| `http://localhost:3000/home.html` | Página principal con formulario | No |
| `http://localhost:3000/admin` | Panel de administración | Sí (contraseña) |
| `/api/newsletter-subscribe` | Endpoint para suscribirse | No |
| `/api/admin/subscribers` | Listado JSON de suscriptores | Sí (token) |
| `/api/admin/export-csv` | Descargar CSV de suscriptores | Sí (token) |
| `/api/health` | Health check | No |

---

## Panel Admin (`/admin`)

1. Entra a `http://localhost:3000/admin`
2. Ingresa la contraseña (la que configuraste en `.env`)
3. Verás:
   - Número total de suscriptores
   - Cuántos fueron sincronizados con MailerLite
   - Lista completa de emails, nombres y fechas
   - Botón para descargar como CSV

---

## ¿Qué hace el backend?

### Flujo de suscripción
1. El usuario completa el formulario en `home.html`
2. Se valida el email y nombre
3. Se intenta sincronizar con MailerLite (si API key está configurada)
4. Se guarda localmente en `data/newsletter.json`
5. Se muestra un mensaje de éxito o error

### Rate Limiting
- Máximo 5 intentos de suscripción por IP cada 15 minutos
- Protege contra spam y ataques

### Seguridad
- Validación de emails con regex
- Sanitización de strings (máx 250 caracteres)
- Headers HTTP seguros con Helmet
- CORS habilitado para desarrollo
- Secrets en `.env` (no en código)

---

## Variables de entorno (`.env`)

```env
MAILERLITE_API_KEY=tu_api_key_aqui
ADMIN_PASSWORD=tu_contraseña_admin
PORT=3000
NODE_ENV=development
```

---

## Datos almacenados por suscriptor

Cada suscripción guarda:
- `id` - identificador único
- `email` - validado
- `name` - nombre completo
- `createdAt` - fecha ISO 8601
- `source` - de dónde vino (página)
- `userAgent` - navegador/device
- `mailerliteSynced` - si se sincronizó correctamente
- `syncStatus` - mensaje de estado (éxito o error)

---

## Troubleshooting

### "Error: Cannot find module 'express'"
```bash
npm install
```

### "MailerLite: ✗ Not configured"
Configura `MAILERLITE_API_KEY` en `.env`. Sin ella, el sistema funciona solo local.

### "Acceso denegado" en admin
Verifica que ingresaste la contraseña correcta. Es case-sensitive.

### Los suscriptores no se guardan
- Verifica que `npm start` esté corriendo
- Revisa la consola para ver errores
- Asegurate que `data/` existe

---

## Evento THIS IS TOBBA

- Página pública: `/eventos/this-is-tobba.html`
- Control de acceso: `/eventos/checkin.html` (usa la contraseña del panel admin)
- Cada correo puede reservar hasta 2 entradas; el cupo global es de 100 entradas. La disponibilidad solo se muestra en el panel de acceso.
- Cada asistente recibe un QR individual y cada código se puede validar una sola vez.
- Las entradas se guardan aparte del newsletter en `data/event-tickets.json`; las solicitudes sin verificar se guardan temporalmente en `data/event-pending.json`.
- Nombre, correo y ciudad son obligatorios. La fecha de nacimiento es opcional; el backend calcula la edad para la fecha del evento. Para sacar la entrada, el asistente debe aceptar recibir novedades de Liminal Records.
- La reserva se registra al enviar el formulario: el backend emite las entradas y los QR, intenta agregar el contacto al grupo configurado de MailerLite y envía el correo final con Resend. No se envía un correo previo de verificación.

### Envío de entradas

El backend envía el enlace de verificación y las entradas mediante Resend. Para habilitarlo, configurar en `.env`:

```env
RESEND_API_KEY=re_tu_api_key
RESEND_FROM=Liminal Records <entradas@tudominio.com>
PUBLIC_URL=https://tu-dominio.com
```

El dominio del remitente debe estar habilitado en Resend. `PUBLIC_URL` debe ser la URL pública final de la web. El API key y el ID del grupo de MailerLite deben estar configurados para sincronizar el correo con el grupo del newsletter. Sin Resend o MailerLite, la solicitud no se confirma ni se emiten entradas.

Los QR se generan con la API de goQR.me y contienen solamente el token aleatorio de la entrada. El lector de cámara se sirve desde la dependencia local `html5-qrcode`; también se puede ingresar el código manualmente.

### Operación el día del evento

1. Abrir `/eventos/checkin.html` en un teléfono con cámara y conexión segura HTTPS.
2. Ingresar la contraseña de administración.
3. Permitir el acceso a la cámara y escanear cada QR. Si la cámara no funciona, ingresar el código manualmente.
4. El panel muestra reservas, ingresos realizados y entradas pendientes.

---

## Próximos pasos

- [ ] Implementar JWT para auth más robusta
- [ ] Double opt-in (confirmar por email)
- [ ] Integración con Google Sheets (redundancia)
- [ ] Email de bienvenida automático
- [ ] Dashboard de analíticas
