
const router = require("express").Router();
const { db } = require("../db");

// GET /admin/api/domains — list all
router.get("/", async (req, res) => {
  try {
    const docs = await db.domains.find({}).sort({ createdAt: -1 });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/domains — add new
router.post("/", async (req, res) => {
  try {
    let { domain, note } = req.body;
    if (!domain) return res.status(400).json({ error: "domain is required" });

    // Normalize: strip protocol + trailing path
    domain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();

    if (!domain) return res.status(400).json({ error: "Invalid domain" });

    const exists = await db.domains.findOne({ domain });
    if (exists) return res.status(409).json({ error: `"${domain}" is already registered` });

    const doc = await db.domains.insert({
      domain,
      note:      note?.trim() || "",
      active:    true,
      createdAt: new Date(),
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /admin/api/domains/:id — toggle active / update note
router.patch("/:id", async (req, res) => {
  try {
    const { active, note } = req.body;
    const update = {};
    if (active !== undefined) update.active = Boolean(active);
    if (note   !== undefined) update.note   = note.trim();
    if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });

    const count = await db.domains.update({ _id: req.params.id }, { $set: update });
    if (!count) return res.status(404).json({ error: "Domain not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /admin/api/domains/:id
router.delete("/:id", async (req, res) => {
  try {
    const count = await db.domains.remove({ _id: req.params.id });
    if (!count) return res.status(404).json({ error: "Domain not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
