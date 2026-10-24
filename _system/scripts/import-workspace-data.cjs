#!/usr/bin/env node
/**
 * Workspace Data Bridge & Backlink Importer
 * Integrates external workspace datasets (e.g. backlinks_dezo_in.txt, backlinks_localhost_8000.txt)
 * directly into the All-In-One Free SEO Tool SQLite database.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function getDbPath() {
  const custom = process.env.SEO_DB_PATH;
  if (custom && fs.existsSync(custom)) return custom;
  return path.resolve(__dirname, '..', 'data.db');
}

function extractDomain(urlStr) {
  try {
    let clean = urlStr.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const u = new URL(clean);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown-source';
  }
}

function runImport() {
  const args = process.argv.slice(2);
  let filePath = '';
  let clientUrl = '';
  let clientName = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === '--url' && args[i + 1]) {
      clientUrl = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      clientName = args[++i];
    }
  }

  if (!filePath) {
    // Default to backlinks_dezo_in.txt if in MY TOOLS
    const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
    const defaultDezo = path.join(workspaceRoot, 'backlinks_dezo_in.txt');
    if (fs.existsSync(defaultDezo)) {
      filePath = defaultDezo;
      if (!clientUrl) clientUrl = 'https://dezo.in';
      if (!clientName) clientName = 'Dezo';
    } else {
      console.error('Usage: node import-workspace-data.cjs --file <path-to-backlinks.txt> [--url <site-url>] [--name <client-name>]');
      process.exit(1);
    }
  }

  if (!clientUrl) {
    clientUrl = 'https://' + path.basename(filePath).replace(/^backlinks_/, '').replace(/\.txt$/, '').replace(/_/g, '.');
  }
  if (!clientName) {
    clientName = extractDomain(clientUrl).toUpperCase();
  }

  const resolvedFile = path.resolve(filePath);
  if (!fs.existsSync(resolvedFile)) {
    console.error(`File not found: ${resolvedFile}`);
    process.exit(1);
  }

  const dbPath = getDbPath();
  const db = new Database(dbPath);
  console.log(`Connecting to database at: ${dbPath}`);

  // 1. Ensure client exists
  const existingClient = db.prepare('SELECT id, name, url FROM clients WHERE url = ? OR url = ?').get(clientUrl, clientUrl + '/');
  let clientId = existingClient ? existingClient.id : null;

  if (!clientId) {
    const now = Math.floor(Date.now() / 1000);
    const insertClient = db.prepare(`
      INSERT INTO clients (name, url, country, language, onboarding_step, created_at, updated_at)
      VALUES (?, ?, 'IN', 'en', 'completed', ?, ?)
    `);
    const info = insertClient.run(clientName, clientUrl, now, now);
    clientId = info.lastInsertRowid;
    console.log(`Created new client '${clientName}' (ID: ${clientId}) for URL: ${clientUrl}`);
  } else {
    console.log(`Using existing client '${existingClient.name}' (ID: ${clientId})`);
  }

  // 2. Read backlink URLs
  const content = fs.readFileSync(resolvedFile, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && (l.startsWith('http://') || l.startsWith('https://')));
  console.log(`Found ${lines.length} backlink entries in ${path.basename(resolvedFile)}`);

  // 3. Batch insert backlinks
  const checkStmt = db.prepare('SELECT id FROM backlinks WHERE client_id = ? AND source_url = ?');
  const insertStmt = db.prepare(`
    INSERT INTO backlinks (client_id, source_url, source_domain, target_url, status, source, method, rel)
    VALUES (?, ?, ?, ?, 'active', 'discovered', 'backlink_engine', 'dofollow')
  `);

  const insertMany = db.transaction((links) => {
    let added = 0;
    for (const url of links) {
      const exists = checkStmt.get(clientId, url);
      if (!exists) {
        const domain = extractDomain(url);
        insertStmt.run(clientId, url, domain, clientUrl);
        added++;
      }
    }
    return added;
  });

  const addedCount = insertMany(lines);
  console.log(`Successfully imported ${addedCount} new backlinks for ${clientName}!`);

  const totalBacklinks = db.prepare('SELECT count(*) as count FROM backlinks WHERE client_id = ?').get(clientId);
  console.log(`Total backlinks now in database for ${clientName}: ${totalBacklinks.count}`);
}

runImport();
