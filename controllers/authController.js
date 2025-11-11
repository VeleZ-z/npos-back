const crypto = require("crypto");
const { pool } = require("../config/mysql");
const config = require("../config/config");

const getState = async (req, res, next) => {
  try {
    const state = crypto.randomBytes(24).toString("hex");
    const exp = Math.floor(Date.now() / 1000) + 10 * 60; // 10 minutes
    await pool.query(
      "INSERT INTO cache (`key`, `value`, `expiration`) VALUES (?, ?, ?)",
      [
        `oauth_state:${state}`,
        "1",
        exp
      ]
    );

    const cookieOpts = {
      maxAge: 10 * 60 * 1000,
      httpOnly: true,
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      secure: config.nodeEnv === 'production'
    };
    try { res.cookie('oauth_state', state, cookieOpts); } catch {}

    res.status(200).json({ success: true, state });
  } catch (err) {
    next(err);
  }
};

module.exports = { getState };

