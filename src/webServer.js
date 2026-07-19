const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { loadPlaytimeData } = require('./playtimeStore');
const {
  resolveMinutesForMember,
  computeTier,
  listAllPlayers,
  syncGuildRoles,
  TIER_NONE,
  TIER_STAMMSPIELER,
  TIER_EHRENMITGLIED,
} = require('./roleSync');
const { loadLastHours } = require('./syncHistory');
const { postSyncLog } = require('./syncReport');
const { setLastSync, getLastSync } = require('./syncState');
const { getAllPlayers, getPlayerByDiscordId, logLogin, getRecentLogins } = require('./db');

const MEDALS = ['🥇', '🥈', '🥉'];

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
    scope: 'identify guilds.members.read',
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

async function fetchGuildMember(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${config.guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function pageShell(title, bodyHtml, wide = false) {
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
  .card.wide { max-width: 720px; }
  .nav { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
  .nav a { color: #9098ab; text-decoration: none; font-size: 0.85rem; padding: 6px 12px; border-radius: 8px; background: #20232f; }
  .nav a:hover { color: #e6e6ea; }
  .nav a.staff { background: #3b2f5e; color: #c4b5fd; font-weight: 600; }
  .nav a.staff:hover { background: #4c3d78; color: #e6e6ea; }
  .nav a.logout-link { color: #e74c3c !important; }
  .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2e3d; font-size: 0.75rem; }
  .footer a { color: #9098ab; text-decoration: none; margin: 0 8px; }
  .footer a:hover { color: #e6e6ea; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid #2a2e3d; font-size: 0.9rem; }
  th { color: #9098ab; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: none; }
  .rank { font-weight: 700; width: 44px; }
  .forbidden { text-align: center; padding: 20px 0; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  @media (max-width: 600px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  .stat-box { background: #20232f; border-radius: 10px; padding: 16px; text-align: center; }
  .stat-box .stat-value { font-size: 1.6rem; font-weight: 700; }
  .stat-box .stat-label { color: #9098ab; font-size: 0.78rem; margin-top: 4px; }
  h2 { font-size: 1.05rem; margin: 24px 0 8px; color: #9098ab; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .search-bar { width: 100%; padding: 8px 12px; border-radius: 8px; background: #20232f; border: 1px solid #2a2e3d; color: #e6e6ea; font-size: 0.9rem; margin-bottom: 10px; }
  .search-bar::placeholder { color: #9098ab; }
  tr.hidden { display: none; }
  .sync-btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 8px; background: #2f4d3a; color: #6fe39b; border: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .sync-btn:hover { background: #3a6349; }
  .sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sync-result { margin-top: 8px; font-size: 0.85rem; }
</style>
</head>
<body>
  <div class="card${wide ? ' wide' : ''}">${bodyHtml}
  <div class="footer"><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></div>
  </div>
</body>
</html>`;
}

function navHtml(options = {}) {
  const links = ['<a href="/top10">🏆 Top 10</a>'];
  if (options.loggedIn) {
    links.unshift('<a href="/">👤 Meine Zeit</a>');
    links.push('<a href="/logout" class="logout-link">Abmelden</a>');
  }
  if (options.isHighTeam) links.splice(links.length - 1, 0, '<a href="/log" class="staff">👮 Staff</a>');
  return `<div class="nav">${links.join('')}</div>`;
}

function renderLoginPage(error) {
  const errorHtml = error ? `<p class="hint" style="color:#e74c3c;margin-bottom:16px;">${error}</p>` : '';
  return pageShell(
    'Spielzeit-Panel — Login',
    `
    ${navHtml()}
    <h1>Spielzeit-Panel</h1>
    <p class="sub">Melde dich mit Discord an, um deine eigene Spielzeit auf dem Server zu sehen.</p>
    ${errorHtml}
    <a class="btn" href="/login">Mit Discord anmelden</a>
    `
  );
}

function renderDashboard(discordUser, view, isHighTeam) {
  if (!view.found) {
    return pageShell(
      'Spielzeit-Panel',
      `
      ${navHtml({ loggedIn: true, isHighTeam })}
      <div class="profile">
        <img src="${avatarUrl(discordUser)}" alt="Avatar">
        <div>
          <div class="name">${escapeHtml(discordUser.username)}</div>
        </div>
      </div>
      <p class="hint">Fuer deinen Account wurde noch keine Spielzeit gefunden. Entweder hast du noch nicht auf dem Server gespielt, oder dein Discord-Account ist noch nicht mit deinem FiveM-Account verknuepft. Wende dich in dem Fall an einen Admin (Befehl <code>/link</code>).</p>
      `
    );
  }

  const tierClass = view.tier;
  const progressPercent = Math.max(0, Math.min(100, view.progressPercent));

  return pageShell(
    'Spielzeit-Panel',
    `
    ${navHtml({ loggedIn: true, isHighTeam })}
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
    `
  );
}

async function buildDashboardView(discordUser) {
  if (config.dbEnabled) {
    try {
      const player = await getPlayerByDiscordId(discordUser.id);
      if (player !== null) {
        const { hours, tier, deltaHours } = player;
        return buildViewFromHours(hours, tier, deltaHours);
      }
    } catch (err) {
      console.error('[web] DB-Einzelabfrage fehlgeschlagen, Fallback:', err.message);
    }
  }
  const playtimeData = loadPlaytimeData(config);
  const minutes = resolveMinutesForMember(discordUser.id, playtimeData);
  if (minutes === null) return { found: false };
  const hours = minutes / 60;
  const tier = computeTier(hours, config);
  const lastSyncHours = loadLastHours()[discordUser.id];
  const deltaHours = typeof lastSyncHours === 'number' ? hours - lastSyncHours : null;
  return buildViewFromHours(hours, tier, deltaHours);
}

function buildViewFromHours(hours, tier, deltaHours) {

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
  if (typeof deltaHours === 'number' && deltaHours > 0) {
    deltaText = `Seit dem letzten Rollen-Sync: +${deltaHours.toFixed(1)}h`;
  }

  return { found: true, hours, tier, progressText, progressPercent, deltaText };
}

function renderTop10Page(players, navOptions) {
  const rows = players.length
    ? players
        .slice(0, 10)
        .map((p, i) => {
          const rank = MEDALS[i] || `${i + 1}.`;
          return `<tr>
            <td class="rank">${rank}</td>
            <td>${escapeHtml(p.tag)}</td>
            <td>${p.hours.toFixed(1)}h</td>
            <td><span class="badge ${p.tier}">${TIER_LABELS[p.tier]}</span></td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="4" class="hint">Noch keine Spielzeit-Daten gefunden.</td></tr>';

  return pageShell(
    'Top 10 Spielzeit',
    `
    ${navHtml(navOptions)}
    <h1>🏆 Top 10 Spielzeit</h1>
    <p class="sub">Die aktivsten Spieler auf dem Server.</p>
    <table>
      <thead><tr><th>Platz</th><th>Spieler</th><th>Stunden</th><th>Rang</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    `,
    true
  );
}

function renderForbiddenPage() {
  return pageShell(
    'Kein Zugriff',
    `
    ${navHtml({ loggedIn: true })}
    <div class="forbidden">
      <h1>Kein Zugriff</h1>
      <p class="hint">Dieser Bereich ist dem HighTeam vorbehalten.</p>
    </div>
    `
  );
}

function renderLogPage(players, logins = []) {
  const ehrenCount = players.filter((p) => p.tier === TIER_EHRENMITGLIED).length;
  const stammCount = players.filter((p) => p.tier === TIER_STAMMSPIELER).length;
  const totalHours = players.reduce((sum, p) => sum + p.hours, 0);

  const lastSync = getLastSync();
  let syncInfoHtml;
  if (lastSync) {
    const ts = lastSync.timestamp.toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
    const dbBadge = lastSync.dbSynced === true ? '✅' : lastSync.dbSynced === false ? '❌' : '—';
    syncInfoHtml = `<div class="hint" style="background:#20232f;padding:12px;border-radius:8px;line-height:1.8;">
      <strong>🕒 ${ts}</strong> &mdash; Anlass: <em>${lastSync.reason}</em><br>
      Geprueft: <strong>${lastSync.checked}</strong> &nbsp;·&nbsp;
      Mit Daten: <strong>${lastSync.withData}</strong> &nbsp;·&nbsp;
      Rollenaenderungen: <strong>${lastSync.updated}</strong> &nbsp;·&nbsp;
      Fehler: <strong>${lastSync.errors}</strong> &nbsp;·&nbsp;
      Datenbank: ${dbBadge} &nbsp;·&nbsp;
      Dauer: <strong>${lastSync.durationMs}ms</strong>
    </div>`;
  } else {
    syncInfoHtml = '<p class="hint">Noch kein Sync seit dem letzten Bot-Start.</p>';
  }

  const top10Rows = players
    .slice(0, 10)
    .map((p, i) => {
      const rank = MEDALS[i] || `${i + 1}.`;
      return `<tr>
        <td class="rank">${rank}</td>
        <td>${escapeHtml(p.tag)}</td>
        <td>${p.hours.toFixed(1)}h</td>
        <td><span class="badge ${p.tier}">${TIER_LABELS[p.tier]}</span></td>
      </tr>`;
    })
    .join('');

  const allRows = players.length
    ? players
        .map((p) => {
          const deltaText =
            p.deltaHours === null || p.deltaHours === undefined
              ? '(erster Sync)'
              : `${p.deltaHours >= 0 ? '+' : ''}${p.deltaHours.toFixed(1)}h`;
          return `<tr>
            <td>${escapeHtml(p.tag)}</td>
            <td>${p.hours.toFixed(1)}h</td>
            <td>${deltaText}</td>
            <td><span class="badge ${p.tier}">${TIER_LABELS[p.tier]}</span></td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="4" class="hint">Noch keine Spielzeit-Daten gefunden.</td></tr>';

  return pageShell(
    'Admin Dashboard',
    `
    ${navHtml({ loggedIn: true, isHighTeam: true })}
    <h1>📊 Admin Dashboard</h1>
    <p class="sub">Spielzeit-Uebersicht fuer das HighTeam.</p>

    <div style="margin-bottom:20px;">
      <button id="syncBtn" class="sync-btn" onclick="triggerSync()">🔄 Sync starten</button>
      <div id="syncResult" class="sync-result hint"></div>
    </div>

    <h2>🕒 Letzter Sync</h2>
    ${syncInfoHtml}
    <script>
      async function triggerSync() {
        const btn = document.getElementById('syncBtn');
        const result = document.getElementById('syncResult');
        btn.disabled = true;
        btn.textContent = '⏳ Sync laeuft ...';
        result.textContent = '';
        result.style.color = '';
        try {
          const res = await fetch('/staff/sync', { method: 'POST' });
          const data = await res.json();
          if (data.ok) {
            result.style.color = '#6fe39b';
            result.textContent = '\u2705 Fertig in ' + data.durationMs + 'ms \u2014 ' + data.checked + ' geprueft, ' + data.updated + ' Rollenaenderungen, ' + data.errors + ' Fehler';
            setTimeout(() => location.reload(), 1500);
          } else {
            result.style.color = '#e74c3c';
            result.textContent = '❌ ' + (data.error || 'Unbekannter Fehler');
          }
        } catch (e) {
          result.style.color = '#e74c3c';
          result.textContent = '❌ Verbindungsfehler';
        }
        btn.disabled = false;
        btn.textContent = '🔄 Sync starten';
      }
    </script>

    <div class="stats-grid">
      <div class="stat-box"><div class="stat-value">${players.length}</div><div class="stat-label">Spieler erfasst</div></div>
      <div class="stat-box"><div class="stat-value">${stammCount}</div><div class="stat-label">Stammspieler</div></div>
      <div class="stat-box"><div class="stat-value">${ehrenCount}</div><div class="stat-label">Ehrenmitglieder</div></div>
      <div class="stat-box"><div class="stat-value">${totalHours.toFixed(0)}h</div><div class="stat-label">Spielzeit gesamt</div></div>
    </div>

    <h2>🏆 Top 10</h2>
    <table>
      <thead><tr><th>Platz</th><th>Spieler</th><th>Stunden</th><th>Rang</th></tr></thead>
      <tbody>${top10Rows}</tbody>
    </table>

    <h2>👥 Alle Spieler (${players.length})</h2>
    <input class="search-bar" id="playerSearch" placeholder="Spieler suchen ..." oninput="filterTable(this.value)">
    <table id="allPlayersTable">
      <thead><tr><th>Spieler</th><th>Stunden</th><th>Zuwachs seit letztem Sync</th><th>Rang</th></tr></thead>
      <tbody>${allRows}</tbody>
    </table>

    <h2>🔐 Login-Log (letzte 50)</h2>
    <input class="search-bar" id="loginSearch" placeholder="Spieler oder IP suchen ..." oninput="filterLogin(this.value)">
    <table id="loginTable">
      <thead><tr><th>Spieler</th><th>Discord-ID</th><th>IP</th><th>Zeitpunkt</th></tr></thead>
      <tbody>${logins.length ? logins.map(l => `<tr>
        <td>${escapeHtml(l.discord_tag)}</td>
        <td style="font-size:0.8rem;color:#9098ab;">${escapeHtml(l.discord_id)}</td>
        <td style="font-size:0.8rem;">${escapeHtml(l.ip || '—')}</td>
        <td style="font-size:0.8rem;">${new Date(l.logged_at).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="hint">Noch keine Logins aufgezeichnet.</td></tr>'}</tbody>
    </table>
    <script>
      function filterTable(q) {
        const rows = document.querySelectorAll('#allPlayersTable tbody tr');
        const lower = q.toLowerCase();
        rows.forEach(r => r.classList.toggle('hidden', !r.textContent.toLowerCase().includes(lower)));
      }
      function filterLogin(q) {
        const rows = document.querySelectorAll('#loginTable tbody tr');
        const lower = q.toLowerCase();
        rows.forEach(r => r.classList.toggle('hidden', !r.textContent.toLowerCase().includes(lower)));
      }
    </script>
    `,
    true
  );
}

const PLAYERS_CACHE_TTL_MS = 5 * 60 * 1000;
let _playersCache = null;
let _playersCacheAt = 0;

async function getPlayersForWeb(guild) {
  const now = Date.now();
  if (_playersCache && now - _playersCacheAt < PLAYERS_CACHE_TTL_MS) {
    return _playersCache;
  }
  if (config.dbEnabled) {
    try {
      const rows = await getAllPlayers();
      if (rows !== null) {
        _playersCache = rows;
        _playersCacheAt = now;
        return _playersCache;
      }
    } catch (err) {
      console.error('[web] DB-Abfrage fehlgeschlagen, Fallback auf Cache:', err.message);
    }
  }
  _playersCache = await listAllPlayers(guild, config);
  _playersCacheAt = now;
  return _playersCache;
}

async function fetchGuild(client) {
  return client.guilds.fetch(config.guildId);
}

function isHighTeamMember(discordUser) {
  return Boolean(discordUser?.isHighTeam);
}

function startWebServer(client) {
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

  app.get('/', async (req, res) => {
    if (!req.session.discordUser) {
      res.send(renderLoginPage());
      return;
    }
    try {
      const view = await buildDashboardView(req.session.discordUser);
      const isHighTeam = isHighTeamMember(req.session.discordUser);
      res.send(renderDashboard(req.session.discordUser, view, isHighTeam));
    } catch (err) {
      console.error('[web] Fehler beim Laden von /:', err);
      res.status(500).send('Fehler beim Laden deiner Daten. Bitte spaeter erneut versuchen.');
    }
  });

  app.get('/top10', async (req, res) => {
    try {
      const guild = await fetchGuild(client);
      const players = await getPlayersForWeb(guild);
      const loggedIn = Boolean(req.session.discordUser);
      const isHighTeam = loggedIn ? isHighTeamMember(req.session.discordUser) : false;
      res.send(renderTop10Page(players, { loggedIn, isHighTeam }));
    } catch (err) {
      console.error('[web] Fehler beim Laden von /top10:', err);
      res.status(500).send('Fehler beim Laden der Top 10. Bitte spaeter erneut versuchen.');
    }
  });

  app.get('/log', async (req, res) => {
    if (!req.session.discordUser) {
      req.session.postLoginRedirect = '/log';
      res.redirect('/login');
      return;
    }
    if (!isHighTeamMember(req.session.discordUser)) {
      res.status(403).send(renderForbiddenPage());
      return;
    }
    try {
      const guild = await fetchGuild(client);
      const [players, logins] = await Promise.all([
        getPlayersForWeb(guild),
        getRecentLogins(50).catch(() => []),
      ]);
      res.send(renderLogPage(players, logins));
    } catch (err) {
      console.error('[web] Fehler beim Laden von /log:', err);
      res.status(500).send('Fehler beim Laden des Staff-Dashboards. Bitte spaeter erneut versuchen.');
    }
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
      const [user, guildMember] = await Promise.all([
        fetchDiscordUser(token.access_token),
        fetchGuildMember(token.access_token).catch(() => null),
      ]);
      const isHighTeam = config.roleHighTeamId
        ? Array.isArray(guildMember?.roles) && guildMember.roles.includes(config.roleHighTeamId)
        : false;
      req.session.discordUser = { id: user.id, username: user.global_name || user.username, avatar: user.avatar, isHighTeam };
      logLogin(user.id, user.global_name || user.username, req.ip).catch(() => null);
      const redirectTo = req.session.postLoginRedirect || '/';
      delete req.session.postLoginRedirect;
      res.redirect(redirectTo);
    } catch (err) {
      console.error('[web] OAuth2-Fehler:', err);
      res.status(500).send(renderLoginPage('Anmeldung fehlgeschlagen. Bitte erneut versuchen.'));
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  app.get('/impressum', (req, res) => {
    const isLoggedIn = Boolean(req.session.discordUser);
    const isHT = isHighTeamMember(req.session.discordUser);
    const name = escapeHtml(config.legalName || '[Name des Betreibers]');
    const street = escapeHtml(config.legalStreet || '[Stra\u00dfe und Hausnummer]');
    const city = escapeHtml(config.legalCity || '[PLZ Ort, Land]');
    const email = escapeHtml(config.legalEmail || '[kontakt@example.com]');
    const discord = escapeHtml(config.legalDiscord || '[Discord-Benutzername]');
    const srv = escapeHtml(config.serverName);
    res.send(pageShell('Impressum', `
    ${navHtml({ loggedIn: isLoggedIn, isHighTeam: isHT })}
    <h1>\ud83d\udccb Impressum</h1>
    <div class="hint" style="line-height:2;">
      <strong>Angaben gem&auml;&szlig; &sect; 5 TMG</strong><br><br>
      <strong>Betreiber:</strong><br>
      ${name}<br>
      ${street}<br>
      ${city}<br>
      <br>
      <strong>Kontakt:</strong><br>
      E-Mail: <a href="mailto:${email}" style="color:#5865f2;">${email}</a><br>
      Discord: ${discord}<br>
      <br>
      <strong>Hinweis:</strong><br>
      Dieses Webpanel geh&ouml;rt zum Discord-Bot des Projekts <em>${srv}</em>
      und ist ein privates, nicht-kommerzielles Projekt.
      Es besteht keine Verbindung zu Rockstar Games, FiveM oder Discord Inc.
    </div>
    `));
  });

  app.get('/datenschutz', (req, res) => {
    const isLoggedIn = Boolean(req.session.discordUser);
    const isHT = isHighTeamMember(req.session.discordUser);
    const email = escapeHtml(config.legalEmail || '[kontakt@example.com]');
    const srv = escapeHtml(config.serverName);
    res.send(pageShell('Datenschutzerklaerung', `
    ${navHtml({ loggedIn: isLoggedIn, isHighTeam: isHT })}
    <h1>\ud83d\udd12 Datenschutzerkl&auml;rung</h1>
    <div class="hint" style="line-height:1.9;">
      <strong>1. Verantwortlicher</strong><br>
      Betreiber des Projekts <em>${srv}</em> &mdash; siehe <a href="/impressum" style="color:#5865f2;">Impressum</a><br><br>

      <strong>2. Welche Daten werden verarbeitet?</strong><br>
      &bull; Discord-ID, Benutzername und Profilbild (von Discord &uuml;bermittelt)<br>
      &bull; Rollenzugeh&ouml;rigkeit im Discord-Server (zur Zugangskontrolle)<br>
      &bull; Spielzeit-Daten aus der txAdmin-Spielerdatenbank (lokal gespeichert)<br><br>

      <strong>3. Zweck der Verarbeitung</strong><br>
      Ausschlie&szlig;lich zur Anzeige der eigenen Spielzeit und automatischen
      Rollenvergabe. Keine Weitergabe an Dritte.<br><br>

      <strong>4. Rechtsgrundlage</strong><br>
      Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO sowie freiwillige Anmeldung via Discord OAuth2.<br><br>

      <strong>5. Speicherdauer</strong><br>
      Spielzeit-Daten: solange der Server aktiv ist.<br>
      Session-Cookies: 7 Tage.<br>
      L&ouml;schung auf Anfrage m&ouml;glich.<br><br>

      <strong>6. Deine Rechte (Art.&nbsp;15&ndash;21 DSGVO)</strong><br>
      Auskunft, Berichtigung, L&ouml;schung, Einschr&auml;nkung.<br>
      Kontakt: <a href="mailto:${email}" style="color:#5865f2;">${email}</a><br><br>

      <strong>7. Discord Inc.</strong><br>
      <a href="https://discord.com/privacy" style="color:#5865f2;">Datenschutzbestimmungen von Discord</a>
    </div>
    `));
  });

  app.get('/datenschutz', (req, res) => {
    const isLoggedIn = Boolean(req.session.discordUser);
    const isHT = isHighTeamMember(req.session.discordUser);
    res.send(pageShell('Datenschutzerklaerung', `
    ${navHtml({ loggedIn: isLoggedIn, isHighTeam: isHT })}
    <h1>🔒 Datenschutzerklaerung</h1>
    <div class="hint" style="line-height:1.9;">
      <strong>1. Verantwortlicher</strong><br>
      [Name und Kontakt des Betreibers &ndash; siehe Impressum]<br><br>

      <strong>2. Welche Daten werden verarbeitet?</strong><br>
      Beim Einloggen &uuml;ber Discord OAuth2 werden folgende Daten verarbeitet:<br>
      &bull; Discord-ID, Benutzername und Profilbild (von Discord &uuml;bermittelt)<br>
      &bull; Deine Rollenzugeh&ouml;rigkeit im Discord-Server (zur Zugangskontrolle)<br>
      &bull; Spielzeit-Daten aus der txAdmin-Spielerdatenbank (lokal gespeichert)<br><br>

      <strong>3. Zweck der Verarbeitung</strong><br>
      Die Daten werden ausschlie&szlig;lich dazu genutzt, dir deine eigene Spielzeit
      auf dem Server anzuzeigen und ggf. Discord-Rollen automatisch zu vergeben.
      Eine Weitergabe an Dritte erfolgt nicht.<br><br>

      <strong>4. Rechtsgrundlage</strong><br>
      Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse des Serverbetreibers
      an der Verwaltung des Spielerlebens) sowie deine freiwillige Anmeldung
      via Discord OAuth2.<br><br>

      <strong>5. Speicherdauer</strong><br>
      Spielzeit-Daten werden solange gespeichert, wie der Server aktiv betrieben wird.
      Session-Daten werden nach 7 Tagen automatisch gel&ouml;scht.
      Datenbankeintr&auml;ge k&ouml;nnen auf Anfrage gel&ouml;scht werden.<br><br>

      <strong>6. Deine Rechte</strong><br>
      Du hast das Recht auf Auskunft, Berichtigung, L&ouml;schung und Einschr&auml;nkung
      der Verarbeitung deiner Daten (Art. 15&ndash;18 DSGVO). Wende dich dazu an
      den Betreiber (siehe Impressum).<br><br>

      <strong>7. Discord</strong><br>
      Die Anmeldung erfolgt &uuml;ber Discord OAuth2. Dabei gelten zus&auml;tzlich die
      <a href="https://discord.com/privacy" style="color:#5865f2;">Datenschutzbestimmungen von Discord</a>.
    </div>
    `));
  });

  let _isSyncing = false;

  app.post('/staff/sync', async (req, res) => {
    if (!req.session.discordUser || !isHighTeamMember(req.session.discordUser)) {
      return res.status(403).json({ ok: false, error: 'Kein Zugriff.' });
    }
    if (_isSyncing) {
      return res.status(429).json({ ok: false, error: 'Sync laeuft bereits. Bitte warten.' });
    }
    _isSyncing = true;
    try {
      const guild = await fetchGuild(client);
      const startedAt = Date.now();
      const summary = await syncGuildRoles(guild, config);
      const durationMs = Date.now() - startedAt;
      await postSyncLog(client, config, summary, `manuell via Webpanel (${req.session.discordUser.username})`, durationMs);
      setLastSync({ reason: 'manuell via Webpanel (' + req.session.discordUser.username + ')', checked: summary.checked, withData: summary.withData, updated: summary.updated, errors: summary.errors.length, dbSynced: summary.dbSynced, durationMs });
      _playersCache = null;
      res.json({ ok: true, checked: summary.checked, withData: summary.withData, updated: summary.updated, errors: summary.errors.length, durationMs });
    } catch (err) {
      console.error('[web] Fehler beim manuellen Sync:', err);
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      _isSyncing = false;
    }
  });

  app.listen(config.webPort, () => {
    console.log(`[web] Webpanel laeuft auf ${config.webBaseUrl} (Port ${config.webPort}).`);
  });
}

module.exports = { startWebServer };
