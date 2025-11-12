const { pool } = require('../config/mysql');
const { sendEmail, getLogoDataUri } = require('../services/emailService');

const BIRTHDAY_PREFIX = 'Feliz cumpleaños';

async function alreadyAlertedToday(userId) {
  const [[row]] = await pool.query(
    `SELECT axu.id
       FROM alertas_x_usuarios axu
       JOIN alertas a ON a.id = axu.alerta_id
      WHERE axu.usuario_id = ?
        AND DATE(a.created_at) = CURDATE()
        AND a.mensaje_alrt LIKE CONCAT(?, '%')
      LIMIT 1`,
    [userId, BIRTHDAY_PREFIX]
  );
  return Boolean(row?.id);
}

async function createUserAlert(userId, message) {
  const [res] = await pool.query(
    `INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES (?, NOW(), NOW())`,
    [message]
  );
  const alertaId = res.insertId;
  await pool.query(
    `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
    [userId, alertaId]
  );
  return alertaId;
}

// Also notify Admin/Cashier staff so they can see the alert
async function assignAlertToStaff(alertaId) {
  try {
    const [roleRows] = await pool.query(
      `SELECT id FROM roles WHERE LOWER(nombre) IN ('admin','cashier','cajero')`
    );
    if (!roleRows || roleRows.length === 0) return;
    const roleIds = roleRows.map(r => r.id);
    const placeholders = roleIds.map(() => '?').join(',');
    const [userRows] = await pool.query(
      `SELECT DISTINCT usuario_id FROM roles_x_usuarios WHERE role_id IN (${placeholders})`,
      roleIds
    );
    if (!userRows || userRows.length === 0) return;
    const values = userRows.map(u => [u.usuario_id, alertaId]);
    await pool.query(
      `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at)
       VALUES ${values.map(() => '(?, ?, NOW(), NOW())').join(',')}`,
      values.flat()
    );
  } catch {}
}

async function sendEmailIfConfigured(to, subject, html) {
  try {
    const logo = getLogoDataUri();
    const enriched = logo ? html.replace('cid:logo', logo) : html.replace('cid:logo', '');
    await sendEmail({ to, subject, html: enriched });
  } catch (e) {
    console.log('[birthdayJob] email send skipped/error:', e?.message || e);
  }
}

function buildBirthdayHtml(name) {
  const safe = String(name || 'cliente').toUpperCase();
  return `
  <div style="font-family: Arial, sans-serif; color: #222;">
    <div style="text-align:center; margin-bottom: 10px;">
      <img src="cid:logo" alt="Nativhos" style="height:60px" />
    </div>
    <h2>¡Feliz cumpleaños, ${safe}!</h2>
    <p>En Nativhos queremos celebrar contigo este día tan especial.</p>
    <p>Por eso, con tu compra de hoy, te espera una dulce sorpresa de cumpleaños preparada especialmente para ti, como agradecimiento por elegirnos y ser parte de nuestra familia Nativhos.</p>
    <p>¡Te esperamos para endulzar tu día con el mejor sabor de todos: el de celebrar contigo!</p>
    <p style="font-size:12px;color:#666;">(no olvides llevar tu documento de identidad)</p>
  </div>`;
}

async function runOnce() {
  try {
    const [users] = await pool.query(
      `SELECT id, nombre, correo FROM usuarios
        WHERE cumpleanos IS NOT NULL
          AND DATE_FORMAT(cumpleanos, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d')`
    );
    for (const u of users) {
      const already = await alreadyAlertedToday(u.id);
      if (already) continue;
      const message = `${BIRTHDAY_PREFIX}, ${u.nombre}!`;
      const alertaId = await createUserAlert(u.id, message);
      // No enviar a staff: solo el cumpleañero recibe la alerta
      const html = buildBirthdayHtml(u.nombre);
      await sendEmailIfConfigured(u.correo, '¡Feliz cumpleaños de Nativhos!', html);
    }
  } catch (e) {
    console.log('[birthdayJob] error:', e?.message || e);
  }
}

function schedule() {
  // Run at startup and then every 6 hours; de-dup prevents repeats
  runOnce();
  const sixHours = 6 * 60 * 60 * 1000;
  setInterval(runOnce, sixHours);
}

module.exports = { schedule };
