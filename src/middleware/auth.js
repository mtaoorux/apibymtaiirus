
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "change-me-please";

/**
 * Protects admin routes.
 * Reads token from cookie OR Authorization: Bearer <token> header.
 * On failure: JSON 401 for API routes, redirect for browser routes.
 */
function requireAdmin(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization || "").replace("Bearer ", "");

  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    const wantsJson =
      req.path.startsWith("/admin/api") ||
      (req.headers.accept || "").includes("application/json");

    if (wantsJson) {
      return res.status(401).json({ error: "Unauthorized — please login at /admin/login" });
    }
    return res.redirect("/admin/login");
  }
}

module.exports = { requireAdmin };
