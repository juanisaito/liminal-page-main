require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

// Inicialización de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'comprobantes');
const NEWSLETTER_FILE = path.join(DATA_DIR, 'newsletter.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'saito-bookings.json');
const LEADS_FILE = path.join(DATA_DIR, 'saito-leads.json');
const SAITO_CONFIG_FILE = path.join(DATA_DIR, 'saito-config.json');
const PROMO_EMAILS_FILE = path.join(DATA_DIR, 'saito-promo-emails.json');
const USERS_FILE = path.join(__dirname, 'admin-users.json');

const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const MAILERLITE_GROUP_ID = process.env.MAILERLITE_GROUP_ID;
const MAILERLITE_API_URL = 'https://connect.mailerlite.com/api/subscribers';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://liminalrecords.ar').replace(/\/$/, '');
const EVENT_CAPACITY = 100;
const MAX_TICKETS_PER_EMAIL = 2;
const EVENT_DATE = new Date('2026-11-25T00:00:00.000Z');

// Configuración Google Calendar & Sesiones Saito
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'juanisaito@gmail.com';
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const STUDIO_ADDRESS = 'Av. Medrano 46, 1A, CABA';
const CONTACT_PHONE = '11 2636-06722';
const TRANSFER_ALIAS = 'saitoneprod';
const BASE_PRICE_ARS = 85000;
const PROMO_DISCOUNT_PERCENT = 40;
const SLOTS_CATALOG = ['11:00', '14:00', '16:30', '19:00'];

const DEFAULT_SAITO_CONFIG = {
  allPromo: true,
  basePriceArs: BASE_PRICE_ARS,
  discountPercent: PROMO_DISCOUNT_PERCENT,
  promoLabel: 'promo activa',
  alias: TRANSFER_ALIAS,
  dayMode: 'all',
  promoDates: [],
  promoSlots: [...SLOTS_CATALOG]
};

// Multer para subida de comprobantes de transferencia
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const uploadReceipt = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

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
  if (!fs.existsSync(NEWSLETTER_FILE)) {
    fs.writeFileSync(NEWSLETTER_FILE, '[]', { encoding: 'utf-8', mode: 0o600 });
  }
  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, '[]', { encoding: 'utf-8', mode: 0o600 });
  }
  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, '[]', { encoding: 'utf-8', mode: 0o600 });
  }
  if (!fs.existsSync(SAITO_CONFIG_FILE)) {
    fs.writeFileSync(SAITO_CONFIG_FILE, JSON.stringify(DEFAULT_SAITO_CONFIG, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
  if (!fs.existsSync(PROMO_EMAILS_FILE)) {
    fs.writeFileSync(PROMO_EMAILS_FILE, '[]', { encoding: 'utf-8', mode: 0o600 });
  }
}

function loadJsonArray(filePath) {
  ensureDataStore();
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]');
  } catch {
    return [];
  }
}

function saveJsonArray(filePath, arr) {
  ensureDataStore();
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

function loadSaitoConfig() {
  ensureDataStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(SAITO_CONFIG_FILE, 'utf-8') || '{}');
    return { ...DEFAULT_SAITO_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_SAITO_CONFIG };
  }
}

function saveSaitoConfig(cfg) {
  ensureDataStore();
  fs.writeFileSync(SAITO_CONFIG_FILE, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

function recordPromoEmail({ email, name = '', type = 'web', date = '', slot = '' }) {
  const cleanEmail = sanitizeString(email, 250).toLowerCase();
  if (!validateEmail(cleanEmail)) return;
  const list = loadJsonArray(PROMO_EMAILS_FILE);
  if (!list.some((item) => item.email === cleanEmail)) {
    list.unshift({
      id: crypto.randomUUID(),
      email: cleanEmail,
      name: sanitizeString(name, 100),
      type: sanitizeString(type, 30) || 'web',
      date: sanitizeString(date, 10),
      slot: sanitizeString(slot, 10),
      capturedAt: new Date().toISOString()
    });
    saveJsonArray(PROMO_EMAILS_FILE, list);
  }
}

function loadSubscribers() {
  return loadJsonArray(NEWSLETTER_FILE);
}

function saveSubscribers(subscribers) {
  saveJsonArray(NEWSLETTER_FILE, subscribers);
}

function getCalendarClient() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) return null;
  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  return google.calendar({ version: 'v3', auth });
}

function isDateInPromo(cfg, dateIso) {
  if (!dateIso) return false;
  if (cfg.allPromo) return true;
  const mode = cfg.dayMode || 'all';
  if (mode === 'all') return true;
  if (mode === 'custom') {
    return Array.isArray(cfg.promoDates) && cfg.promoDates.includes(dateIso);
  }
  const dayOfWeek = new Date(`${dateIso}T12:00:00-03:00`).getDay();
  if (mode === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (mode === 'weekends') return dayOfWeek === 6;
  return false;
}

function getPromoSlotsForDate(type, dateIso) {
  if (type !== 'studio') return [];
  const cfg = loadSaitoConfig();
  if (!isDateInPromo(cfg, dateIso)) return [];
  if (cfg.allPromo) return [...SLOTS_CATALOG];
  return Array.isArray(cfg.promoSlots) ? cfg.promoSlots : [];
}

function computeBookingPrice(type, dateIso, slot) {
  const cfg = loadSaitoConfig();
  const basePrice = Number(cfg.basePriceArs) || BASE_PRICE_ARS;
  const discount = Number(cfg.discountPercent) || PROMO_DISCOUNT_PERCENT;
  const alias = cfg.alias || TRANSFER_ALIAS;

  if (type !== 'studio') return { amount: 0, isPromo: false, alias };
  const isPromo = getPromoSlotsForDate(type, dateIso).includes(slot);
  const amount = isPromo
    ? Math.round(basePrice * (1 - discount / 100))
    : basePrice;
  return { amount, isPromo, alias };
}

function buildEventRange(dateIso, slot, durationHours) {
  const start = new Date(`${dateIso}T${slot}:00-03:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function createCalendarEventForBooking(booking) {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  const cfg = loadSaitoConfig();
  const alias = cfg.alias || TRANSFER_ALIAS;
  const durationHours = booking.type === 'studio' ? 2 : 1;
  const { startISO, endISO } = buildEventRange(booking.date, booking.slot, durationHours);
  const summary = booking.type === 'studio'
    ? `Sesión de estudio · ${booking.name}`
    : `1ª Reunión Dir. Artística · ${booking.name}`;

  const descriptionLines = [
    `Cliente: ${booking.name}`,
    `Email: ${booking.email}`,
    booking.notes ? `Notas: ${booking.notes}` : null,
    booking.type === 'studio'
      ? `Monto abonado: $${Number(booking.amount).toLocaleString('es-AR')} ARS (Alias: ${alias})`
      : '1ª reunión gratuita de análisis de perfil',
    `Dirección: ${STUDIO_ADDRESS}`,
    `Consultas: ${CONTACT_PHONE}`
  ].filter(Boolean);

  try {
    const response = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      sendUpdates: 'all',
      requestBody: {
        summary,
        location: STUDIO_ADDRESS,
        description: descriptionLines.join('\n'),
        start: { dateTime: startISO, timeZone: 'America/Argentina/Buenos_Aires' },
        end: { dateTime: endISO, timeZone: 'America/Argentina/Buenos_Aires' },
        attendees: [{ email: booking.email, displayName: booking.name }]
      }
    });
    return response.data.id || null;
  } catch (err) {
    console.warn('Reintentando crear evento sin attendee:', err.message);
    const fallback = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: {
        summary,
        location: STUDIO_ADDRESS,
        description: descriptionLines.join('\n'),
        start: { dateTime: startISO, timeZone: 'America/Argentina/Buenos_Aires' },
        end: { dateTime: endISO, timeZone: 'America/Argentina/Buenos_Aires' }
      }
    });
    return fallback.data.id || null;
  }
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

function isValidPersonName(str) {
  if (!str || typeof str !== 'string') return false;
  const clean = str.trim();
  if (clean.length < 2) return false;
  if (/(.)\1{3,}/.test(clean)) return false;
  return true;
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
  if (!resend || !RESEND_FROM) return false;

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
    if (error) return false;
    return Boolean(data?.id);
  } catch {
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
  } catch {
    return false;
  }
}

async function addToMailerLite(email, name) {
  if (!MAILERLITE_API_KEY || !MAILERLITE_GROUP_ID) return { synced: false };

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
    return { synced: response.ok };
  } catch {
    return { synced: false };
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
app.use('/uploads', (req, res, next) => {
  if (!isValidAdminToken(req)) return res.sendStatus(403);
  next();
}, express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname)));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'eventos', 'this-is-tobba.html'));
});

// Ruta oculta de agendamiento personal de Saito
app.get('/saitoneprod', (_req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'saitoneprod.html'));
});

// Página administradora de promos, mails y turnos de Saito
app.get('/saito-admin', (_req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'saito-admin.html'));
});

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ============================================================================
// API AGENDA PERSONAL SAÏTO (/saitoneprod & /saito-admin)
// ============================================================================

app.get('/api/saito-config', (_req, res) => {
  res.json(loadSaitoConfig());
});

app.post('/api/admin/saito-config', (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });

  const current = loadSaitoConfig();
  const basePriceArs = Number(req.body.basePriceArs);
  const discountPercent = Number(req.body.discountPercent);

  const next = {
    allPromo: typeof req.body.allPromo === 'boolean' ? req.body.allPromo : current.allPromo,
    basePriceArs: Number.isFinite(basePriceArs) && basePriceArs > 0 ? basePriceArs : current.basePriceArs,
    discountPercent: Number.isFinite(discountPercent) && discountPercent >= 0 && discountPercent <= 90 ? discountPercent : current.discountPercent,
    promoLabel: sanitizeString(req.body.promoLabel, 80) || current.promoLabel,
    alias: sanitizeString(req.body.alias, 60) || current.alias,
    dayMode: ['all', 'weekdays', 'weekends', 'custom'].includes(req.body.dayMode) ? req.body.dayMode : current.dayMode,
    promoDates: Array.isArray(req.body.promoDates)
      ? req.body.promoDates.map((d) => sanitizeString(d, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      : current.promoDates,
    promoSlots: Array.isArray(req.body.promoSlots)
      ? req.body.promoSlots.map((s) => sanitizeString(s, 10)).filter((s) => SLOTS_CATALOG.includes(s))
      : current.promoSlots
  };

  saveSaitoConfig(next);
  res.json({ ok: true, config: next });
});

app.post('/api/promo-emails', (req, res) => {
  const email = sanitizeString(req.body.email, 250).toLowerCase();
  if (!validateEmail(email)) return res.status(400).json({ error: 'Email inválido' });

  recordPromoEmail({
    email,
    name: req.body.name,
    type: req.body.type || 'web',
    date: req.body.date || '',
    slot: req.body.slot || ''
  });

  return res.json({ ok: true });
});

app.get('/api/admin/promo-emails', (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  res.json({ emails: loadJsonArray(PROMO_EMAILS_FILE) });
});

app.get('/api/availability', async (req, res) => {
  const type = req.query.type === 'direction' ? 'direction' : 'studio';
  const dateIso = sanitizeString(req.query.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }

  const busySet = new Set();

  // 1. Bloquear turnos ya tomados o con comprobante subido localmente
  const bookings = loadJsonArray(BOOKINGS_FILE);
  bookings.forEach((b) => {
    if (b.date === dateIso && ['receipt_uploaded', 'confirmed'].includes(b.status)) {
      busySet.add(b.slot);
    }
  });

  // 2. Consultar ocupación real en Google Calendar
  const calendar = getCalendarClient();
  if (calendar) {
    try {
      const durationHours = type === 'studio' ? 2 : 1;
      const dayStart = new Date(`${dateIso}T00:00:00-03:00`).toISOString();
      const dayEnd = new Date(`${dateIso}T23:59:59-03:00`).toISOString();

      const fb = await calendar.freebusy.query({
        requestBody: {
          timeMin: dayStart,
          timeMax: dayEnd,
          timeZone: 'America/Argentina/Buenos_Aires',
          items: [{ id: GOOGLE_CALENDAR_ID }]
        }
      });

      const busyWindows = fb.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
      for (const slot of SLOTS_CATALOG) {
        const { startISO, endISO } = buildEventRange(dateIso, slot, durationHours);
        const sMs = Date.parse(startISO);
        const eMs = Date.parse(endISO);
        const overlaps = busyWindows.some((w) => {
          const ws = Date.parse(w.start);
          const we = Date.parse(w.end);
          return sMs < we && eMs > ws;
        });
        if (overlaps) busySet.add(slot);
      }
    } catch (err) {
      console.error('Error leyendo freebusy de Google Calendar:', err.message);
    }
  }

  const cfg = loadSaitoConfig();
  return res.json({
    date: dateIso,
    busy: Array.from(busySet),
    allPromo: type === 'studio' ? Boolean(cfg.allPromo && isDateInPromo(cfg, dateIso)) : false,
    promoSlots: getPromoSlotsForDate(type, dateIso)
  });
});

app.post('/api/lead-abandon', (req, res) => {
  const email = sanitizeString(req.body.email, 250).toLowerCase();
  if (!validateEmail(email)) return res.status(400).json({ error: 'Email inválido' });

  recordPromoEmail({
    email,
    name: req.body.name,
    type: `lead-${sanitizeString(req.body.type, 20) || 'studio'}`,
    date: req.body.date,
    slot: req.body.slot
  });

  const leads = loadJsonArray(LEADS_FILE);
  const existing = leads.find((l) => l.email === email && !l.completed);
  if (!existing) {
    leads.push({
      id: crypto.randomUUID(),
      type: sanitizeString(req.body.type, 20),
      name: sanitizeString(req.body.name, 100),
      email,
      date: sanitizeString(req.body.date, 10),
      slot: sanitizeString(req.body.slot, 10),
      capturedAt: new Date().toISOString(),
      completed: false,
      followUpSent: false
    });
    saveJsonArray(LEADS_FILE, leads);
  }
  return res.json({ ok: true });
});

app.post('/api/book', async (req, res) => {
  const type = req.body.type === 'direction' ? 'direction' : 'studio';
  const name = sanitizeString(req.body.name, 100);
  const email = sanitizeString(req.body.email, 250).toLowerCase();
  const notes = sanitizeString(req.body.notes, 400);
  const date = sanitizeString(req.body.date, 10);
  const slot = sanitizeString(req.body.slot, 10);

  if (!name || !validateEmail(email) || !date || !slot) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  recordPromoEmail({ email, name, type: `booking-${type}`, date, slot });

  const { amount, isPromo } = computeBookingPrice(type, date, slot);
  const bookingId = crypto.randomUUID();

  const booking = {
    id: bookingId,
    type,
    name,
    email,
    notes,
    date,
    slot,
    amount,
    isPromo,
    status: type === 'direction' ? 'confirmed' : 'pending_transfer',
    receiptFile: null,
    calendarEventId: null,
    createdAt: new Date().toISOString()
  };

  if (type === 'direction') {
    try {
      booking.calendarEventId = await createCalendarEventForBooking(booking);
    } catch (err) {
      console.error('Error creando evento de dir. artística:', err.message);
    }

    const leads = loadJsonArray(LEADS_FILE);
    leads.forEach((l) => { if (l.email === email) l.completed = true; });
    saveJsonArray(LEADS_FILE, leads);
  }

  const bookings = loadJsonArray(BOOKINGS_FILE);
  bookings.unshift(booking);
  saveJsonArray(BOOKINGS_FILE, bookings);

  return res.json({ ok: true, bookingId, status: booking.status, amount, isPromo });
});

app.post('/api/upload-receipt', uploadReceipt.single('receipt'), async (req, res) => {
  const bookingId = sanitizeString(req.body.bookingId, 80);
  const bookings = loadJsonArray(BOOKINGS_FILE);
  let booking = bookings.find((b) => b.id === bookingId);

  if (!booking) {
    const date = sanitizeString(req.body.date, 10);
    const slot = sanitizeString(req.body.slot, 10);
    const { amount, isPromo } = computeBookingPrice('studio', date, slot);
    booking = {
      id: bookingId || crypto.randomUUID(),
      type: 'studio',
      name: sanitizeString(req.body.name, 100),
      email: sanitizeString(req.body.email, 250).toLowerCase(),
      notes: '',
      date,
      slot,
      amount,
      isPromo,
      status: 'receipt_uploaded',
      receiptFile: null,
      calendarEventId: null,
      createdAt: new Date().toISOString()
    };
    bookings.unshift(booking);
  }

  if (booking.email) {
    recordPromoEmail({
      email: booking.email,
      name: booking.name,
      type: 'receipt-studio',
      date: booking.date,
      slot: booking.slot
    });
  }

  booking.status = 'receipt_uploaded';
  booking.receiptFile = req.file ? req.file.filename : null;
  booking.receiptUploadedAt = new Date().toISOString();
  saveJsonArray(BOOKINGS_FILE, bookings);

  const leads = loadJsonArray(LEADS_FILE);
  leads.forEach((l) => { if (l.email === booking.email) l.completed = true; });
  saveJsonArray(LEADS_FILE, leads);

  if (resend && RESEND_FROM) {
    try {
      const attachments = [];
      if (req.file) {
        attachments.push({
          filename: req.file.originalname || req.file.filename,
          content: fs.readFileSync(req.file.path)
        });
      }
      await resend.emails.send({
        from: RESEND_FROM,
        to: [GOOGLE_CALENDAR_ID],
        subject: `Nuevo comprobante de sesión · ${booking.name} (${booking.date} ${booking.slot})`,
        html: `
          <p><strong>${escapeHtml(booking.name)}</strong> subió un comprobante de transferencia.</p>
          <ul>
            <li><strong>Día y hora:</strong> ${escapeHtml(booking.date)} · ${escapeHtml(booking.slot)} hs</li>
            <li><strong>Monto:</strong> $${Number(booking.amount).toLocaleString('es-AR')} ARS ${booking.isPromo ? '(promo)' : ''}</li>
            <li><strong>Email:</strong> ${escapeHtml(booking.email)}</li>
          </ul>
          <p>Entrá a <a href="${PUBLIC_URL}/saito-admin">${PUBLIC_URL}/saito-admin</a> para aprobar el turno y disparar la invitación en Google Calendar.</p>
        `,
        attachments
      });
    } catch (err) {
      console.error('Error enviando aviso de comprobante:', err.message);
    }
  }

  return res.json({ ok: true, bookingId: booking.id });
});

// Admin: listar turnos de Saito
app.get('/api/admin/saito-bookings', (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const bookings = loadJsonArray(BOOKINGS_FILE);
  res.json({ bookings });
});

// Admin: aprobar turno y agendar en Google Calendar
app.post('/api/admin/saito-bookings/:id/approve', async (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });

  const bookings = loadJsonArray(BOOKINGS_FILE);
  const booking = bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Reserva no encontrada.' });

  try {
    if (!booking.calendarEventId) {
      booking.calendarEventId = await createCalendarEventForBooking(booking);
    }
    booking.status = 'confirmed';
    booking.confirmedAt = new Date().toISOString();
    saveJsonArray(BOOKINGS_FILE, bookings);

    if (resend && RESEND_FROM && booking.email) {
      await resend.emails.send({
        from: RESEND_FROM,
        to: [booking.email],
        subject: `Turno confirmado · ${booking.date} ${booking.slot} hs`,
        html: `
          <p>Hola ${escapeHtml(booking.name)}, qué bueno que reservaste.</p>
          <p>Tu sesión quedó confirmada para el <strong>${escapeHtml(booking.date)} a las ${escapeHtml(booking.slot)} hs</strong>.</p>
          <p><strong>Dirección del estudio:</strong> ${STUDIO_ADDRESS}<br/>
          <strong>Celular para consultas:</strong> ${CONTACT_PHONE}</p>
        `
      });
    }

    res.json({ ok: true, booking });
  } catch (err) {
    console.error('Error aprobando turno:', err.message);
    res.status(500).json({ error: 'No se pudo confirmar en Google Calendar.' });
  }
});

// Recuperación automática de carritos abandonados (cada 6 horas revisa leads > 48 hs sin completar)
setInterval(async () => {
  if (!resend || !RESEND_FROM) return;
  const leads = loadJsonArray(LEADS_FILE);
  const now = Date.now();
  let changed = false;

  for (const lead of leads) {
    if (lead.completed || lead.followUpSent) continue;
    const elapsedHours = (now - Date.parse(lead.capturedAt)) / (1000 * 60 * 60);
    if (elapsedHours >= 48) {
      try {
        await resend.emails.send({
          from: RESEND_FROM,
          to: [lead.email],
          subject: '¿Seguimos con tu sesión en estudio?',
          html: `
            <p>Hola ${escapeHtml(lead.name || '')},</p>
            <p>Vi que estuviste mirando horarios para venir a trabajar al estudio y quedó pendiente la reserva.</p>
            <p>Si querés coordinar o aprovechar alguno de los horarios con promo disponibles en agenda, podés volver a entrar directo acá:</p>
            <p><a href="${PUBLIC_URL}/saitoneprod">${PUBLIC_URL}/saitoneprod</a></p>
            <p>Cualquier consulta escribime al ${CONTACT_PHONE}.</p>
          `
        });
        lead.followUpSent = true;
        lead.followUpSentAt = new Date().toISOString();
        changed = true;
      } catch (err) {
        console.error('Error enviando follow-up lead:', err.message);
      }
    }
  }

  if (changed) saveJsonArray(LEADS_FILE, leads);
}, 6 * 60 * 60 * 1000);

// ============================================================================
// RUTAS EXISTENTES DE LIMINAL RECORDS & THIS IS TOBBA
// ============================================================================

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
  if (!name || !isValidPersonName(name)) return res.status(400).json({ error: 'Ingresá un nombre y apellido válido.' });
  if (!city) return res.status(400).json({ error: 'Ingresá tu ciudad.' });
  if (![1, 2].includes(quantity) || (quantity === 2 && (!guestName || !isValidPersonName(guestName)))) {
    return res.status(400).json({ error: 'Podés reservar una o dos entradas. Para dos, necesitamos el nombre y apellido válido de tu acompañante.' });
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
    res.status(500).json({ error: 'Error al consultar entradas.' });
  }
});

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
  } catch {
    res.status(500).json({ error: 'Error al procesar el check-in.' });
  }
});

app.post('/api/newsletter-subscribe', limiter, async (req, res) => {
  const email = sanitizeString(req.body.email).toLowerCase();
  const name = sanitizeString(req.body.name);
  const source = sanitizeString(req.body.source || req.headers.referer || 'unknown');

  if (!validateEmail(email)) return res.status(400).json({ error: 'Email inválido.' });
  if (!name || !isValidPersonName(name)) return res.status(400).json({ error: 'El nombre es obligatorio y debe ser válido.' });

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

app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });

  try {
    if (!fs.existsSync(USERS_FILE)) return res.status(500).json({ error: 'Archivo de usuarios no configurado en el servidor.' });
    const rawData = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(rawData);
    const users = data.users || [];
    const foundUser = users.find(u => u.username === username && u.password === password);
    if (!foundUser) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

    const token = Buffer.from(`${foundUser.username}:${foundUser.password}:${Date.now()}`).toString('base64');
    res.json({ token, name: foundUser.name, message: 'Acceso concedido.' });
  } catch {
    res.status(500).json({ error: 'Error interno al procesar el acceso.' });
  }
});

app.get('/api/admin/subscribers', (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const subscribers = loadSubscribers();
  res.json({
    count: subscribers.length,
    subscribers,
    mailerliteSyncedCount: subscribers.filter(s => s.mailerliteSynced).length
  });
});

app.get('/api/admin/export-csv', (req, res) => {
  if (!isValidAdminToken(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const subscribers = loadSubscribers();
  const csv = ['Email,Nombre,Fecha,MailerLite Sincronizado\n'];
  subscribers.forEach(s => {
    csv.push(`"${s.email}","${s.name}","${s.createdAt}","${s.mailerliteSynced ? 'Sí' : 'No'}"\n`);
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="liminal-suscriptores.csv"');
  res.send(csv.join(''));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, HOST, () => {
  ensureDataStore();
  console.log(`🎵 Liminal backend running on http://${HOST}:${PORT}`);
  console.log(`📋 Admin panel at http://${HOST}:${PORT}/admin`);
  console.log(`🎛️  Saito admin at http://${HOST}:${PORT}/saito-admin`);
  console.log(`📅 Saito booking at http://${HOST}:${PORT}/saitoneprod`);
  console.log(`Google Calendar: ${GOOGLE_CLIENT_EMAIL ? '✓ Configured' : '✗ Not configured'}`);
});
