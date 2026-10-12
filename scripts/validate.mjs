#!/usr/bin/env node
// Validates every plugin in this repository against the rules waggle's
// indexer applies when it reads the repository (waggle, internal/catalog),
// and a few it does not enforce but this repository does. A plugin the
// indexer would skip, or would list and refuse to run, fails here, so it
// never reaches a workspace's catalog broken.
//
// Run it before every push:
//
//   node scripts/validate.mjs
//
// It needs Node 18 or later and nothing else. It reads files and reaches no
// network. Exit 0 when every plugin is good, 1 with one line per problem.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, posix, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const MARKETPLACE = '.cursor-plugin/marketplace.json';
const MANIFEST = '.cursor-plugin/plugin.json';

// The chips waggle's curation.toml declares that fill from a manifest's
// category. A plugin with a category outside this list is still listed, and
// under no chip, so it is refused here: add the chip to waggle first.
const CHIPS = new Set([
  'agent-orchestration', 'customer-support', 'productivity', 'inbox-and-collaboration',
  'data-analytics', 'infrastructure', 'payments', 'sales', 'marketing', 'design',
  'research', 'documents-and-files', 'scheduling', 'finance-and-legal',
  'developer-tools', 'integrations',
]);

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
// A header that carries a credential must be a ${VAR} placeholder: a literal
// there is a secret committed to a public repository.
const CREDENTIAL_HEADER = /(authorization|api[-_]?key|token|secret|password|cookie)/i;

const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

function readJSON(rel, where) {
  const full = join(root, rel);
  if (!existsSync(full)) {
    fail(where, `${rel} is not in the repository`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    fail(where, `${rel} is not JSON: ${err.message}`);
    return null;
  }
}

// within resolves a path a manifest names against the plugin's directory and
// refuses one that climbs out of the repository, as the indexer does.
function within(dir, rel) {
  const clean = posix.normalize(posix.join(dir, rel.replace(/^\.\//, '')));
  if (clean === '..' || clean.startsWith('../') || clean.startsWith('/')) return null;
  return clean;
}

function serversOf(doc) {
  if (!doc || typeof doc !== 'object') return {};
  const wrapped = doc.mcpServers;
  if (wrapped && typeof wrapped === 'object' && Object.keys(wrapped).length > 0) return wrapped;
  const bare = { ...doc };
  delete bare.mcpServers;
  return bare;
}

function declaredVariables(variables) {
  if (!variables) return new Set();
  if (Array.isArray(variables)) return new Set(variables.map((v) => v && v.name).filter(Boolean));
  return new Set(Object.keys(variables.properties || {}));
}

function placeholdersIn(values) {
  const out = new Set();
  for (const v of Object.values(values || {})) {
    for (const m of String(v).matchAll(PLACEHOLDER)) out.add(m[1]);
  }
  return out;
}

function checkPlugin(row, seen) {
  const where = `plugin ${JSON.stringify(row.name || row.source || '?')}`;
  if (!row.name || !SLUG.test(row.name)) fail(where, `its name must be a slug [a-z0-9-], got ${JSON.stringify(row.name)}`);
  if (seen.has(row.name)) fail(where, 'is listed twice in the marketplace file');
  seen.add(row.name);

  const dir = posix.normalize(String(row.source || '').replace(/^\/+|\/+$/g, ''));
  if (!dir || dir === '.' || dir.startsWith('..')) {
    fail(where, `its source ${JSON.stringify(row.source)} is not a directory of the repository`);
    return;
  }
  if (!existsSync(join(root, dir)) || !statSync(join(root, dir)).isDirectory()) {
    fail(where, `its source directory ${dir}/ is not in the repository`);
    return;
  }

  const m = readJSON(posix.join(dir, MANIFEST), where);
  if (!m) return;
  if (!m.name || !String(m.name).trim()) fail(where, 'the manifest has no name');
  if (m.name !== row.name) fail(where, `the manifest is named ${JSON.stringify(m.name)}, and the marketplace row ${JSON.stringify(row.name)}: they must match`);
  if (!m.displayName) fail(where, 'the manifest has no displayName, which is what a person reads in the marketplace');
  if (!m.description && !row.description) fail(where, 'neither the manifest nor the marketplace row has a description');
  if (!m.category) fail(where, 'the manifest has no category, so the plugin would sit under no chip');
  else if (!CHIPS.has(String(m.category).toLowerCase())) fail(where, `the category ${JSON.stringify(m.category)} is not a chip of waggle's curation.toml; use one of: ${[...CHIPS].join(', ')}`);

  // The servers: a path to an mcp file (mcpServers, or mcp), or the servers inline.
  let servers = {};
  const ref = m.mcpServers ?? m.mcp;
  if (typeof ref === 'string') {
    const mcpPath = within(dir, ref) ?? within(posix.join(dir, '.cursor-plugin'), ref);
    if (!mcpPath) {
      fail(where, `the MCP file path ${JSON.stringify(ref)} climbs out of the repository`);
      return;
    }
    const doc = readJSON(mcpPath, where);
    if (!doc) return;
    servers = serversOf(doc);
  } else if (ref && typeof ref === 'object') {
    servers = serversOf(ref);
  }

  const declared = declaredVariables(m.variables);
  const used = new Set();
  const names = Object.keys(servers);
  const hasSkills = existsSync(join(root, dir, typeof m.skills === 'string' ? m.skills : 'skills'));
  if (names.length === 0 && !hasSkills) fail(where, 'it has no MCP server and no skills, so it would install nothing');

  for (const name of names) {
    const sv = servers[name] || {};
    const at = `${where}, server ${JSON.stringify(name)}`;
    const transport = String(sv.type || (sv.url ? 'http' : sv.command ? 'stdio' : '')).toLowerCase();
    if (transport !== 'http') {
      fail(at, `its transport is ${JSON.stringify(transport || 'none')}; only an http server runs in a workspace (a wake has no npm and no terminal)`);
      continue;
    }
    let url;
    try { url = new URL(sv.url); } catch { url = null; }
    if (!url || url.protocol !== 'https:') fail(at, `its url must be https, got ${JSON.stringify(sv.url)}`);
    for (const [header, value] of Object.entries(sv.headers || {})) {
      if (CREDENTIAL_HEADER.test(header) && ![...String(value).matchAll(PLACEHOLDER)].length) {
        fail(at, `the header ${header} carries a literal value; a credential must be a \${NAME} placeholder`);
      }
    }
    for (const v of placeholdersIn(sv.headers)) used.add(v);
    for (const v of placeholdersIn(sv.env)) used.add(v);
    if (sv.auth && typeof sv.auth.CLIENT_SECRET === 'string') {
      const secret = [...sv.auth.CLIENT_SECRET.matchAll(PLACEHOLDER)];
      if (!secret.length) fail(at, 'auth.CLIENT_SECRET is a literal; it must be a ${NAME} placeholder');
      for (const s of secret) used.add(s[1]);
    }
  }

  for (const v of used) {
    if (!declared.has(v)) fail(where, `\${${v}} is used by a server and not declared under variables, so the key form would have no label for it`);
  }
  for (const v of declared) {
    if (!used.has(v)) fail(where, `the variable ${v} is declared and no server uses it`);
  }
  if (m.variables && !Array.isArray(m.variables)) {
    for (const [key, prop] of Object.entries(m.variables.properties || {})) {
      if (!prop || !prop.title) fail(where, `the variable ${key} has no title, which is the label on the key form`);
    }
  }
}

const mp = readJSON(MARKETPLACE, 'marketplace');
if (mp) {
  if (!Array.isArray(mp.plugins) || mp.plugins.length === 0) fail('marketplace', `${MARKETPLACE} names no plugins`);
  const seen = new Set();
  for (const row of mp.plugins || []) checkPlugin(row || {}, seen);
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} in ${normalize(root)}`);
  process.exit(1);
}
console.log(`ok: ${mp.plugins.length} plugin${mp.plugins.length === 1 ? '' : 's'} in ${normalize(root)} would index and run in a workspace`);
