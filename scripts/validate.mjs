// A local copy of the check hachiflow runs on this repository. Run it before
// you open a pull request, so the maintainers' check, which is the one that
// counts, finds nothing:
//
//   node scripts/validate.mjs
//
// The authoritative check runs on hachiflow's own infrastructure from a
// private repository (internal/catalog/check.go there): it reads this
// repository as data and uses waggled's own parser. This file is a copy of
// the rules for your convenience, and a pull request cannot change it: the
// check refuses a tree whose copy differs by a byte. If it passes here and
// fails there, the private check is right; its findings say why.
//
// It needs Node 18 or later and nothing else. It reads files and reaches no
// network. Exit 0 when every plugin is good, 1 with one line per problem.

import { readFileSync, readdirSync, lstatSync, existsSync, statSync } from 'node:fs';
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

// A string shaped like a vendor's credential, anywhere in any file.
const KNOWN_SECRET = /sk-[A-Za-z0-9_-]{16,}|sk_(live|test)_[A-Za-z0-9]{10,}|[pr]k_live_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|glpat-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[Bb]earer\s+[A-Za-z0-9._~+/=-]{20,}/;

// publicHost: a name with a dot that is not a local suffix, or a public IPv4.
function publicHost(host) {
  host = host.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || host.includes(':') || /^(0x[0-9a-f]+|[0-9]+)$/.test(host)) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (!host.includes('.')) return false;
  return !/\.(localhost|local|internal|lan|home|corp|intranet|home\.arpa|localdomain)$/.test(host);
}

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
  if (m.license !== 'MIT') fail(where, `the manifest license is ${JSON.stringify(m.license)}, want "MIT"`);
  if (!/Maintained by hachiflow, not by \S/.test(m.description || '')) fail(where, 'the manifest description must say "Maintained by hachiflow, not by <vendor>"');
  if (!m.version) fail(where, 'the manifest has no version');
  if (dir !== row.name) fail(where, `its source must be a top level directory named like the plugin, got ${JSON.stringify(row.source)}`);
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
    else if (url.username || url.password) fail(at, 'its url carries a user name or password');
    else if (!publicHost(url.hostname)) fail(at, `its host ${JSON.stringify(url.hostname)} is not a public host (loopback, private, link local and local names are refused)`);
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

function walk(rel) {
  for (const name of readdirSync(join(root, rel))) {
    if (name === '.git') continue;
    const relPath = posix.join(rel, name);
    const st = lstatSync(join(root, relPath));
    if (st.isSymbolicLink()) { fail(`file ${relPath}`, 'is a symbolic link'); continue; }
    if (st.isDirectory()) { walk(relPath); continue; }
    if (relPath !== 'scripts/validate.mjs') {
      if (st.mode & 0o111) fail(`file ${relPath}`, 'is executable');
      if (st.size > 256 * 1024) fail(`file ${relPath}`, 'is over 256 KB');
      const text = readFileSync(join(root, relPath));
      if (text.subarray(0, 8192).includes(0)) fail(`file ${relPath}`, 'holds binary bytes');
      else if (KNOWN_SECRET.test(text.toString('utf8'))) fail(`file ${relPath}`, "holds a string shaped like a vendor's API key, token or private key");
    }
  }
}
walk('.');

const mp = readJSON(MARKETPLACE, 'marketplace');
if (mp) {
  const listed = new Set((mp.plugins || []).map((r) => String(r.source || '').split('/')[0]));
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory() && !['.git', 'docs', 'scripts', '.cursor-plugin'].includes(d.name) && !listed.has(d.name)) {
      fail(`directory ${d.name}`, `is not a plugin listed in ${MARKETPLACE}`);
    }
  }
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
