const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'this is tobba.env') });
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const RESEND_FROM = process.env.RESEND_FROM;

// ⚠️ MODO PRUEBA: Poné tu correo acá para recibirlo primero y chequear el diseño.
// Cuando estés listo para mandarlo a todos, cambiá MODO_PRUEBA a false.
const MODO_PRUEBA = false;
const EMAIL_PRUEBA = 'juanisaito@gmail.com';

function generarHtmlReminder(nombreCompleto) {
  const primerNombre = (nombreCompleto || '').trim().split(' ')[0] || 'Ahí';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <style>
    body{margin:0;padding:0}
    table{border-collapse:collapse}
    p,span,h1,h2,h3{margin:0;padding:0}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:inherit!important}
    @media (max-width:599px){.ecw{width:100%!important;min-width:0!important}}
    @media(max-width:550px){.ers-fs-200{font-size:18px!important}.ers-fs-293{font-size:22.7px!important}}
  </style>
</head>
<body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5">
    <tbody>
      <tr>
        <td style="background-color:#f0f1f5">
          <table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="ecw" style="max-width:600px;margin:0 auto;background-color:#ffffff;width:600px;min-width:600px">
            <tbody>
              <!-- Logo Liminal -->
              <tr>
                <td style="padding:32px 24px 20px">
                  <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
                    <tbody>
                      <tr>
                        <td align="center">
                          <img src="https://raw.githubusercontent.com/juanisaito/liminal-page-main/main/public/images/99214369eed801cad3cee7623823a69a.png" width="108" height="35" alt="Liminal Records" style="display:block;width:108px;height:auto;max-width:100%">
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <!-- Línea divisoria -->
              <tr>
                <td style="padding:0px 24px 24px">
                  <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
                    <tbody>
                      <tr>
                        <td align="center">
                          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:552px">
                            <tbody>
                              <tr>
                                <td height="1" style="height:1px;border-radius:999px;line-height:1px;font-size:0;background-color:#bfc3c8">&nbsp;</td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <!-- Título -->
              <tr>
                <td dir="ltr" class="ers-fs-293" style="color:#0e1b10;font-family:Arial, Helvetica, sans-serif;font-size:29.3px;font-weight:700;letter-spacing:-0.04em;text-align:center;padding:0px 24px 16px;line-height:1.1">
                  THIS IS TOBBA LIVE EVENT
                </td>
              </tr>

              <!-- Mensaje de recordatorio -->
              <tr>
                <td style="padding:0px 24px 32px">
                  <table border="0" cellpadding="0" cellspacing="0" align="center" style="width:100%;max-width:480px;margin:0 auto;font-family:Arial, Helvetica, sans-serif;color:#0e1b10;text-align:center">
                    <tbody>
                      <tr>
                        <td style="font-size:17px;font-weight:700;letter-spacing:-0.03em;padding:0 0 12px;line-height:1.3">
                          Falta muy poco para encontrarnos, ${primerNombre}.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:14.7px;letter-spacing:-0.02em;padding:0 0 12px;line-height:1.45;color:#222222">
                          Nos vemos este <strong>miércoles 25 de noviembre</strong> en Yunta Bar para la presentación y preescucha exclusiva de Tobba.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:14.7px;letter-spacing:-0.02em;padding:0 0 14px;line-height:1.55;color:#222222">
                          Una noche pensada para venir a disfrutar, ver en estreno los videoclips de<br>
                          <strong>“Me sale natural”</strong> y <strong>“esto es <3”</strong><br>
                          además de vivir el show en vivo de cerca.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:14.7px;letter-spacing:-0.02em;padding:10px 0 18px;line-height:1.55;color:#0e1b10">
                          <strong>Miércoles 25 nov. · 20:00 hs (Puntual)</strong><br>
                          Yunta Bar · Lavalle 3491, Almagro
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;letter-spacing:-0.01em;padding:0 0 22px;line-height:1.55;color:#555555">
                          Recordá tener a mano el código QR de tu entrada al llegar. Si todavía no la sacaste, podés reservar la tuya gratis <a href="https://liminalrecords.ar" target="_blank" rel="noopener noreferrer" style="color:#0e1b10;font-weight:700;text-decoration:underline;">desde nuestra web</a>.<br>
                          El ingreso es por orden de llegada hasta completar la capacidad del lugar.
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:0 0 8px">
                          <a href="https://maps.app.goo.gl/BiRVcGNssrcxe2WD9" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#0e1b10;color:#ffffff;text-decoration:none;font-family:Arial, Helvetica, sans-serif;font-size:13px;font-weight:700;letter-spacing:0.04em;padding:12px 26px;border-radius:999px">
                            Ver ubicación en Maps
                          </a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <!-- Footer oscuro original -->
              <tr>
                <td style="vertical-align:top">
                  <table border="0" cellpadding="0" cellspacing="0" align="center" style="width:100%;margin:0 auto;background-color:#070300">
                    <tbody>
                      <tr>
                        <td style="text-align:center;padding:24px 39px">
                          <table border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:522px;margin:0 auto">
                            <tbody>
                              <tr>
                                <td style="padding:7px;font-family:Arial, Helvetica, sans-serif;text-align:left">
                                  <p class="ers-fs-200" style="color:#f6f5f1;font-size:20px;font-weight:700;letter-spacing:-0.01em;padding:0px 0px 12px;line-height:1.2">
                                    ¿Necesitas ayuda?
                                  </p>
                                  <p style="color:#f6f5f1;font-size:13.3px;letter-spacing:-0.01em;padding:0px 0px 16px;line-height:1.45">
                                    Escribinos en @liminalrecords.ar por cualquier duda o consulta que tengas, a la brevedad nos estaremos comunicando
                                  </p>
                                  <p style="color:#bfc3c8;font-size:9.3px;letter-spacing:-0.01em;line-height:1.6">
                                    Liminal Records, CABA.
                                  </p>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

function generarTextoPlano(nombreCompleto) {
  const primerNombre = (nombreCompleto || '').trim().split(' ')[0] || 'Ahí';
  return `THIS IS TOBBA LIVE EVENT

Falta muy poco para encontrarnos, ${primerNombre}.

Nos vemos este miércoles 25 de noviembre en Yunta Bar para la presentación y preescucha exclusiva de Tobba.
Una noche pensada para venir a disfrutar, ver en estreno los videoclips de
“Me sale natural” y “esto es <3”
además de vivir el show en vivo de cerca.

Miércoles 25 nov. · 20:00 hs (Puntual)
Yunta Bar · Lavalle 3491, Almagro

Recordá tener a mano el código QR de tu entrada al llegar. Si todavía no la sacaste, podés reservar la tuya gratis desde nuestra web: https://liminalrecords.ar
El ingreso es por orden de llegada hasta completar la capacidad del lugar.

Ver ubicación en Maps: https://maps.app.goo.gl/BiRVcGNssrcxe2WD9

¿Necesitas ayuda?
Escribinos en @liminalrecords.ar por cualquier duda o consulta que tengas, a la brevedad nos estaremos comunicando

Liminal Records, CABA.`;
}

async function enviarReminder() {
  if (!RESEND_FROM) {
    console.error('❌ Falta configurar RESEND_FROM en el archivo "this is tobba.env"');
    return;
  }

  console.log(`Remitente configurado: ${RESEND_FROM}\n`);

  if (MODO_PRUEBA) {
    const nombrePrueba = 'Juan Ignacio';
    const primerNombrePrueba = nombrePrueba.split(' ')[0];
    console.log(`🧪 MODO PRUEBA ACTIVADO: Enviando únicamente a ${EMAIL_PRUEBA}...`);
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [EMAIL_PRUEBA],
      subject: `Falta poco, ${primerNombrePrueba} · THIS IS TOBBA LIVE EVENT`,
      html: generarHtmlReminder(nombrePrueba),
      text: generarTextoPlano(nombrePrueba)
    });

    if (error) {
      console.error('❌ Error al enviar prueba:', error.message);
    } else {
      console.log(`✅ Mail de prueba enviado (ID: ${data?.id}). Revisá tu casilla!`);
      console.log('👉 Cuando te guste cómo quedó, cambiá MODO_PRUEBA = false en el script y volvelo a correr.');
    }
    return;
  }

  console.log('Consultando asistentes en Supabase...');
  const { data: tickets, error } = await supabase
    .from('event_tickets')
    .select('email, name, guest');

  if (error) {
    console.error('❌ Error al leer Supabase:', error);
    return;
  }

  const destinatarios = new Map();
  for (const t of tickets) {
    if (!t.guest && t.email) {
      destinatarios.set(t.email.toLowerCase().trim(), t.name);
    }
  }

  // 👇 Fans extra de Tobba en Argentina (se suman sin duplicar si ya sacaron entrada)
  const FANS_TOBBA_AR = [
    { email: 'floricitaanco@gmail.com', name: 'Flor' },
    { email: 'matiasgomez2121@gmail.com', name: 'Mati' },
    { email: 'pedrourtiaga4576@gmail.com', name: 'Pedro Urtiaga' },
    { email: 'luchyr235@gmail.com', name: 'Luciano' },
    { email: 'alvarorojashaaland@gmail.com', name: 'Alvaro Rojas' }
  ];

  for (const fan of FANS_TOBBA_AR) {
    const emailNorm = fan.email.toLowerCase().trim();
    if (!destinatarios.has(emailNorm)) {
      destinatarios.set(emailNorm, fan.name);
    }
  }

  console.log(`Se encontraron ${destinatarios.size} destinatarios únicos. Iniciando envío...\n`);

  let enviados = 0;
  for (const [email, name] of destinatarios.entries()) {
    const primerNombre = (name || '').trim().split(' ')[0] || 'Ahí';
    try {
      const { error: sendError } = await resend.emails.send({
        from: RESEND_FROM,
        to: [email],
        subject: `Falta poco, ${primerNombre} · THIS IS TOBBA LIVE EVENT`,
        html: generarHtmlReminder(name),
        text: generarTextoPlano(name)
      });

      if (sendError) {
        console.error(`❌ Error con ${email}:`, sendError.message);
      } else {
        enviados++;
        console.log(`✅ [${enviados}/${destinatarios.size}] Enviado a: ${email} (${name})`);
      }
    } catch (err) {
      console.error(`❌ Fallo con ${email}:`, err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 350));
  }

  console.log(`\n🎉 Listo! Se enviaron ${enviados} correos desde ${RESEND_FROM}.`);
}

enviarReminder();
