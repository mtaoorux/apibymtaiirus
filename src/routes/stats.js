const router = require("express").Router();
const { db } = require("../db");

// GET /admin/api/stats
router.get("/", async (req, res) => {
  try {
    const [activeDomains, activeInstitutes, totalDomains, allLogs] = await Promise.all([
      db.domains.count({ active: true }),
      db.institutes.count({ active: true }),
      db.domains.count({}),
      db.logs.find({}).sort({ at: -1 }),
    ]);

    const allowed = allLogs.filter(l => l.type === "allowed").length;
    const blocked = allLogs.filter(l => l.type === "blocked").length;

    // Top 5 domains by request count
    const domainCounts = {};
    allLogs.forEach(l => {
      if (l.domain) domainCounts[l.domain] = (domainCounts[l.domain] || 0) + 1;
    });
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    // Recent activity (last 24h)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent   = allLogs.filter(l => new Date(l.at) > since24h).length;

    res.json({
      activeDomains,
      totalDomains,
      activeInstitutes,
      allowed,
      blocked,
      total: allowed + blocked,
      topDomains,
      last24h: recent,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
