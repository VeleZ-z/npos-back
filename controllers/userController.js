const createHttpError = require("http-errors");
const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { pool } = require("../config/mysql");
const { OAuth2Client } = require("google-auth-library");
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

// Obtain and determine the domain for roles and alerts by domain in case that the company obtains a domain or a workspace with a domain.
// Example: @udea.edu.co

function getEmailDomain(email) {
    const at = String(email || '').split('@');
    return at.length === 2 ? at[1].toLowerCase() : '';
}

function determineRoleByEmail(email) {
    const roleCfg = config.authRoles || {};
    const domain = getEmailDomain(email);
    const inList = (list, val) => Array.isArray(list) && list.some(e => String(e).toLowerCase() === String(val).toLowerCase());

    if (inList(roleCfg.adminEmails, email) || inList(roleCfg.adminDomains, domain)) {
        return 'Admin';
    }
    if (inList(roleCfg.cashierEmails, email) || inList(roleCfg.cashierDomains, domain)) {
        // Spanish alias support
        return 'Cashier';
    }
    return roleCfg.defaultRole || 'Customer';
}

const register = async (req, res, next) => {
    try {

        const { name, phone, email, password, role } = req.body;

        if(!name || !phone || !email || !password || !role){
            const error = createHttpError(400, "All fields are required!");
            return next(error);
        }

        const isUserPresent = await User.findOne({email});
        if(isUserPresent){
            const error = createHttpError(400, "User already exist!");
            return next(error);
        }


        const user = { name, phone, email, password, role };
        const newUser = User(user);
        await newUser.save();

        res.status(201).json({success: true, message: "New user created!", data: newUser});


    } catch (error) {
        next(error);
    }
}


const login = async (req, res, next) => {

    try {
        
        const { email, password } = req.body;

        if(!email || !password) {
            const error = createHttpError(400, "All fields are required!");
            return next(error);
        }

        const isUserPresent = await User.findOne({email});
        if(!isUserPresent || !isUserPresent.password){
            const error = createHttpError(401, "Invalid Credentials");
            return next(error);
        }

        const isMatch = await bcrypt.compare(password, String(isUserPresent.password));
        if(!isMatch){
            const error = createHttpError(401, "Invalid Credentials");
            return next(error);
        }

        const accessToken = jwt.sign({_id: isUserPresent._id}, config.accessTokenSecret, {
            expiresIn : '1d'
        });

        const cookieOpts = {
            maxAge: 1000 * 60 * 60 * 24 * 30,
            httpOnly: true,
            sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
            secure: config.nodeEnv === 'production'
        };
        res.cookie('accessToken', accessToken, cookieOpts)

        res.status(200).json({
            success: true, 
            message: "User login successfully!", 
            data: isUserPresent,
            token: accessToken  
        });


    } catch (error) {
        next(error);
    }

}

const getUserData = async (req, res, next) => {
    try {
        
        const user = await User.findById(req.user._id);
        res.status(200).json({success: true, data: user});

    } catch (error) {
        next(error);
    }
}

const logout = async (req, res, next) => {
    try {
        
        res.clearCookie('accessToken');
        res.status(200).json({success: true, message: "User logout successfully!"});

    } catch (error) {
        next(error);
    }
}




const googleLogin = async (req, res, next) => {
    try {
        const { idToken, credential, token, state } = req.body || {};
        const gToken = idToken || credential || token;

        if (!gToken) {
            const error = createHttpError(400, "Google ID token is required");
            return next(error);
        }
        if (!state) {
            return next(createHttpError(400, "Missing state"));
        }
        if (!googleClient || !config.googleClientId) {
            const error = createHttpError(500, "Google auth not configured: set GOOGLE_CLIENT_ID");
            return next(error);
        }

        // Validate and consume state (one-time use)
        const [[row]] = await pool.query("SELECT expiration FROM cache WHERE `key` = ? LIMIT 1", [`oauth_state:${state}`]);
        const now = Math.floor(Date.now()/1000);
        if (!row || !(row.expiration > now)) {
            return next(createHttpError(400, "Invalid or expired state"));
        }
        await pool.query("DELETE FROM cache WHERE `key` = ?", [`oauth_state:${state}`]);

        const ticket = await googleClient.verifyIdToken({
            idToken: gToken,
            audience: config.googleClientId
        });
        const payload = ticket.getPayload();

        const email = payload?.email;
        const name = payload?.name || payload?.given_name || "User";
        const emailVerified = payload?.email_verified;
        if (!email || emailVerified === false) {
            const error = createHttpError(401, "Google token missing verified email");
            return next(error);
        }

        let user = await User.findOne({ email });
        const resolvedRole = determineRoleByEmail(email);
        if (!user) {
            const newUser = User({ name, phone: null, email, role: resolvedRole, socialId: payload?.sub || null });
            await newUser.save();
            user = {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                role: newUser.role
            };
        } else {
            if (!user.socialId && payload?.sub) {
                try { await User.updateSocialIdIfEmpty(user._id, payload.sub); } catch {}
            }
            if (user.role !== resolvedRole) {
                await User.setRole(user._id, resolvedRole);
                user.role = resolvedRole;
            }
        }

        const accessToken = jwt.sign({ _id: user._id }, config.accessTokenSecret, {
            expiresIn: '1d'
        });

        const cookieOpts = {
            maxAge: 1000 * 60 * 60 * 24 * 30,
            httpOnly: true,
            sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
            secure: config.nodeEnv === 'production'
        };
        res.cookie('accessToken', accessToken, cookieOpts);

        res.status(200).json({
            success: true,
            message: 'Google login successful',
            data: user,
            token: accessToken
        });

    } catch (error) {
        next(createHttpError(401, error.message || 'Google authentication failed'));
    }
}


module.exports = { register, login, getUserData, logout, googleLogin }

// Additional endpoints: document types and profile update
module.exports.searchUsers = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    if (!q) {
      return res.status(200).json({ success: true, data: [] });
    }
    const users = await User.searchByTerm(q, limit);
    res.status(200).json({ success: true, data: users });
  } catch (e) { next(e); }
};

module.exports.getDocTypes = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id as _id, tipo_doc as name FROM documentos ORDER BY tipo_doc ASC");
    res.status(200).json({ success: true, data: rows });
  } catch (e) { next(e); }
};

module.exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return next(createHttpError(401, 'Unauthorized'));
    const { documento, telefono, tipo_doc_id, cumpleanos } = req.body || {};
    const updated = await User.updateProfileById(userId, {
      documento: documento ?? undefined,
      telefono: telefono ?? undefined,
      tipo_doc_id: tipo_doc_id ?? undefined,
      cumpleanos: cumpleanos ?? undefined,
    });
    res.status(200).json({ success: true, data: updated });
  } catch (e) { next(e); }
};

// Admin: list all users
module.exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.findAll();
    res.status(200).json({ success: true, data: users });
  } catch (e) { next(e); }
};

// Admin: update user fields
module.exports.adminUpdateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, 'Missing user id'));
    const { documento, telefono, tipo_doc_id, cumpleanos, estado_id } = req.body || {};
    const updated = await User.updateByAdmin(Number(id), { documento, telefono, tipo_doc_id, cumpleanos, estado_id });
    res.status(200).json({ success: true, data: updated });
  } catch (e) { next(e); }
};

// Admin: set user role
module.exports.adminSetUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!id || !role) return next(createHttpError(400, 'Missing id or role'));
    await User.setRole(Number(id), role);
    const user = await User.findById(Number(id));
    res.status(200).json({ success: true, data: user });
  } catch (e) { next(e); }
};

// Admin: list roles
module.exports.getRoles = async (req, res, next) => {
  try {
    const roles = await User.listRoles();
    res.status(200).json({ success: true, data: roles });
  } catch (e) { next(e); }
};
