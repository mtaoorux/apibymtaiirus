// ============================================================
// Munil Sir Proxy Server — Render Deployment Edition
// API Base: https://munilsirapi.akamai.net.in
// Site:     https://study.munilsir.com
// ============================================================

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();

// Render assigns PORT dynamically
const PORT = process.env.PORT || 3001;

// Trust Render's proxy (fixes req.ip for rate limiter)
app.set('trust proxy', 1);

// ============================================================
// ✅ CORS — FIRST
// ============================================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['*'],
    credentials: false,
    optionsSuccessStatus: 204
}));

app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
});

// ============================================================
// 🛡️ Per-IP rate limiter
// ============================================================
const IP_WINDOW_MS = 60 * 1000;
const IP_MAX_REQUESTS = 120;
const ipHits = new Map();

app.use((req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    let entry = ipHits.get(ip);
    if (!entry || now > entry.reset) {
        entry = { count: 0, reset: now + IP_WINDOW_MS };
        ipHits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > IP_MAX_REQUESTS) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Too many requests from your IP, slow down.' });
    }
    next();
});

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of ipHits.entries()) {
        if (now > v.reset) ipHits.delete(k);
    }
}, 60 * 1000).unref();

// ============================================================
// ⚡ Keep-alive agents
// ============================================================
const httpAgent = new http.Agent({
    keepAlive: true, keepAliveMsecs: 30000, maxSockets: 50, maxFreeSockets: 10
});
const httpsAgent = new https.Agent({
    keepAlive: true, keepAliveMsecs: 30000, maxSockets: 50, maxFreeSockets: 10
});

// ============================================================
// ⚡ In-memory cache (15 min TTL)
// ============================================================
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > CACHE_TTL_MS) { cache.delete(key); return null; }
    return entry.v;
}
function cacheSet(key, value) {
    cache.set(key, { v: value, t: Date.now() });
    if (cache.size > 500) {
        const now = Date.now();
        for (const [k, e] of cache.entries()) {
            if (now - e.t > CACHE_TTL_MS) cache.delete(k);
        }
    }
}

// ============================================================
// ⚡ Upstream rate limiter + queue
// ============================================================
const RATE_LIMIT = {
    maxRequests: 3, windowMs: 1000, queue: [],
    activeCount: 0, windowStart: Date.now(), requestCount: 0,
};
let windowTimer = null;

function enqueueRequest(fn) {
    return new Promise((resolve, reject) => {
        RATE_LIMIT.queue.push({ fn, resolve, reject });
        processQueue();
    });
}

function processQueue() {
    if (RATE_LIMIT.queue.length === 0) return;
    if (RATE_LIMIT.activeCount >= RATE_LIMIT.maxRequests) return;

    const now = Date.now();
    if (now - RATE_LIMIT.windowStart >= RATE_LIMIT.windowMs) {
        RATE_LIMIT.windowStart = now;
        RATE_LIMIT.requestCount = 0;
    }
    if (RATE_LIMIT.requestCount >= RATE_LIMIT.maxRequests) {
        if (!windowTimer) {
            const waitMs = RATE_LIMIT.windowMs - (now - RATE_LIMIT.windowStart);
            windowTimer = setTimeout(() => { windowTimer = null; processQueue(); }, waitMs + 50);
        }
        return;
    }
    const item = RATE_LIMIT.queue.shift();
    if (!item) return;
    RATE_LIMIT.activeCount++;
    RATE_LIMIT.requestCount++;
    Promise.resolve().then(() => item.fn())
        .then((r) => item.resolve(r))
        .catch((e) => item.reject(e))
        .finally(() => { RATE_LIMIT.activeCount--; setImmediate(processQueue); });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// 🔑 Credentials
// ============================================================
const MUNILSIR_API_BASE = process.env.MUNILSIR_API_BASE || 'https://munilsirapi.akamai.net.in';
const MUNILSIR_ORIGIN   = process.env.MUNILSIR_ORIGIN   || 'https://study.munilsir.com';

const AUTH = process.env.MUNILSIR_AUTH ||
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMjMzOSIsInRpbWVzdGFtcCI6MTc3OTkyMDc2MCwiaXZfdmVyIjo1LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFeU1qTXpPU0lzSW1WdFlXbHNJam9pYlc5c2FXc3VPWGhBWjIxaGFXd3VZMjl0SWl3aWJtRnRaU0k2SWsxdmJHbHJJRXRwY21GeUlpd2lkR1Z1WVc1MFZIbHdaU0k2SW5WelpYSWlMQ0owWlc1aGJuUk9ZVzFsSWpvaWJYVnVhV3h6YVhKZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkpIYjZsWllNMk9WcWxqWGtMZkZTWV83NkpYMkQ3TXYyYUlKRThzSndtOWsifQ.Rc62G9Y1nopPktxbt9Ot2A6MmhW6YeX5SSvGz2SwYf8";

const USER_ID = process.env.MUNILSIR_ID || "122339";

const AES_KEY_TEXT = process.env.AES_KEY_TEXT || "638udh3829162018";
const AES_IV_TEXT  = process.env.AES_IV_TEXT  || "fedcba9876543210";

// ============================================================
// Helpers
// ============================================================
function getOriginHeaders() {
    return {
        accept: "*/*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "en-US,en;q=0.9",
        "auth-key": "appxapi",
        "client-service": "Appx",
        "device-type": "",
        "user-Id": USER_ID,
        authorization: AUTH,
        origin: MUNILSIR_ORIGIN,
        referer: MUNILSIR_ORIGIN + "/",
        "user-agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
    };
}

// ============================================================
// AES-128-CBC Decryption
// ============================================================
function decryptLink(encryptedText) {
    if (typeof encryptedText !== "string" || !encryptedText.length)
        throw new Error("decryptLink: input must be a non-empty string");
    const firstPart = encryptedText.split(":")[0];
    const encryptedBytes = Buffer.from(firstPart, "base64");
    if (!encryptedBytes.length || encryptedBytes.length % 16 !== 0)
        throw new Error("decryptLink: ciphertext length must be a multiple of 16");
    const key = Buffer.from(AES_KEY_TEXT, "utf8");
    const iv  = Buffer.from(AES_IV_TEXT,  "utf8");
    if (key.length !== 16) throw new Error("AES key must be 16 bytes");
    if (iv.length  !== 16) throw new Error("AES IV must be 16 bytes");

    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    decipher.setAutoPadding(true);
    try {
        return Buffer.concat([decipher.update(encryptedBytes), decipher.final()]).toString("utf8");
    } catch {
        const decipher2 = crypto.createDecipheriv("aes-128-cbc", key, iv);
        decipher2.setAutoPadding(false);
        let raw = Buffer.concat([decipher2.update(encryptedBytes), decipher2.final()]);
        if (raw.length > 0) {
            const pad = raw[raw.length - 1];
            if (pad > 0 && pad <= 16 && pad <= raw.length) {
                const tail = raw.slice(-pad);
                if (tail.every((b) => b === pad)) raw = raw.slice(0, raw.length - pad);
            }
        }
        return raw.toString("utf8");
    }
}

const DECRYPT_FIELDS = new Set([
    "file_link","pdf_link","video_link","url","link","encrypted_url",
    "video_url","download_link","attachment","file",
]);

function looksEncrypted(value) {
    if (typeof value !== "string") return false;
    if (value.length < 24) return false;
    if (!/^[A-Za-z0-9+/=_-]+$/.test(value.split(":")[0])) return false;
    try {
        const buf = Buffer.from(value.split(":")[0], "base64");
        return buf.length > 0 && buf.length % 16 === 0;
    } catch { return false; }
}

function decryptFields(node) {
    if (node === null || node === undefined) return node;
    if (Array.isArray(node)) return node.map(decryptFields);
    if (typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === "string") {
                const shouldTry = DECRYPT_FIELDS.has(key) || looksEncrypted(value);
                if (shouldTry) {
                    try { out[key] = decryptLink(value); }
                    catch { out[key] = value; }
                } else out[key] = value;
            } else out[key] = decryptFields(value);
        }
        return out;
    }
    return node;
}

// ============================================================
// ⚡ Upstream fetch
// ============================================================
async function fetchUpstream(targetUrl, retries = 3) {
    const startTime = Date.now();
    return enqueueRequest(async () => {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`📡 [upstream] attempt ${attempt}/${retries}: ${targetUrl}`);
                const response = await axios.get(targetUrl, {
                    headers: getOriginHeaders(),
                    timeout: 30000,
                    maxRedirects: 5,
                    httpAgent, httpsAgent,
                    transformResponse: [(data) => data],
                    validateStatus: (s) => s < 500,
                });
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers['retry-after'] || '0', 10);
                    const waitMs = retryAfter > 0 ? retryAfter * 1000
                        : Math.min(1000 * Math.pow(2, attempt), 30000);
                    console.warn(`⏳ [upstream] 429. Waiting ${waitMs}ms`);
                    if (attempt < retries) { await sleep(waitMs); continue; }
                    const err = new Error('Upstream rate limit exceeded (429)');
                    err.response = response;
                    throw err;
                }
                console.log(`✅ [upstream] done in ${Date.now() - startTime}ms`);
                return response;
            } catch (err) {
                lastError = err;
                if (err.response && err.response.status >= 400
                    && err.response.status < 500 && err.response.status !== 429) {
                    throw err;
                }
                if (attempt < retries) {
                    const backoff = Math.min(500 * Math.pow(2, attempt - 1), 8000);
                    await sleep(backoff);
                }
            }
        }
        throw lastError;
    });
}

function sendError(res, error, extra = {}) {
    const status = error.response?.status ?? 500;
    if (status === 429) res.set('Retry-After', '10');
    res.status(status).json({
        success: false, error: error.message, status,
        data: error.response?.data ?? null, ...extra,
    });
}

// ============================================================
// Batches
// ============================================================
const batches = [
    { id: 86, title: "Munil Sir — Main Batch", imageUrl: "", price: "Free", originalPrice: "", discount: "" },
];
function findBatch(id) { return batches.find((b) => b.id === Number(id)) || null; }

// ============================================================
// ROUTES
// ============================================================
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        platform: "Munil Sir",
        api: MUNILSIR_API_BASE,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        cacheSize: cache.size,
        queueLength: RATE_LIMIT.queue.length,
        activeUpstream: RATE_LIMIT.activeCount,
    });
});

app.get("/", (req, res) => {
    res.json({
        name: "Munil Sir Proxy Server",
        platform: "study.munilsir.com",
        api: MUNILSIR_API_BASE,
        status: "running",
        cacheSize: cache.size,
        routes: [
            "/health", "/batches",
            "/decrypt?text=<encrypted>",
            "/detail?id=<batchId>",
            "/folder_contents?course_id=&folder_id=&decrypt=1",
            "/video_details?course_id=&video_id=&decrypt=1",
            "/vib/*  (generic proxy)"
        ]
    });
});

app.get("/batches", (req, res) => {
    res.json({ success: true, count: batches.length, batches });
});

app.get("/decrypt", (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: "Missing required query param: text" });
        res.json({ success: true, decrypted: decryptLink(text) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get("/detail", async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "Missing required query param: id" });
        const batch = findBatch(id);
        if (!batch) return res.status(404).json({
            error: "Batch not found", id, available: batches.map((b) => b.id)
        });

        const cacheKey = `detail:${batch.id}`;
        const cached = cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const targetUrl = `${MUNILSIR_API_BASE}/get/folder_contentsv3`
            + `?course_id=${encodeURIComponent(batch.id)}`
            + `&parent_id=0&windowsapp=false&start=0`;

        const response = await fetchUpstream(targetUrl);
        let payload = response.data;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
        payload = decryptFields(payload);

        const result = { success: true, batch, contents: payload };
        cacheSet(cacheKey, result);
        res.json(result);
    } catch (error) {
        sendError(res, error, { elapsedMs: Date.now() - startTime });
    }
});

app.get("/folder_contents", async (req, res) => {
    const startTime = Date.now();
    try {
        const { course_id, folder_id, parent_id, decrypt } = req.query;
        if (!course_id) return res.status(400).json({ error: "Missing required query param: course_id" });

        const folderId = folder_id ?? parent_id ?? '-1';
        const cacheKey = `folder:${course_id}:${folderId}:${decrypt || 0}`;
        const cached = cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const targetUrl = `${MUNILSIR_API_BASE}/get/folder_contentsv3`
            + `?course_id=${encodeURIComponent(course_id)}`
            + `&parent_id=${encodeURIComponent(folderId)}`
            + `&windowsapp=false&start=0`;

        const response = await fetchUpstream(targetUrl);
        let payload = response.data;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
        if (decrypt === "1" || decrypt === "true") payload = decryptFields(payload);

        cacheSet(cacheKey, payload);
        res.json(payload);
    } catch (error) {
        sendError(res, error, { elapsedMs: Date.now() - startTime });
    }
});

app.get("/video_details", async (req, res) => {
    try {
        const { course_id, video_id, ytflag = "0",
                folder_wise_course = "1", lc_app_api_url = "", decrypt } = req.query;
        if (!course_id || !video_id) return res.status(400).json({
            error: "Missing required query params: course_id and video_id"
        });

        const cacheKey = `video:${course_id}:${video_id}:${decrypt || 0}`;
        const cached = cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const targetUrl = `${MUNILSIR_API_BASE}/get/fetchVideoDetailsById`
            + `?course_id=${encodeURIComponent(course_id)}`
            + `&video_id=${encodeURIComponent(video_id)}`
            + `&ytflag=${encodeURIComponent(ytflag)}`
            + `&folder_wise_course=${encodeURIComponent(folder_wise_course)}`
            + `&lc_app_api_url=${encodeURIComponent(lc_app_api_url)}`;

        const response = await fetchUpstream(targetUrl);
        let payload = response.data;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
        if (decrypt === "1" || decrypt === "true") payload = decryptFields(payload);

        cacheSet(cacheKey, payload);
        res.json(payload);
    } catch (error) {
        sendError(res, error);
    }
});

app.get("/vib/*", async (req, res) => {
    try {
        const endpointPath = req.originalUrl.replace(/^\/vib/, "");
        const targetUrl = `${MUNILSIR_API_BASE}${endpointPath}`;
        const cacheKey = `vib:${endpointPath}`;
        const cached = cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const response = await fetchUpstream(targetUrl);
        let payload = response.data;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
        if (req.query.decrypt === "1" || req.query.decrypt === "true") {
            payload = decryptFields(payload);
        }
        cacheSet(cacheKey, payload);
        res.json(payload);
    } catch (error) {
        sendError(res, error);
    }
});

// 404 + Error handler
app.use((req, res) => {
    res.status(404).json({ error: "Route not found", path: req.path });
});
app.use((err, req, res, next) => {
    console.error("❌ Unhandled error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Munil Sir Proxy on port ${PORT}`);
    console.log(`   API: ${MUNILSIR_API_BASE}`);
    console.log(`   Site: ${MUNILSIR_ORIGIN}`);
});

module.exports = app;
