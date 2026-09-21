const createHttpError = require("http-errors");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const User = require("../models/userModel");


const isVerifiedUser = async (req, res, next) => {
    try{
        // Guest mode: allow limited access when explicitly requested
        const wantsGuest = String(req.headers['x-guest'] || req.query.guest || '').toLowerCase() === '1' || req.query.guest === true || req.query.guest === 'true';
        let token = req.cookies?.accessToken;
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        if (!token && authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if(!token){
            if (wantsGuest) {
                req.user = { _id: null, role: 'Customer', guest: true, name: 'Invitado' };
                return next();
            }
            const error = createHttpError(401, "Please provide token!");
            return next(error);
        }

        const decodeToken = jwt.verify(token, config.accessTokenSecret);

        const user = await User.findById(decodeToken._id);
        if(!user){
            const error = createHttpError(401, "User not exist!");
            return next(error);
        }

        req.user = user;
        next();

    }catch {
        const err = createHttpError(401, "Invalid Token!");
        next(err);
    }
}

const normalizeRole = (v) => String(v || "").trim().toLowerCase();

const ROLE_ALIASES = {
    'administrator': 'admin',
    'administrador': 'admin',
    'cajero': 'cashier',
    'mesero': 'waiter',
    'cliente': 'customer',
    'client': 'customer'
};

const resolveRole = (role) => {
    const normalized = normalizeRole(role);
    // Justificación: Object.hasOwn evita lookups heredados del prototype
    // (p. ej. 'toString' devolvía una función); el acceso computado restante
    // es seguro porque normalized es un string trim/lowercase sin '.'/'__proto__'.
    // eslint-disable-next-line security/detect-object-injection
    return Object.hasOwn(ROLE_ALIASES, normalized) ? ROLE_ALIASES[normalized] : normalized;
};

const authorizeRoles = (...allowed) => {
    const allowSet = new Set(allowed.map(resolveRole));
    return (req, res, next) => {
        const role = resolveRole(req?.user?.role || '');
        if (!role) return next(createHttpError(403, 'Forbidden'));
        if (!allowSet.has(role)) return next(createHttpError(403, 'Forbidden'));
        next();
    }
}

module.exports = { isVerifiedUser, authorizeRoles, normalizeRole, resolveRole };
