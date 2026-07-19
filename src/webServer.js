const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { loadPlaytimeData } = require('./playtimeStore');
const { resolveMinutesForMember, computeTier, TIER_NONE, TIER_STAMMSPIELER, TIER_EHRENMITGLIED } = require('./roleSync');
const { loadLastHours } = require('./syncHistory');

const DISCORD_API = 'https://discord.com/api';

const TIER_LABELS = {
  [TIER_NONE]: 'Kein Rang',
  [TIER_STAMMSPIELER]: 'Stammspieler',
  [TIER_EHRENMITGLIED]: 'Ehrenmitglied',
};

function redirectUri() {
  return `${config.webBaseUrl}/auth/callback`;
}

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.discordClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Discord Token-Austausch fehlgeschlagen (${res.status}).`);
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord Nutzerabfrage fehlgeschlagen (${res.status}).`);
  return res.json();
}

function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function pageShell(title, bodyHtml) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: radial-gradient(circle at top, #1e2130 0%, #0f1117 60%);
    color: #e6e6ea;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 440px;
    background: #171a24;
    border: 1px solid #2a2e3d;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .sub { color: #9098ab; font-size: 0.9rem; margin-bottom: 24px; }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 20px;
    border-radius: 10px;
    background: #5865f2;
    color: #fff;
    text-decoration: none;
    font-weight: 600;
    transition: background 0.15s ease;
  }
  .btn:hover { background: #4752c4; }
  .profile { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
  .profile img { width: 56px; height: 56px; border-radius: 50%; }
  .profile .name { font-weight: 600; font-size: 1.05rem; }
  .badge {
    display: inline-block;
    margin-top: 4px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge.none { background: #2a2e3d; color: #9098ab; }
  .badge.stammspieler { background: #2f4d3a; color: #6fe39b; }
  .badge.ehrenmitglied { background: #4d3f1f; color: #f1c40f; }
  .stat { margin-bottom: 20px; }
  .stat .value { font-size: 2.2rem; font-weight: 700; }
  .stat .label { color: #9098ab; font-size: 0.85rem; }
  .progress-track {
    width: 100%;
    height: 10px;
    border-radius: 999px;
    background: #2a2e3d;
    overflow: hidden;
    margin: 8px 0;
  }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #5865f2, #f1c40f); }
  .hint { color: #9098ab; font-size: 0.85rem; line-height: 1.5; }
  .logout { display: block; margin-top: 20px; color: #9098ab; font-size: 0.85rem; text-decoration: none; }
  .logout:hover { color: #e6e6ea; }
</style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
</body>
</html>`;
}

function renderLoginPage(error) {
  const errorHtml = error ? `<p class="hint" style="color:#e74c3c;margin-bottom:16px;">${error}</p>` : '';
  return pageShell(
    'Spielzeit-Panel — Login',
    `
    <h1>Spielzeit-Panel</h1>
    <p class="sub">Melde dich mit Discord an, um deine eigene Spielzeit auf dem Server zu sehen.</p>
    ${errorHtml}
    <a class="btn" href="/login">Mit Discord anmelden</a>
    `
  );
}

function renderDashboard(discordUser, view) {
  if (!view.found) {
    return pageShell(
      'Spielzeit-Panel',
      `
      <div class="profile">
        <img src="${avatarUrl(discordUser)}" alt="Avatar">
        <div>
          <div class="name">${escapeHtml(discordUser.username)}</div>
        </div>
      </div>
      <p class="hint">Fuer deinen Account wurde noch keine Spielzeit gefunden. Entweder hast du noch nicht auf dem Server gespielt, oder dein Discord-Account ist noch nicht mit deinem FiveM-Account verknuepft. Wende dich in dem Fall an einen Admin (Befehl <code>/link</code>).</p>
      <a class="logout" href="/logout">Abmelden</a>
      `
    );
  }

  const tierClass = view.tier;
  const progressPercent = Math.max(0, Math.min(100, view.progressPercent));

  return pageShell(
    'Spielzeit-Panel',
    `
    <div class="profile">
      <img src="${avatarUrl(discordUser)}" alt="Avatar">
      <div>
        <div class="name">${escapeHtml(discordUser.username)}</div>
        <span class="badge ${tierClass}">${TIER_LABELS[view.tier]}</span>
      </div>
    </div>
    <div class="stat">
      <div class="value">${view.hours.toFixed(1)}h</div>
      <div class="label">Gesamte Spielzeit auf dem Server</div>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${progressPercent}%"></div></div>
    <p class="hint">${view.progressText}</p>
    ${view.deltaText ? `<p class="hint">${view.deltaText}</p>` : ''}
    <a class="logout" href="/logout">Abmelden</a>
    `
  );
}

function buildDashboardView(discordUser) {
  const playtimeData = loadPlaytimeData(config);
  const minutes = resolveMinutesForMember(discordUser.id, playtimeData);
  if (minutes === null) return { found: false };

  const hours = minutes / 60;
  const tier = computeTier(hours, config);

  let progressText;
  let progressPercent;
  if (tier === TIER_EHRENMITGLIED) {
    progressText = 'Hoechste Stufe erreicht - danke fuer deine Treue!';
    progressPercent = 100;
  } else if (tier === TIER_STAMMSPIELER) {
    const remaining = config.ehrenmitgliedHours - hours;
    progressText = `Noch ${remaining.toFixed(1)}h bis Ehrenmitglied (${config.ehrenmitgliedHours}h).`;
    progressPercent = (hours / config.ehrenmitgliedHours) * 100;
  } else {
    const remaining = config.stammspielerHours - hours;
    progressText = `Noch ${remaining.toFixed(1)}h bis Stammspieler (${config.stammspielerHours}h).`;
    progressPercent = (hours / config.stammspielerHours) * 100;
  }

  let deltaText = null;
  const lastSyncHours = loadLastHours()[discordUser.id];
  if (typeof lastSyncHours === 'number') {
    const delta = hours - lastSyncHours;
    if (delta > 0) deltaText = `Seit dem letzten Rollen-Sync: +${delta.toFixed(1)}h`;
  }

  return { found: true, hours, tier, progressText, progressPercent, deltaText };
}

function startWebServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
    })
  );

  app.get('/', (req, res) => {
    if (!req.session.discordUser) {
      res.send(renderLoginPage());
      return;
    }
    const view = buildDashboardView(req.session.discordUser);
    res.send(renderDashboard(req.session.discordUser, view));
  });

  app.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(buildAuthorizeUrl(state));
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) {
      res.status(400).send(renderLoginPage('Anmeldung ungueltig oder abgelaufen. Bitte erneut versuchen.'));
      return;
    }
    delete req.session.oauthState;

    try {
      const token = await exchangeCodeForToken(code);
      const user = await fetchDiscordUser(token.access_token);
      req.session.discordUser = { id: user.id, username: user.global_name || user.username, avatar: user.avatar };
      res.redirect('/');
    } catch (err) {
      console.error('[web] OAuth2-Fehler:', err);
      res.status(500).send(renderLoginPage('Anmeldung fehlgeschlagen. Bitte erneut versuchen.'));
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  app.listen(config.webPort, () => {
    console.log(`[web] Webpanel laeuft auf ${config.webBaseUrl} (Port ${config.webPort}).`);
  });
}

module.exports = { startWebServer };
