#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '..', 'data.db');
const db = new Database(dbPath);
const now = Math.floor(Date.now() / 1000);

console.log('Connecting to SEO Tool database at:', dbPath);

// 1. Insert Amazon India if not exists
let amazon = db.prepare("SELECT id FROM clients WHERE url LIKE '%amazon.in%'").get();
let amazonId = amazon ? amazon.id : null;
if (!amazonId) {
  const insertClient = db.prepare(`
    INSERT INTO clients (name, url, niche, country, language, description, onboarding_step, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
  `);
  const info = insertClient.run(
    'Amazon India',
    'https://www.amazon.in',
    'ecommerce',
    'IN',
    'en',
    'Amazon India Marketplace - Leading eCommerce Platform',
    now,
    now
  );
  amazonId = info.lastInsertRowid;
  console.log('Created Client Amazon India with ID:', amazonId);
} else {
  console.log('Amazon India already exists with ID:', amazonId);
}

// 2. Insert Flipkart if not exists
let flipkart = db.prepare("SELECT id FROM clients WHERE url LIKE '%flipkart.com%'").get();
let flipkartId = flipkart ? flipkart.id : null;
if (!flipkartId) {
  const insertClient = db.prepare(`
    INSERT INTO clients (name, url, niche, country, language, description, onboarding_step, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
  `);
  const info = insertClient.run(
    'Flipkart',
    'https://www.flipkart.com',
    'ecommerce',
    'IN',
    'en',
    "Flipkart Online Shopping - India's Leading eCommerce Marketplace",
    now,
    now
  );
  flipkartId = info.lastInsertRowid;
  console.log('Created Client Flipkart with ID:', flipkartId);
} else {
  console.log('Flipkart already exists with ID:', flipkartId);
}

// 3. Setup Competitors
const insertComp = db.prepare(`
  INSERT INTO competitors (client_id, name, url, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function addCompetitorIfNotExists(clientId, name, url, notes) {
  const exists = db.prepare('SELECT id FROM competitors WHERE client_id = ? AND url = ?').get(clientId, url);
  if (!exists) {
    insertComp.run(clientId, name, url, notes, now, now);
    console.log(`Added competitor ${name} to client ${clientId}`);
  }
}

// Flipkart as competitor to Amazon
addCompetitorIfNotExists(amazonId, 'Flipkart', 'https://www.flipkart.com', 'Direct primary marketplace competitor in India');

// Amazon as competitor to Flipkart
addCompetitorIfNotExists(flipkartId, 'Amazon India', 'https://www.amazon.in', 'Direct primary marketplace competitor in India');

// Add both to Dezo (Client 1)
const dezo = db.prepare("SELECT id FROM clients WHERE id = 1 OR url LIKE '%dezo.in%'").get();
if (dezo) {
  addCompetitorIfNotExists(dezo.id, 'Amazon India', 'https://www.amazon.in', 'Marketplace benchmark');
  addCompetitorIfNotExists(dezo.id, 'Flipkart', 'https://www.flipkart.com', 'Marketplace benchmark');
}

// 4. Seed Keywords
const insertKeyword = db.prepare(`
  INSERT INTO keywords (client_id, query, country, device, language, source, created_at, updated_at)
  VALUES (?, ?, 'IN', 'desktop', 'en', 'marketplace_sync', ?, ?)
`);

function addKeywordIfNotExists(clientId, query) {
  const exists = db.prepare('SELECT id FROM keywords WHERE client_id = ? AND query = ?').get(clientId, query);
  if (!exists) {
    insertKeyword.run(clientId, query, now, now);
  }
}

// Sync from amazon_seller_os.db if available
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const sellerDbPath = path.join(workspaceRoot, 'amazon_seller_os.db');

if (fs.existsSync(sellerDbPath)) {
  const sellerDb = new Database(sellerDbPath);
  const sellerKeywords = sellerDb.prepare('SELECT keyword FROM keywords').all();
  console.log(`Found ${sellerKeywords.length} keywords in amazon_seller_os.db`);
  for (const k of sellerKeywords) {
    addKeywordIfNotExists(amazonId, k.keyword);
    addKeywordIfNotExists(flipkartId, k.keyword);
  }
}

// Seed core high-intent e-commerce keywords
const highIntent = [
  'online shopping india',
  'smartphones online',
  'best laptop deals',
  'wireless earbuds bluetooth',
  'running shoes men sale',
  'home kitchen appliances',
  'portable blender usb rechargeable',
  'smart tv 4k 55 inch',
  'fast charging power bank',
  'copper water bottle 1 litre'
];

for (const k of highIntent) {
  addKeywordIfNotExists(amazonId, k);
  addKeywordIfNotExists(flipkartId, k);
}

const totalAmazonKw = db.prepare('SELECT count(*) as c FROM keywords WHERE client_id = ?').get(amazonId).c;
const totalFlipkartKw = db.prepare('SELECT count(*) as c FROM keywords WHERE client_id = ?').get(flipkartId).c;

console.log(`Amazon India keywords tracked: ${totalAmazonKw}`);
console.log(`Flipkart keywords tracked: ${totalFlipkartKw}`);
console.log('Amazon and Flipkart setup completed successfully!');
