const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { data, persist } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

// ---------- helpers ----------
function sign(user) {
  return jwt.sign({ sub: user.contact }, JWT_SECRET, { expiresIn: '30d' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login zaroori hai' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = data.users[payload.sub];
    if (!user) return res.status(401).json({ error: 'Account nahi mila' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session khatam ho gayi, dobara login karein' });
  }
}
function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}
function normPhone(v, allowLandline) {
  let d = String(v || '').replace(/[\s\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0092') && d.length >= 13) d = '0' + d.slice(4);
  else if (d.startsWith('92') && d.length >= 11) d = '0' + d.slice(2);
  if (/^03[0-4]\d{8}$/.test(d)) return d;
  if (allowLandline && /^021\d{7,8}$/.test(d)) return d;
  return null;
}
function normContact(raw) {
  const v = String(raw || '').trim();
  if (v.includes('@')) {
    const e = v.toLowerCase();
    const ok = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) && !e.includes('..');
    return ok ? e : null;
  }
  return normPhone(v, false);
}

// ---------- auth ----------
app.post('/api/auth/register', (req, res) => {
  const { name, contact, mobile, password, role, district, area } = req.body || {};
  const key = normContact(contact);
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Naam kam az kam 2 characters ka ho' });
  if (!key) return res.status(400).json({ error: 'Invalid email ya number' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password kam az kam 6 characters ka ho' });
  const mob = normPhone(mobile, false) || (/^03\d{9}$/.test(key) ? key : null);
  if (!mob) return res.status(400).json({ error: 'Invalid mobile number' });
  if (!area || !district) return res.status(400).json({ error: 'Ilaqa chunein' });
  if (data.users[key]) return res.status(409).json({ error: 'Yeh account pehle se maujood hai' });

  const user = {
    contact: key, name: name.trim(), phone: mob,
    password: bcrypt.hashSync(password, 10),
    role: role === 'Tanker Provider' ? 'Tanker Provider' : 'Customer',
    district, area, online: true, createdAt: Date.now(),
  };
  data.users[key] = user;
  persist();
  res.json({ token: sign(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { contact, password } = req.body || {};
  const key = normContact(contact);
  const user = key && data.users[key];
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Email/number ya password ghalat hai' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch('/api/me', auth, (req, res) => {
  const { name, mobile, district, area, online } = req.body || {};
  const u = req.user;
  if (name !== undefined) {
    if (name.trim().length < 2) return res.status(400).json({ error: 'Naam kam az kam 2 characters ka ho' });
    u.name = name.trim();
  }
  if (mobile !== undefined) {
    const m = normPhone(mobile, false);
    if (!m) return res.status(400).json({ error: 'Invalid mobile number' });
    u.phone = m;
  }
  if (district !== undefined) u.district = district;
  if (area !== undefined) u.area = area;
  if (online !== undefined) u.online = !!online;
  persist();
  res.json({ user: publicUser(u) });
});

app.patch('/api/me/password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!bcrypt.compareSync(oldPassword || '', req.user.password)) return res.status(400).json({ error: 'Purana password ghalat hai' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Naya password kam az kam 6 characters ka ho' });
  req.user.password = bcrypt.hashSync(newPassword, 10);
  persist();
  res.json({ ok: true });
});

app.delete('/api/me', auth, (req, res) => {
  const key = req.user.contact;
  data.requests.forEach(r => {
    if (r.provider === key && r.status === 'accepted') { r.status = 'pending'; r.provider = null; r.providerName = null; r.providerPhone = null; }
  });
  data.requests = data.requests.filter(r => r.customer !== key);
  data.complaints = data.complaints.filter(c => c.by !== key);
  delete data.users[key];
  persist();
  res.json({ ok: true });
});

// ---------- requests ----------
app.post('/api/requests', auth, (req, res) => {
  const u = req.user;
  const { service, gallons, price, slot, address, phone, district, area } = req.body || {};
  const ph = normPhone(phone, true);
  if (!address || address.trim().length < 5) return res.status(400).json({ error: 'Poora address likhein' });
  if (!ph) return res.status(400).json({ error: 'Invalid phone number' });
  if (!area || !district) return res.status(400).json({ error: 'Delivery ka ilaqa chunein' });
  const r = {
    id: data.nextReqId++, service, gallons, price, slot,
    address: address.trim(), phone: ph, district, area,
    customer: u.contact, customerName: u.name,
    provider: null, providerName: null, providerPhone: null,
    status: 'pending', time: Date.now(),
  };
  data.requests.push(r);
  persist();
  res.json({ request: r });
});

app.get('/api/requests/mine', auth, (req, res) => {
  res.json({ requests: data.requests.filter(r => r.customer === req.user.contact).sort((a, b) => b.time - a.time) });
});

app.get('/api/requests/open', auth, (req, res) => {
  if (req.user.online === false) return res.json({ requests: [] });
  const { district, area } = req.query;
  let list = data.requests.filter(r => r.status === 'pending');
  if (district && district !== 'all') list = list.filter(r => r.district === district);
  if (area && area !== 'all') list = list.filter(r => r.area === area);
  res.json({ requests: list.sort((a, b) => b.time - a.time) });
});

app.get('/api/requests/jobs', auth, (req, res) => {
  res.json({ requests: data.requests.filter(r => r.provider === req.user.contact).sort((a, b) => b.time - a.time) });
});

function findReq(id) { return data.requests.find(r => r.id === Number(id)); }

app.patch('/api/requests/:id/accept', auth, (req, res) => {
  const r = findReq(req.params.id);
  if (!r || r.status !== 'pending') return res.status(409).json({ error: 'Yeh request ab available nahi' });
  r.status = 'accepted'; r.provider = req.user.contact; r.providerName = req.user.name; r.providerPhone = req.user.phone;
  persist();
  res.json({ request: r });
});

app.patch('/api/requests/:id/complete', auth, (req, res) => {
  const r = findReq(req.params.id);
  if (!r || r.status !== 'accepted' || r.provider !== req.user.contact) return res.status(409).json({ error: 'Yeh job aap ki nahi ya pehle se mukammal nahi ho sakti' });
  r.status = 'completed'; r.deliveredAt = Date.now();
  persist();
  res.json({ request: r });
});

app.patch('/api/requests/:id/cancel', auth, (req, res) => {
  const r = findReq(req.params.id);
  if (!r || r.status !== 'pending' || r.customer !== req.user.contact) return res.status(409).json({ error: 'Yeh request cancel nahi ho sakti' });
  r.status = 'cancelled';
  persist();
  res.json({ request: r });
});

app.post('/api/requests/:id/rate', auth, (req, res) => {
  const r = findReq(req.params.id);
  if (!r || r.status !== 'completed' || r.customer !== req.user.contact) return res.status(409).json({ error: 'Rating nahi di ja sakti' });
  const n = Number(req.body && req.body.rating);
  if (!(n >= 1 && n <= 5)) return res.status(400).json({ error: 'Sitare 1 se 5 ke beech chunein' });
  r.rating = n; r.review = ((req.body && req.body.review) || '').trim().slice(0, 500);
  persist();
  res.json({ request: r });
});

app.get('/api/provider/:contact/stats', (req, res) => {
  const done = data.requests.filter(r => r.provider === req.params.contact && typeof r.rating === 'number');
  if (!done.length) return res.json({ stats: null });
  const avg = done.reduce((n, r) => n + r.rating, 0) / done.length;
  res.json({ stats: { avg, n: done.length } });
});

// ---------- complaints ----------
app.post('/api/complaints', auth, (req, res) => {
  const { type, description } = req.body || {};
  if (!description || description.trim().length < 10) return res.status(400).json({ error: 'Kam az kam 10 characters mein tafseel likhein' });
  const c = {
    no: 'C-' + String(data.nextComplaintNo++).padStart(3, '0'),
    type, description: description.trim(),
    by: req.user.contact, district: req.user.district, area: req.user.area, time: Date.now(),
  };
  data.complaints.push(c);
  persist();
  res.json({ complaint: c });
});

app.get('/api/complaints/mine', auth, (req, res) => {
  res.json({ complaints: data.complaints.filter(c => c.by === req.user.contact).sort((a, b) => b.time - a.time) });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

app.listen(PORT, () => console.log('Paani Ghar API listening on port ' + PORT));
