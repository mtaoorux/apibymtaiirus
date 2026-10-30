require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

// ================== CONFIG ==================
const PW_API_BASE   = process.env.PW_API_BASE   || 'https://a.pimaxer.in';
const BOT_TOKEN     = process.env.BOT_TOKEN;
const CHANNEL_ID    = process.env.CHANNEL_ID    || '@merate_official2026lala';
const LOCAL_API     = process.env.LOCAL_API     || 'http://localhost:8081';
const PAGE_LIMIT    = parseInt(process.env.PAGE_LIMIT    || '1', 10);
const SLEEP_BETWEEN = parseInt(process.env.SLEEP_BETWEEN || '3000', 10);
const KEEP_LOCAL_MP4 = (process.env.KEEP_LOCAL_MP4 || 'false') === 'true';

const WORK_DIR = path.resolve('./lectures');
if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN missing in .env');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ================== PW API ==================
async function getJSON(url, params = {}) {
  const { data } = await axios.get(url, { params, timeout: 30000 });
  return data;
}

async function getBatches(page = 1, limit = 20) {
  const j = await getJSON(`${PW_API_BASE}/v1/batches`, { page, limit });
  return j.data || [];
}

async function getSubjects(batchId) {
  const j = await getJSON(`${PW_API_BASE}/v1/${batchId}/get-batch-subjects`);
  return j.data || [];
}

async function getTopics(batchId, subjectId) {
  const j = await getJSON(`${PW_API_BASE}/v1/${batchId}/subject/${subjectId}/topics`, { page: 1 });
  return j.data || [];
}

async function getContents(batchId, subjectId, slug) {
  const j = await getJSON(
    `${PW_API_BASE}/v1/${batchId}/subject/${subjectId}/contents`,
    { page: 1, tag: slug, contentType: 'videos' }
  );
  return j.data || [];
}

// ================== MPD → MP4 ==================
function runFFmpeg(args) {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => resolve({ code, stderr }));
    proc.on('error', (err) => resolve({ code: -1, stderr: err.message }));
  });
}

async function mpdToMp4(mpdUrl, outPath) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    console.log(`    ⏭️  Exists: ${path.basename(outPath)}`);
    return true;
  }

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-rw_timeout', '30000000',
    '-i', mpdUrl,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c', 'copy', '-movflags', '+faststart',
    outPath,
  ];
  console.log(`    🎬 Building file: ${path.basename(outPath)}`);
  const { code, stderr } = await runFFmpeg(args);
  if (code !== 0) {
    console.log(`    ❌ FFmpeg: ${stderr.trim().slice(-400)}`);
    return false;
  }
  const sizeMb = fs.statSync(outPath).size / 1024 / 1024;
  console.log(`    ✔ Ready: ${sizeMb.toFixed(1)} MB`);
  return true;
}

// ================== Upload FILE to Telegram ==================
async function uploadFileAsVideo(mp4Path, caption) {
  const url = `${LOCAL_API}/bot${BOT_TOKEN}/sendVideo`;
  const sizeMb = fs.statSync(mp4Path).size / 1024 / 1024;
  console.log(`    ⬆️  Uploading file: ${path.basename(mp4Path)} (${sizeMb.toFixed(1)} MB)`);

  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  form.append('caption', caption.slice(0, 1024));
  form.append('supports_streaming', 'true');
  form.append('video', fs.createReadStream(mp4Path), {
    filename: path.basename(mp4Path),
    contentType: 'video/mp4',
  });

  try {
    const { data } = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 3600 * 1000, // 1 hour
    });
    if (data.ok) {
      console.log(`    ✅ message_id=${data.result.message_id}`);
      return true;
    }
    console.log(`    ❌ Rejected: ${data.description || JSON.stringify(data)}`);
    return false;
  } catch (err) {
    const desc = err.response?.data?.description || err.message;
    console.log(`    ❌ Upload error: ${desc}`);
    return false;
  }
}

// ================== Pipeline ==================
function safeName(text) {
  return (text || 'lecture')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .slice(0, 60)
    .trim() || 'lecture';
}

async function processBatch(batch) {
  const bid = batch._id;
  const bname = batch.name;
  console.log(`\n📚 Batch: ${bname}`);

  const subjects = await getSubjects(bid);
  for (const subj of subjects) {
    const sid = subj._id;
    const sname = subj.subjectName;
    console.log(`  📖 ${sname}`);

    const topics = await getTopics(bid, sid);
    for (const topic of topics) {
      const slug = topic.slug;
      console.log(`    📂 ${topic.name}`);

      const contents = await getContents(bid, sid, slug);
      for (const item of contents) {
        const title = item.topic || 'Untitled';
        const mpd = item.url || '';
        if (!mpd.endsWith('.mpd')) {
          console.log(`    ⚠️  Skip non-MPD: ${title}`);
          continue;
        }

        const outPath = path.join(WORK_DIR, `${safeName(title)}.mp4`);

        // STEP 1: build actual video file on disk
        const built = await mpdToMp4(mpd, outPath);
        if (!built) continue;

        // STEP 2: upload the FILE bytes (not a link)
        const caption = `**${title}**\n\n📚 ${bname}\n📖 ${sname}`;
        const ok = await uploadFileAsVideo(outPath, caption);

        // STEP 3: cleanup
        if (ok && !KEEP_LOCAL_MP4) {
          try { fs.unlinkSync(outPath); } catch (_) {}
        }

        await sleep(SLEEP_BETWEEN);
      }
    }
  }
}

async function checkHealth() {
  try {
    const j = await getJSON(`${PW_API_BASE}/health`);
    const t = j.token || {};
    console.log(`🔑 PW token user=${t.username} expired=${t.expired} expires_at=${t.expires_at}`);
    return !t.expired;
  } catch (err) {
    console.log(`❌ PW health check failed: ${err.message}`);
    return false;
  }
}

async function main() {
  if (!(await checkHealth())) {
    console.error('❌ PW token expired or API unreachable — aborting.');
    process.exit(1);
  }

  const batches = await getBatches(1, PAGE_LIMIT);
  console.log(`📦 ${batches.length} batch(es)`);

  for (const b of batches) {
    try {
      await processBatch(b);
    } catch (err) {
      console.log(`❌ Batch ${b.name} crashed: ${err.message}`);
    }
  }
  console.log('\n🏁 Done.');
}

main();
