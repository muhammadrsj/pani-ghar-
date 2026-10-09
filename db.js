// Tiny file-based JSON datastore.
// NOTE: Render's free-tier disk is ephemeral — it can be wiped on redeploy/restart.
// This is fine to get a real multi-device app working today. Before a serious
// launch, swap this for Render's managed Postgres (see README "Moving to Postgres").
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(FILE)) {
    return { users: {}, requests: [], complaints: [], nextReqId: 101, nextComplaintNo: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('data.json corrupt, starting fresh:', e.message);
    return { users: {}, requests: [], complaints: [], nextReqId: 101, nextComplaintNo: 1 };
  }
}

let data = load();
let saveTimer = null;

function persist() {
  // Debounce writes so many quick changes don't thrash the disk.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  }, 50);
}

module.exports = { data, persist };
