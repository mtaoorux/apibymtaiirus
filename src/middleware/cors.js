
/**
 * CORS middleware — open to all origins.
 * Domain whitelist (domainCheck.js) handles access control;
 * CORS just ensures browsers can read the responses.
 */
module.exports = function cors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin",      req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods",     "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",     "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
};
