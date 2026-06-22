const Datastore = require("nedb-promises");
const path      = require("path");
const fs        = require("fs");

const DB_DIR = path.join(__dirname, "../../data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = {
  domains:    Datastore.create({ filename: path.join(DB_DIR, "domains.db"),    autoload: true }),
  institutes: Datastore.create({ filename: path.join(DB_DIR, "institutes.db"), autoload: true }),
  logs:       Datastore.create({ filename: path.join(DB_DIR, "logs.db"),       autoload: true }),
  apiKeys:    Datastore.create({ filename: path.join(DB_DIR, "apikeys.db"),    autoload: true }),
};

// Seed default KGS institute on first run
async function seedDefaults() {
  const existing = await db.institutes.findOne({ name: "kgs" });
  if (!existing) {
    await db.institutes.insert({
      name:      "kgs",
      label:     "KGS",
      target:    "https://mtaiiruskgs.lovable.app",
      active:    true,
      createdAt: new Date(),
    });
    console.log("[DB] Seeded default institute: kgs → https://mtaiiruskgs.lovable.app");
  }
}

module.exports = { db, seedDefaults };
