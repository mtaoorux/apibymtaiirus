
const router = require("express").Router();
const { db } = require("../db");

// GET /admin/api/logs?limit=200&type=blocked
router.get("/", async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 200, 500);
    const filter = {};
    if (req.query.type)      filter.type      = req.query.type;
    if (req.query.domain)    filter.domain     = req.query.domain;
    if (req.query.institute) filter.institute  = req.query.institute;

    const docs = await db.logs.find(filter).sort({ at: -1 });
    res.json(docs.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /admin/api/logs — clear all logs
router.delete("/", async (req, res) => {
  try {
    const n = await db.logs.remove({}, { multi: true });
    res.json({ ok: true, deleted: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
