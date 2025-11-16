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

    }catch (error) {
        const err = createHttpError(401, "Invalid Token!");
        next(err);
    }
}

const normalize = (v) => String(v || "").trim().toLowerCase();

const authorizeRoles = (...allowed) => {
    const allowSet = new Set(allowed.map(normalize));
    return (req, res, next) => {
        const role = normalize(req?.user?.role || '');
        if (!role) return next(createHttpError(403, 'Forbidden'));
        if (!allowSet.has(role)) return next(createHttpError(403, 'Forbidden'));
        next();
    }
}

module.exports = { isVerifiedUser, authorizeRoles };
