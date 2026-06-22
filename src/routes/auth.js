const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET    || "change-me-please";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASS, 10);

// POST /admin/api/login
router.post("/login", (req, res) => {
  const { password } = req.body;
  if (!password || !bcrypt.compareSync(password, ADMIN_HASH)) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,
    sameSite: "lax",
  });
  res.json({ ok: true, token });
});

// POST /admin/api/logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

module.exports = router;
