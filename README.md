# Bank Management – Node + MySQL

1. In MySQL, run in order: `bank.sql`, `schema_additions.sql`, then (optional) `sample_data.sql`
2. `npm install`
3. `DB_USER=root DB_PASS=yourpassword npm start`  (Windows PowerShell: `$env:DB_PASS="..."; npm start`)
4. Open http://localhost:3000 — demo login: `aryan01` / `DemoPass123!`, secure word `demo1`

Business rules live in `server.js` (every money movement is one DB transaction with row locks).
Sessions are in memory and passwords are SHA-256 (to match your SHA2() sample data); for production use bcrypt/argon2 + HTTPS.
