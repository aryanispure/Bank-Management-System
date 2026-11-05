const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: 'BankManagement',
  decimalNumbers: true,   // DECIMAL -> JS number
  dateStrings: true       // DATE -> 'YYYY-MM-DD'
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
class HttpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex'); // same as MySQL SHA2(x,256)
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Mobile, email or username is already registered' });
  console.error(e); res.status(500).json({ error: 'Something went wrong on the server' });
});
async function tx(fn) {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const r = await fn(conn); await conn.commit(); return r; }
  catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}
function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)
    throw new HttpError('Enter a valid amount greater than 0 (max 2 decimals)');
  return Math.round(n * 100) / 100;
}
const need = (cond, msg) => { if (!cond) throw new HttpError(msg); };

// lock one or two account rows in ID order (prevents deadlocks)
async function lock(conn, ...ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const [rows] = await conn.query('SELECT * FROM Account WHERE Account_ID IN (?) ORDER BY Account_ID FOR UPDATE', [sorted]);
  return Object.fromEntries(rows.map(r => [r.Account_ID, r]));
}
function checkDebit(acc, amt) {
  if (amt > acc.Transaction_Limit) throw new HttpError(`Amount exceeds your per-transaction limit of ₹${acc.Transaction_Limit}`);
  if (amt > acc.Account_Amount) throw new HttpError('Insufficient balance');
}
async function verifyPassword(conn, accId, password) {
  const [[a]] = await conn.query('SELECT Password_Hash FROM Account WHERE Account_ID=?', [accId]);
  if (!a || a.Password_Hash !== sha(password || '')) throw new HttpError('Incorrect password', 403);
}

// ---------- sessions (in-memory; use Redis/JWT for production) ----------
const sessions = new Map();
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { sessions.delete(t); return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
  s.exp = Date.now() + 15 * 60 * 1000; // sliding 15-min timeout
  req.acc = s.accId; req.token = t; next();
}
const fails = new Map(); // simple brute-force guard per username

// ---------- auth routes ----------
app.post('/api/register', wrap(async (req, res) => {
  const b = req.body;
  need(b.name && b.name.trim().length >= 2, 'Enter your full name');
  need(/^\d{10}$/.test(b.mobile || ''), 'Mobile number must be 10 digits');
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || ''), 'Enter a valid email');
  need(['Male', 'Female', 'Other'].includes(b.gender), 'Select a gender');
  const age = (Date.now() - new Date(b.dob)) / 31557600000;
  need(age >= 18, 'You must be 18 or older to open an account');
  need(/^[a-zA-Z0-9_]{3,50}$/.test(b.username || ''), 'Username: 3-50 letters, numbers or underscores');
  need((b.password || '').length >= 8, 'Password must be at least 8 characters');
  need((b.secureWord || '').length >= 4, 'Secure word must be at least 4 characters');
  const limit = money(b.limit || 25000);
  const initial = Number(b.initialDeposit || 0);
  need(Number.isFinite(initial) && initial >= 0, 'Initial deposit cannot be negative');

  const out = await tx(async conn => {
    // assign the staff member with the fewest customers
    const [[staff]] = await conn.query(
      `SELECT s.Staff_ID FROM Staff s LEFT JOIN Customer c ON c.Staff_ID=s.Staff_ID
       GROUP BY s.Staff_ID ORDER BY COUNT(c.Customer_ID), s.Staff_ID LIMIT 1`);
    const [c] = await conn.query(
      `INSERT INTO Customer (Customer_Name,Customer_Address,Customer_Mobile_No,Customer_Email,DOB,Gender,Staff_ID)
       VALUES (?,?,?,?,?,?,?)`,
      [b.name.trim(), b.address || null, b.mobile, b.email, b.dob, b.gender, staff ? staff.Staff_ID : null]);
    const [a] = await conn.query(
      `INSERT INTO Account (Customer_ID,Username,Password_Hash,Account_Amount,Transaction_Limit,Secure_Word)
       VALUES (?,?,?,?,?,?)`,
      [c.insertId, b.username, sha(b.password), initial, limit, b.secureWord]);
    if (initial > 0)
      await conn.query(`INSERT INTO Transactions (Account_ID,Transaction_Type,Amount,\`Date\`) VALUES (?, 'Deposit', ?, CURDATE())`, [a.insertId, initial]);
    return a.insertId;
  });
  res.json({ accountId: out });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  const f = fails.get(username) || { n: 0, until: 0 };
  if (f.until > Date.now()) throw new HttpError('Too many attempts. Try again in a few minutes.', 429);
  const [[a]] = await pool.query('SELECT Account_ID, Password_Hash FROM Account WHERE Username=?', [username || '']);
  if (!a || a.Password_Hash !== sha(password || '')) {
    f.n++; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 5 * 60000; } fails.set(username, f);
    throw new HttpError('Incorrect username or password', 401);
  }
  fails.delete(username);
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { accId: a.Account_ID, exp: Date.now() + 15 * 60000 });
  res.json({ token });
}));
app.post('/api/logout', auth, (req, res) => { sessions.delete(req.token); res.json({ ok: true }); });

// ---------- account info ----------
app.get('/api/me', auth, wrap(async (req, res) => {
  const [[r]] = await pool.query(
    `SELECT a.Account_ID, a.Username, a.Account_Amount, a.Transaction_Limit,
            c.Customer_Name, c.Customer_Address, c.Customer_Mobile_No, c.Customer_Email, c.DOB, c.Gender,
            s.Staff_Name, s.Staff_Mobile_No
     FROM Account a JOIN Customer c ON c.Customer_ID=a.Customer_ID
     LEFT JOIN Staff s ON s.Staff_ID=c.Staff_ID WHERE a.Account_ID=?`, [req.acc]);
  res.json(r);
}));
app.get('/api/transactions', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, c.Customer_Name AS Sender_Name FROM Transactions t
     JOIN Account a ON a.Account_ID=t.Account_ID JOIN Customer c ON c.Customer_ID=a.Customer_ID
     WHERE t.Account_ID=? OR t.Receiver_Account=? ORDER BY t.Transaction_ID DESC LIMIT 100`, [req.acc, req.acc]);
  res.json(rows);
}));
app.get('/api/payments', auth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM Payment WHERE Account_ID=? ORDER BY Payment_ID DESC LIMIT 100', [req.acc]);
  res.json(rows);
}));

// ---------- money movement ----------
app.post('/api/deposit', auth, wrap(async (req, res) => {
  const amt = money(req.body.amount);
  await tx(async conn => {
    await lock(conn, req.acc);
    await conn.query('UPDATE Account SET Account_Amount=Account_Amount+? WHERE Account_ID=?', [amt, req.acc]);
    await conn.query(`INSERT INTO Transactions (Account_ID,Transaction_Type,Amount,\`Date\`) VALUES (?, 'Deposit', ?, CURDATE())`, [req.acc, amt]);
  });
  res.json({ message: `Deposited ₹${amt}` });
}));

app.post('/api/withdraw', auth, wrap(async (req, res) => {
  const amt = money(req.body.amount);
  await tx(async conn => {
    const a = (await lock(conn, req.acc))[req.acc]; checkDebit(a, amt);
    await conn.query('UPDATE Account SET Account_Amount=Account_Amount-? WHERE Account_ID=?', [amt, req.acc]);
    await conn.query(`INSERT INTO Transactions (Account_ID,Transaction_Type,Amount,\`Date\`) VALUES (?, 'Withdraw', ?, CURDATE())`, [req.acc, amt]);
  });
  res.json({ message: `Withdrew ₹${amt}` });
}));

app.post('/api/transfer', auth, wrap(async (req, res) => {
  const amt = money(req.body.amount), to = parseInt(req.body.receiver, 10);
  need(to > 0, 'Enter the receiver account number');
  need(to !== req.acc, 'You cannot transfer to your own account');
  const name = await tx(async conn => {
    const accs = await lock(conn, req.acc, to);
    if (!accs[to]) throw new HttpError('Receiver account not found');
    checkDebit(accs[req.acc], amt);
    const [[rc]] = await conn.query('SELECT Customer_Name FROM Customer WHERE Customer_ID=?', [accs[to].Customer_ID]);
    await conn.query('UPDATE Account SET Account_Amount=Account_Amount-? WHERE Account_ID=?', [amt, req.acc]);
    await conn.query('UPDATE Account SET Account_Amount=Account_Amount+? WHERE Account_ID=?', [amt, to]);
    await conn.query(
      `INSERT INTO Transactions (Account_ID,Transaction_Type,Amount,\`Date\`,Receiver_Account,Receiver_Name) VALUES (?, 'Transfer', ?, CURDATE(), ?, ?)`,
      [req.acc, amt, to, rc.Customer_Name]);
    return rc.Customer_Name;
  });
  res.json({ message: `Sent ₹${amt} to ${name}` });
}));

app.post('/api/transfer-external', auth, wrap(async (req, res) => {
  const b = req.body, amt = money(b.amount);
  const ifsc = (b.ifsc || '').toUpperCase();
  need((b.bankName || '').trim(), 'Enter the receiver bank name');
  need(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc), 'IFSC must look like HDFC0001234');
  need(/^\d{9,18}$/.test(b.accountNo || ''), 'Account number must be 9-18 digits');
  need((b.receiverName || '').trim().length >= 2, 'Enter the receiver name');
  const ref = 'EXT' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await tx(async conn => {
    const a = (await lock(conn, req.acc))[req.acc];
    if (a.Secure_Word !== b.secureWord) throw new HttpError('Incorrect secure word', 403);
    checkDebit(a, amt);
    await conn.query('UPDATE Account SET Account_Amount=Account_Amount-? WHERE Account_ID=?', [amt, req.acc]);
    await conn.query(
      `INSERT INTO Transactions (Account_ID,Transaction_Type,Amount,\`Date\`,Receiver_Name) VALUES (?, 'Transfer', ?, CURDATE(), ?)`,
      [req.acc, amt, `${b.receiverName.trim()} (${b.bankName.trim()})`]);
    await conn.query(
      `INSERT INTO External_Transfer (Account_ID,Bank_Name,IFSC,Receiver_Account_No,Receiver_Name,Amount,Reference) VALUES (?,?,?,?,?,?,?)`,
      [req.acc, b.bankName.trim(), ifsc, b.accountNo, b.receiverName.trim(), amt, ref]);
  });
  res.json({ message: `Sent ₹${amt} to ${b.receiverName.trim()}. Reference ${ref}` });
}));

app.post('/api/pay-bill', auth, wrap(async (req, res) => {
  const amt = money(req.body.amount);
  need((req.body.biller || '').trim(), 'Enter the biller name');
  await tx(async conn => {
    const a = (await lock(conn, req.acc))[req.acc]; checkDebit(a, amt);
    await conn.query('UPDATE Account SET Account_Amount=Account_Amount-? WHERE Account_ID=?', [amt, req.acc]);
    await conn.query(
      'INSERT INTO Payment (Account_ID,Payment_Type,Payment_Amount,Biller_Name,Biller_Amount) VALUES (?,?,?,?,?)',
      [req.acc, req.body.type || 'Bill', amt, req.body.biller.trim(), amt]);
  });
  res.json({ message: `Paid ₹${amt} to ${req.body.biller.trim()}` });
}));

app.get('/api/external-transfers', auth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM External_Transfer WHERE Account_ID=? ORDER BY Ext_ID DESC LIMIT 100', [req.acc]);
  res.json(rows);
}));

// ---------- settings ----------
app.put('/api/profile', auth, wrap(async (req, res) => {
  const { address, email, mobile } = req.body;
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || ''), 'Enter a valid email');
  need(/^\d{10}$/.test(mobile || ''), 'Mobile number must be 10 digits');
  await pool.query(
    `UPDATE Customer c JOIN Account a ON a.Customer_ID=c.Customer_ID
     SET c.Customer_Address=?, c.Customer_Email=?, c.Customer_Mobile_No=? WHERE a.Account_ID=?`,
    [address || null, email, mobile, req.acc]);
  res.json({ message: 'Profile updated' });
}));

app.put('/api/limit', auth, wrap(async (req, res) => {
  const limit = money(req.body.limit);
  await tx(async conn => {
    await verifyPassword(conn, req.acc, req.body.password);
    await conn.query('UPDATE Account SET Transaction_Limit=? WHERE Account_ID=?', [limit, req.acc]);
  });
  res.json({ message: `Transaction limit set to ₹${limit}` });
}));

app.put('/api/password', auth, wrap(async (req, res) => {
  need((req.body.newPassword || '').length >= 8, 'New password must be at least 8 characters');
  await tx(async conn => {
    await verifyPassword(conn, req.acc, req.body.oldPassword);
    await conn.query('UPDATE Account SET Password_Hash=? WHERE Account_ID=?', [sha(req.body.newPassword), req.acc]);
  });
  res.json({ message: 'Password changed' });
}));

app.delete('/api/account', auth, wrap(async (req, res) => {
  await tx(async conn => {
    const a = (await lock(conn, req.acc))[req.acc];
    await verifyPassword(conn, req.acc, req.body.password);
    if (a.Secure_Word !== req.body.secureWord) throw new HttpError('Incorrect secure word', 403);
    if (a.Account_Amount > 0) throw new HttpError(`Withdraw or transfer your remaining balance of ₹${a.Account_Amount} before closing the account`);
    // keep other people's history intact: detach them from this account
    await conn.query('UPDATE Transactions SET Receiver_Account=NULL WHERE Receiver_Account=?', [req.acc]);
    await conn.query('DELETE FROM External_Transfer WHERE Account_ID=?', [req.acc]);
    await conn.query('DELETE FROM Payment WHERE Account_ID=?', [req.acc]);
    await conn.query('DELETE FROM Transactions WHERE Account_ID=?', [req.acc]);
    await conn.query('DELETE FROM Account WHERE Account_ID=?', [req.acc]);
    await conn.query('DELETE FROM Customer WHERE Customer_ID=?', [a.Customer_ID]);
  });
  sessions.delete(req.token);
  res.json({ message: 'Account closed' });
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bank app running at http://localhost:${PORT}`));
