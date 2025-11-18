const bcrypt = require("bcrypt");
const { pool } = require("../config/mysql");

class UserDoc {
  constructor(data) {
    this.name = data.name;
    this.phone = data.phone;
    this.document = data.document || data.documento || null;
    this.email = data.email;
    // this.password = data.password; //
    this.role = data.role;
    this.socialId = data.socialId || data.social_id || null;
    this.docTypeId = data.docTypeId || data.tipo_doc_id || null;
    this.birthday = data.birthday || data.cumpleanos || null;
    this.customerData = data.customerData || {};
    this.isActive = data.isActive ?? true;
    this._id = data._id || null; // maps to usuarios.id
  }

  async save() {
    // Resolve role id (must exist beforehand)
    let roleId = null;
    if (this.role) {
      const [[roleRow]] = await pool.query(
        "SELECT id FROM roles WHERE nombre = ? LIMIT 1",
        [this.role]
      );
      roleId = roleRow?.id || null;
    }

    // Pick or create an ACTIVO estado_id
    let estadoId = null;
    try {
      const [erows] = await pool.query("SELECT id FROM estados WHERE nombre IN ('ACTIVO','Activo','active') ORDER BY id LIMIT 1");
      if (erows.length > 0) {
        estadoId = erows[0].id;
      } else {
        const [insEstado] = await pool.query(
          "INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES ('ACTIVO', 1, NOW(), NOW())"
        );
        estadoId = insEstado.insertId;
      }
    } catch {}

    // Ensure a generic document type exists (e.g., 'CC') and capture its id
    let tipoDocId = null;
    try {
      const [drows] = await pool.query("SELECT id FROM documentos ORDER BY id LIMIT 1");
      if (drows.length > 0) {
        tipoDocId = drows[0].id;
      } else {
        const [insDoc] = await pool.query(
          "INSERT INTO documentos (tipo_doc, created_at, updated_at) VALUES ('CC', NOW(), NOW())"
        );
        tipoDocId = insDoc.insertId;
      }
    } catch {}

    // Insert usuario (if not exists by correo)
    const [existing] = await pool.query("SELECT id FROM usuarios WHERE correo = ? LIMIT 1", [this.email]);
    if (existing.length === 0) {
      try {
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS social_id VARCHAR(255) NOT NULL DEFAULT ''");
      } catch {}
      const [ins] = await pool.query(
        "INSERT INTO usuarios (nombre, correo, telefono, social_id, estado_id, tipo_doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [this.name, this.email, this.phone?.toString() || null, this.socialId || '', estadoId, tipoDocId]
      );
      this._id = ins.insertId;
    } else {
      this._id = existing[0].id;
      if (this.socialId) {
        try {
          await pool.query("UPDATE usuarios SET social_id = ? WHERE id = ? AND (social_id IS NULL OR social_id = '')", [this.socialId, this._id]);
        } catch {}
      }
    }

    // No password persistence (One Tap only)

    if (roleId) {
      await pool.query(
        `INSERT IGNORE INTO roles_x_usuarios (usuario_id, role_id, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [this._id, roleId]
      );
    }
    return this;
  }
}

const User = function UserFactory(data) {
  return new UserDoc(data || {});
};

User.findOne = async function (filter) {
  if (!filter?.email) return null;
  const email = filter.email;
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.documento, u.tipo_doc_id, u.cumpleanos, u.social_id,
            COALESCE(r.nombre, 'Customer') AS role
       FROM usuarios u
  LEFT JOIN roles_x_usuarios rxu ON rxu.usuario_id = u.id
  LEFT JOIN roles r ON r.id = rxu.role_id
      WHERE u.correo = ?
      LIMIT 1`,
    [email]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    _id: row.id,
    name: row.nombre,
    email: row.correo,
    phone: row.telefono ? Number(row.telefono) : null,
    document: row.documento || null,
    docTypeId: row.tipo_doc_id || null,
    birthday: row.cumpleanos || null,
    role: row.role || "Customer",
    socialId: row.social_id || null
  };
};

User.findById = async function (id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.documento, u.tipo_doc_id, u.cumpleanos, u.social_id,
            COALESCE(r.nombre, 'Customer') as role
       FROM usuarios u
  LEFT JOIN roles_x_usuarios rxu ON rxu.usuario_id = u.id
  LEFT JOIN roles r ON r.id = rxu.role_id
      WHERE u.id = ?
      LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    _id: row.id,
    name: row.nombre,
    email: row.correo,
    phone: row.telefono ? Number(row.telefono) : null,
    document: row.documento || null,
    docTypeId: row.tipo_doc_id || null,
    birthday: row.cumpleanos || null,
    role: row.role || "Customer",
    socialId: row.social_id || null
  };
};

User.findAll = async function () {
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.documento, u.tipo_doc_id, u.cumpleanos, u.estado_id,
            COALESCE(r.nombre, 'Customer') as role
       FROM usuarios u
  LEFT JOIN roles_x_usuarios rxu ON rxu.usuario_id = u.id
  LEFT JOIN roles r ON r.id = rxu.role_id
     ORDER BY u.created_at DESC, u.id DESC`
  );
  return rows.map(row => ({
    _id: row.id,
    name: row.nombre,
    email: row.correo,
    phone: row.telefono ? Number(row.telefono) : null,
    document: row.documento || null,
    docTypeId: row.tipo_doc_id || null,
    birthday: row.cumpleanos || null,
    estadoId: row.estado_id || null,
    role: row.role || 'Customer'
  }));
};

User.updateByAdmin = async function (id, { documento, telefono, tipo_doc_id, cumpleanos, estado_id }) {
  const fields = [];
  const params = [];
  if (documento !== undefined) { fields.push('documento = ?'); params.push(documento || null); }
  if (telefono !== undefined) { fields.push('telefono = ?'); params.push(telefono ? String(telefono) : null); }
  if (tipo_doc_id !== undefined) { fields.push('tipo_doc_id = ?'); params.push(tipo_doc_id || null); }
  if (cumpleanos !== undefined) { fields.push('cumpleanos = ?'); params.push(cumpleanos || null); }
  if (estado_id !== undefined) { fields.push('estado_id = ?'); params.push(estado_id || null); }
  if (fields.length === 0) return await User.findById(id);
  const sql = `UPDATE usuarios SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
  params.push(id);
  await pool.query(sql, params);
  return await User.findById(id);
};

User.listRoles = async function () {
  const [rows] = await pool.query(
    "SELECT MIN(id) as _id, nombre as name FROM roles GROUP BY nombre ORDER BY nombre ASC"
  );
  return rows;
};

User.updateProfileById = async function (id, { documento, telefono, tipo_doc_id, cumpleanos }) {
  // Enforce one-time birthday set: only allow if currently null
  let currentBirthday = null;
  try {
    const [[row]] = await pool.query("SELECT cumpleanos FROM usuarios WHERE id = ? LIMIT 1", [id]);
    currentBirthday = row?.cumpleanos || null;
  } catch {}

  const fields = [];
  const params = [];
  if (documento !== undefined) { fields.push('documento = ?'); params.push(documento || null); }
  if (telefono !== undefined) { fields.push('telefono = ?'); params.push(telefono ? String(telefono) : null); }
  if (tipo_doc_id !== undefined) { fields.push('tipo_doc_id = ?'); params.push(tipo_doc_id || null); }
  if (cumpleanos !== undefined && !currentBirthday) { fields.push('cumpleanos = ?'); params.push(cumpleanos || null); }
  if (fields.length === 0) return await User.findById(id);
  const sql = `UPDATE usuarios SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
  params.push(id);
  await pool.query(sql, params);
  return await User.findById(id);
};

module.exports = User;

User.searchByTerm = async function (term, limit = 15) {
  if (!term || !term.trim()) return [];
  const like = `%${term.trim().toLowerCase()}%`;
  const likeRaw = `%${term.trim()}%`;
  const size = Number.isFinite(Number(limit)) ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50) : 15;
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.documento, u.tipo_doc_id, u.cumpleanos,
            COALESCE(r.nombre,'Customer') as role
       FROM usuarios u
  LEFT JOIN roles_x_usuarios rxu ON rxu.usuario_id = u.id
  LEFT JOIN roles r ON r.id = rxu.role_id
      WHERE LOWER(u.nombre) LIKE ?
         OR LOWER(u.correo) LIKE ?
         OR u.documento LIKE ?
      ORDER BY u.nombre ASC
      LIMIT ?`,
    [like, like, likeRaw, size]
  );
  return rows.map((row) => ({
    _id: row.id,
    name: row.nombre,
    email: row.correo,
    phone: row.telefono ? String(row.telefono) : null,
    document: row.documento || null,
    docTypeId: row.tipo_doc_id || null,
    birthday: row.cumpleanos || null,
    role: row.role || "Customer",
  }));
};

// Assign or update a user's role mapping in roles_x_usuarios (and usuarios_passwords.role if present)
User.setRole = async function (userId, roleName) {
  if (!userId || !roleName) return;
  const normalized = String(roleName).trim();
  if (!normalized) return;
  // Ensure role exists, create once if missing (case-insensitive)
  let roleId = null;
  const [[roleRow]] = await pool.query(
    "SELECT id FROM roles WHERE LOWER(nombre) = LOWER(?) LIMIT 1",
    [normalized]
  );
  if (roleRow?.id) {
    roleId = roleRow.id;
  } else {
    const [insRole] = await pool.query(
      "INSERT INTO roles (nombre, created_at, updated_at) VALUES (?, NOW(), NOW())",
      [normalized]
    );
    roleId = insRole.insertId;
  }

  // Replace current mapping to this role as primary mapping
  try {
    await pool.query("DELETE FROM roles_x_usuarios WHERE usuario_id = ?", [userId]);
  } catch {}
  await pool.query(
    `INSERT INTO roles_x_usuarios (usuario_id, role_id, created_at, updated_at)
     VALUES (?, ?, NOW(), NOW())`,
    [userId, roleId]
  );

  // No legacy password table update
};

// Update social_id only if empty
User.updateSocialIdIfEmpty = async function (userId, socialId) {
  if (!userId || !socialId) return;
  try {
    await pool.query(
      "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS social_id VARCHAR(255) NOT NULL DEFAULT ''"
    );
  } catch {}
  await pool.query(
    "UPDATE usuarios SET social_id = ? WHERE id = ? AND (social_id IS NULL OR social_id = '')",
    [socialId, userId]
  );
};
