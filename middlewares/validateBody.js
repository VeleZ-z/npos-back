const createHttpError = require("http-errors");

// Middleware de validación declarativa sobre req.body. Los mensajes de
// campos *faltantes* o de negocio se quedan en los controllers (contrato
// existente); aquí sólo se rechazan cuerpos mal *tipados* (antes 500).
const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path?.join(".") || "body";
    return next(
      createHttpError(
        400,
        `Campo inválido: ${field} (${issue?.message || "formato incorrecto"})`
      )
    );
  }
  req.body = result.data;
  next();
};

module.exports = { validateBody };
