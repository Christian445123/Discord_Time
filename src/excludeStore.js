const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EXCLUDES_FILE = path.join(DATA_DIR, 'excludes.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EXCLUDES_FILE)) fs.writeFileSync(EXCLUDES_FILE, '{}', 'utf8');
}

function loadExcludes() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(EXCLUDES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveExcludes(excludes) {
  ensureFile();
  fs.writeFileSync(EXCLUDES_FILE, JSON.stringify(excludes, null, 2), 'utf8');
}

function addExclude(discordId) {
  const excludes = loadExcludes();
  excludes[discordId] = true;
  saveExcludes(excludes);
}

function removeExclude(discordId) {
  const excludes = loadExcludes();
  delete excludes[discordId];
  saveExcludes(excludes);
}

function isExcluded(discordId) {
  const excludes = loadExcludes();
  return Boolean(excludes[discordId]);
}

function listExcludedIds() {
  return Object.keys(loadExcludes());
}

module.exports = { loadExcludes, addExclude, removeExclude, isExcluded, listExcludedIds };
