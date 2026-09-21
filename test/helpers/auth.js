import jwt from "jsonwebtoken";

// Emits a JWT with the same payload shape the app produces, signed with the
// test secret, for use as `Authorization: Bearer` in Supertest requests.
export function tokenFor(user, { expiresIn = "1d", secret = process.env.JWT_SECRET } = {}) {
  const payload = {
    _id: user._id ?? user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  return jwt.sign(payload, secret, { expiresIn });
}

export function authHeaders(user, opts = {}) {
  return { Authorization: `Bearer ${tokenFor(user, opts)}` };
}
