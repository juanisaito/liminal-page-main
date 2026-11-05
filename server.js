require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

// Inicialización de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const NEWSLETTER_FILE = path.join(DATA_DIR, 'newsletter.json');
const USERS_FILE = path.join(__dirname, 'admin-users.json');

const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const MAILERLITE_GROUP_ID = process.env.MAILERLITE_GROUP_ID;
const MAILERLITE_API_URL = 'https://connect.mailerlite.com/api/subscribers';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const EVENT_CAPACITY = 100;
const MAX_TICKETS_PER_EMAIL = 2;
const EVENT_DATE = new Date('2026-11-25T00:00:00.000Z');

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos de suscripción. Intenta más tarde.',
  skip: (req) => req.path === '/api/health'
});

const eventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos. Probá de nuevo más tarde.' }
});

function ensureDataStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(DATA_DIR, 0o700);
  if (!fs.existsSync(NEWSLETTER_FILE)) {
    fs.writeFileSync(NEWSLETTER_FILE, '[]', { encoding: 'utf-8', mode: 0o600 });
  } else {
    fs.chmodSync(NEWSLETTER_FILE, 0o600);
  }
}

function loadSubscribers() {
  ensureDataStore();
  const raw = fs.readFileSync(NEWSLETTER_FILE, 'utf-8');
  return JSON.parse(raw || '[]');
}

function saveSubscribers(subscribers) {
  ensureDataStore();
  fs.writeFileSync(NEWSLETTER_FILE, JSON.stringify(subscribers, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

// FUNCIONES SUPABASE PARA ENTRADAS
async function getTicketsCountByEmail(email) {
  const { count, error } = await supabase
    .from('event_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('email', email.toLowerCase().trim());
  if (error) throw error;
  return count || 0;
}

async function getTotalTicketsCount() {
  const { count, error } = await supabase
    .from('event_tickets')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function saveTicketsToSupabase(tickets) {
  const ticketsToInsert = tickets.map(t => ({
    id: t.id,
    reservation_id: t.reservationId,
    token: t.token,
    code: t.code,
    name: t.name,
    email: t.email,
    city: t.city,
    age: t.age,
    created_at: t.createdAt,
    checked_in_at: t.checkedInAt,
    checked_in_by: t.checkedInBy,
    guest: t.guest,
    newsletter_consent_at: t.newsletterConsentAt
  }));

  const { data, error } = await supabase
    .from('event_tickets')
    .insert(ticketsToInsert);
  if (error) throw error;
  return data;
}

function createUniqueTicketCode(existingCodes) {
  let code;
  do {
    code = crypto.randomBytes(4).toString('hex').toUpperCase();
  } while (existingCodes.has(code));
  existingCodes.add(code);
  return code;
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

function calculateAgeOnEvent(birthDateString) {
  if (!birthDateString) return { age: null, valid: true };
  if (typeof birthDateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateString)) return { age: null, valid: false };
  const birthDate = new Date(`${birthDateString}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== birthDateString || birthDate > EVENT_DATE) {
    return { age: null, valid: false };
  }
  let age = EVENT_DATE.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthday = EVENT_DATE.getUTCMonth() > birthDate.getUTCMonth()
    || (EVENT_DATE.getUTCMonth() === birthDate.getUTCMonth() && EVENT_DATE.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthday) age -= 1;
  return { age, valid: age >= 0 && age <= 120 };
}

function sanitizeString(value, maxLength = 250) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

async function sendEventConfirmation(email, tickets) {
  if (!resend || !RESEND_FROM) {
    console.error('Event confirmation email is not configured: set RESEND_API_KEY and RESEND_FROM.');
    return false;
  }

  try {
    let html = fs.readFileSync(path.join(__dirname, 'email-plantilla.html'), 'utf-8');
    const attachments = [];
    const replacements = {
      '{{nombre_1}}': escapeHtml(tickets[0]?.name),
      '{{codigo_qr_1}}': escapeHtml(tickets[0]?.code),
      '{{nombre_2}}': escapeHtml(tickets[1]?.name || ''),
      '{{codigo_qr_2}}': escapeHtml(tickets[1]?.code || ''),
      '{{estilo_entrada_2}}': tickets.length > 1 ? '' : 'display:none;'
    };

    for (const [index, ticket] of tickets.entries()) {
      const contentId = `entrada-${index + 1}-qr`;
      const qrImage = await QRCode.toBuffer(ticket.token, {
        type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 320
      });
      attachments.push({
        filename: `entrada-${ticket.code}.png`,
        content: qrImage,
        contentType: 'image/png',
        contentId
      });
      replacements[`{{src_qr_${index + 1}}}`] = `cid:${contentId}`;
    }

    replacements['{{src_qr_1}}'] ||= '';
    replacements['{{src_qr_2}}'] ||= '';
    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.replaceAll(placeholder, value);
    }

    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [email],
      subject: 'Tus accesos · THIS IS TOBBA LIVE EVENT',
      html,
      attachments
    });
    if (error) {
      console.error('Event confirmation email error:', error.message);
      return false;
    }
    return Boolean(data?.id);
  } catch (error) {
    console.error('Event confirmation email error:', error.message);
    return false;
  }
}

function isValidAdminToken(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [username, password] = decoded.split(':');
    
    if (!username || !password) return false;

    if (!fs.existsSync(USERS_FILE)) return false;
    const rawData = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(rawData);
    const users = data.users || [];

    return users.some(u => u.username === username && u.password === password);
  } catch (err) {
    return false;
  }
}

async function addToMailerLite(email, name) {
  if (!MAILERLITE_API_KEY) return { synced: false, reason: 'MailerLite API key is not configured.' };
  if (!MAILERLITE_GROUP_ID) return { synced: false, reason: 'MailerLite group is not configured.' };

  try {
    const response = await fetch(MAILERLITE_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAILERLITE_API_KEY}`
      },
      body: JSON.stringify({
        email,
        fields: { name },
        status: 'active',
        groups: [MAILERLITE_GROUP_ID],
        opted_in_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
      })
    });

    if (response.ok) {
      return { synced: true };
    } else {
      const errorData = await response.json();
      return { synced: false, reason: errorData.message || 'MailerLite API error' };
    }
  } catch (error) {
    console.error('MailerLite sync error:', error);
    return { synced: false, reason: error.message };
  }
}

app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      connectSrc: ["'self'", 'https://api.resend.com'],
      workerSrc: ["'self'", 'blob:'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  }
}));
app.use(cors());
app.use(express.json());
app.use('/data', (_req, res) => res.sendStatus(404));
app.use(express.static(path.join(__dirname)));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'eventos', 'this-is-tobba.html'));
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// THIS IS TOBBA event registration (Con Supabase)
app.post('/api/event-registration', eventLimiter, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'La base de datos Supabase no está configurada.' });

  const name = sanitizeString(req.body.name, 100);
  const email = sanitizeString(req.body.email, 250).toLowerCase();
  const guestName = sanitizeString(req.body.guestName, 100);
  const city = sanitizeString(req.body.city, 100);
  const birthDate = sanitizeString(req.body.birthDate, 10);
  const { age, valid: validBirthDate } = calculateAgeOnEvent(birthDate);
  const quantity = Number(req.body.quantity);

  if (!validateEmail(email)) return res.status(400).json({ error: 'Ingresá un correo electrónico válido.' });
  if (!name) return res.status(400).json({ error: 'Ingresá tu nombre.' });
  if (!city) return res.status(400).json({ error: 'Ingresá tu ciudad.' });
  if (![1, 2].includes(quantity) || (quantity === 2 && !guestName)) {
    return res.status(400).json({ error: 'Podés reservar una o dos entradas. Para dos, necesitamos el nombre de tu acompañante.' });
  }
  if (!validBirthDate) return res.status(400).json({ error: 'Revisá la fecha de nacimiento o dejala vacía.' });
  if (req.body.privacy !== true) return res.status(400).json({ error: 'Necesitamos tu aceptación para gestionar la entrada.' });
  if (req.body.newsletterConsent !== true) return res.status(400).json({ error: 'Necesitamos tu aceptación para agregarte al newsletter de Liminal Records.' });
  if (!resend || !RESEND_FROM) return res.status(503).json({ error: 'El envío de entradas todavía no está configurado. Probá más tarde.' });

  try {
    const emailTicketCount = await getTicketsCountByEmail(email);
    if (emailTicketCount + quantity > MAX_TICKETS_PER_EMAIL) {
      return res.status(409).json({ error: 'Ya tenés entradas registradas con este correo. Revisá tu casilla o carpeta de spam.' });
    }

    const totalTicketsCount = await getTotalTicketsCount();
    if (totalTicketsCount + quantity > EVENT_CAPACITY) {
      return res.status(409).json({ error: 'No quedan entradas disponibles.' });
    }

    // Obtener códigos existentes para evitar duplicados
    const { data: existingRecords } = await supabase.from('event_tickets').select('code');
    const existingCodes = new Set((existingRecords || []).map(r => r.code));

    const reservationId = crypto.randomUUID();
    const attendees = [{ name, age }];
    if (quantity === 2) attendees.push({ name: guestName, age: null });

    const createdTickets = attendees.map((attendee, attendeeIndex) => ({
      id: crypto.randomUUID(),
      reservationId,
      token: crypto.randomBytes(24).toString('hex'),
      code: createUniqueTicketCode(existingCodes),
      name: attendee.name,
      email,
      city,
      age: attendee.age,
      createdAt: new Date().toISOString(),
      checkedInAt: null,
      checkedInBy: null,
      guest: attendeeIndex > 0,
      newsletterConsentAt: new Date().toISOString()
    }));

    await saveTicketsToSupabase(createdTickets);

    const mailerlite = await addToMailerLite(email, name);
    if (!mailerlite.synced) console.error('MailerLite event opt-in error:', mailerlite.reason);
    const emailSent = await sendEventConfirmation(email, createdTickets);

    return res.status(200).json({
      message: 'Reserva registrada y entradas emitidas.',
      email,
      emailSent,
      mailerliteSynced: mailerlite.synced,
      tickets: createdTickets.map(({ token, code, name: attendeeName }) => ({ token, code, name: attendeeName }))
    });
  } catch (err) {
    console.error('Error al procesar registro en Supabase:', err);
    return res.status(500).json({ error: 'Error interno al guardar la entrada.' });
  }
});

// Admin Panel - Obtener entradas desde Supabase
app.get('/api/admin/event-tickets', async (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado.' });

  try {
    const { data: tickets, error } = await supabase
      .from('event_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const checkedIn = tickets.filter((ticket) => ticket.checked_in_at).length;
    res.json({
      reserved: tickets.length,
      checkedIn,
      remaining: Math.max(0, EVENT_CAPACITY - tickets.length),
      tickets: tickets.map(({ token, id, reservation_id, created_at, checked_in_at, checked_in_by, newsletter_consent_at, ...ticket }) => ({
        ...ticket,
        createdAt: created_at,
        checkedInAt: checked_in_at,
        checkedInBy: checked_in_by,
        newsletterConsentAt: newsletter_consent_at
      }))
    });
  } catch (err) {
    console.error('Error al obtener entradas admin:', err);
    res.status(500).json({ error: 'Error al consultar entradas.' });
  }
});

// Admin Panel - Check-in QR con Supabase
app.post('/api/admin/event-check-in', async (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado.' });

  const scannedValue = sanitizeString(req.body.token, 100);
  if (!scannedValue) return res.status(400).json({ error: 'Falta el código de la entrada.' });

  try {
    const normalizedCode = scannedValue.toUpperCase();
    const { data: tickets, error } = await supabase
      .from('event_tickets')
      .select('*')
      .or(`token.eq.${scannedValue},code.eq.${normalizedCode}`);

    if (error) throw error;

    const ticket = tickets && tickets[0];
    if (!ticket) return res.status(404).json({ error: 'QR no válido para este evento.' });

    if (ticket.checked_in_at) {
      return res.json({ alreadyCheckedIn: true, ticket: { name: ticket.name, code: ticket.code, checkedInAt: ticket.checked_in_at } });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('event_tickets')
      .update({ checked_in_at: now, checked_in_by: 'admin' })
      .eq('id', ticket.id);

    if (updateError) throw updateError;

    res.json({ alreadyCheckedIn: false, ticket: { name: ticket.name, code: ticket.code, checkedInAt: now } });
  } catch (err) {
    console.error('Error en check-in:', err);
    res.status(500).json({ error: 'Error al procesar el check-in.' });
  }
});

// Newsletter Subscription
app.post('/api/newsletter-subscribe', limiter, async (req, res) => {
  const email = sanitizeString(req.body.email).toLowerCase();
  const name = sanitizeString(req.body.name);
  const source = sanitizeString(req.body.source || req.headers.referer || 'unknown');

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  if (!name) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  const subscribers = loadSubscribers();
  const existing = subscribers.find((item) => item.email === email);

  if (existing) {
    return res.status(200).json({ message: 'Este correo ya está suscripto.', subscriber: existing });
  }

  const mailerliteSyncResult = await addToMailerLite(email, name);

  const subscriber = {
    id: `${Date.now()}-${Math.round(Math.random() * 10000)}`,
    email,
    name,
    createdAt: new Date().toISOString(),
    source,
    userAgent: req.get('User-Agent') || 'unknown',
    mailerliteSynced: mailerliteSyncResult.synced,
    syncStatus: mailerliteSyncResult.reason || 'synced'
  };

  subscribers.push(subscriber);
  saveSubscribers(subscribers);

  res.status(201).json({ 
    message: 'Suscripción registrada.', 
    subscriber,
    mailerliteSync: mailerliteSyncResult
  });
});

// Admin Panel - Login
app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
  }

  try {
    if (!fs.existsSync(USERS_FILE)) {
      return res.status(500).json({ error: 'Archivo de usuarios no configurado en el servidor.' });
    }

    const rawData = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(rawData);
    const users = data.users || [];

    const foundUser = users.find(u => u.username === username && u.password === password);

    if (!foundUser) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = Buffer.from(`${foundUser.username}:${foundUser.password}:${Date.now()}`).toString('base64');
    res.json({ token, name: foundUser.name, message: 'Acceso concedido.' });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno al procesar el acceso.' });
  }
});

// Admin Panel - Get Subscribers
app.get('/api/admin/subscribers', (req, res) => {
  if (!isValidAdminToken(req)) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  const subscribers = loadSubscribers();
  res.json({ 
    count: subscribers.length, 
    subscribers,
    mailerliteSyncedCount: subscribers.filter(s => s.mailerliteSynced).length
  });
});

// Admin Panel - Export CSV
app.get('/api/admin/export-csv', (req, res) => {
  if (!isValidAdminToken(req)) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  const subscribers = loadSubscribers();
  const csv = ['Email,Nombre,Fecha,MailerLite Sincronizado\n'];
  subscribers.forEach(s => {
    csv.push(`"${s.email}","${s.name}","${s.createdAt}","${s.mailerliteSynced ? 'Sí' : 'No'}"\n`);
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="liminal-suscriptores.csv"');
  res.send(csv.join(''));
});

// Serve admin panel HTML
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`🎵 Liminal backend running on http://${HOST}:${PORT}`);
  console.log(`📋 Admin panel at http://${HOST}:${PORT}/admin`);
  console.log(`MailerLite: ${MAILERLITE_API_KEY ? '✓ Configured' : '✗ Not configured (local storage only)'}`);
  console.log(`Supabase: ${supabase ? '✓ Configured' : '✗ Not configured'}`);
});
