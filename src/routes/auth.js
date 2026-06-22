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
    // req.path is relative to mount point; use originalUrl to check the full path
    const isApiRoute =
      req.originalUrl.includes("/admin/api") ||
      req.originalUrl.startsWith("/api/") ||
      (req.headers.accept || "").includes("application/json") ||
      (req.headers["content-type"] || "").includes("application/json");

    if (isApiRoute) {
      return res.status(401).json({ error: "Unauthorized", hint: "Login at /admin/login" });
    }
    return res.redirect("/admin/login");
  }
}

module.exports = { requireAdmin };
