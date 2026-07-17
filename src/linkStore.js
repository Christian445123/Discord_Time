const fs = require('fs');
const path = require('path');
const { normalizeLicense } = require('./playtimeStore');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LINKS_FILE)) fs.writeFileSync(LINKS_FILE, '{}', 'utf8');
}

function loadLinks() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveLinks(links) {
  ensureFile();
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2), 'utf8');
}

function setLink(discordId, license) {
  const links = loadLinks();
  links[discordId] = normalizeLicense(license);
  saveLinks(links);
}

function removeLink(discordId) {
  const links = loadLinks();
  delete links[discordId];
  saveLinks(links);
}

function getLink(discordId) {
  const links = loadLinks();
  return links[discordId] || null;
}

module.exports = { loadLinks, setLink, removeLink, getLink };
