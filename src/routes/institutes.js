
const router = require("express").Router();
const { db } = require("../db");

// GET /admin/api/institutes
router.get("/", async (req, res) => {
  try {
    res.json(await db.institutes.find({}).sort({ createdAt: -1 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/institutes
router.post("/", async (req, res) => {
  try {
    let { name, label, target } = req.body;
    if (!name || !target) return res.status(400).json({ error: "name and target are required" });

    name = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!name) return res.status(400).json({ error: "Invalid institute name (use letters, numbers, - _)" });

    // Validate target URL
    try { new URL(target); } catch { return res.status(400).json({ error: "target must be a valid URL" }); }

    const exists = await db.institutes.findOne({ name });
    if (exists) return res.status(409).json({ error: `Institute "${name}" already exists` });

    const doc = await db.institutes.insert({
      name,
      label:     label?.trim() || name,
      target:    target.replace(/\/$/, ""), // strip trailing slash
      active:    true,
      createdAt: new Date(),
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /admin/api/institutes/:id
router.patch("/:id", async (req, res) => {
  try {
    const { active, label, target } = req.body;
    const update = {};
    if (active !== undefined) update.active = Boolean(active);
    if (label  !== undefined) update.label  = label.trim();
    if (target !== undefined) {
      try { new URL(target); } catch { return res.status(400).json({ error: "Invalid target URL" }); }
      update.target = target.replace(/\/$/, "");
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });

    const count = await db.institutes.update({ _id: req.params.id }, { $set: update });
    if (!count) return res.status(404).json({ error: "Institute not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /admin/api/institutes/:id
router.delete("/:id", async (req, res) => {
  try {
    const count = await db.institutes.remove({ _id: req.params.id });
    if (!count) return res.status(404).json({ error: "Institute not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
