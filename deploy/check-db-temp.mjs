import Database from "better-sqlite3";
const db = new Database("/var/www/nexlify/data/nexlify.db");
const plans = db.prepare("SELECT whmcsProductId, name, slug FROM Plan WHERE active=1 ORDER BY sortOrder").all();
const addons = db.prepare("SELECT whmcsProductId, name, service FROM AddonProduct ORDER BY sortOrder").all();
console.log(JSON.stringify({ plans, addons }, null, 2));
