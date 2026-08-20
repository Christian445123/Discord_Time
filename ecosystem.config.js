module.exports = {
  apps: [
    {
      name: 'discord-time-bot',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      min_uptime: '30s',
      // Verhindert eine Neustart-Schleife, falls der Bot dauerhaft (z.B. wegen
      // fehlender .env) nicht hochkommt - danach bleibt pm2 im "errored" Status
      // stehen statt endlos neu zu starten.
      exp_backoff_restart_delay: 100,
      // Taeglicher Neustart um Mitternacht (siehe TZ unten), damit sich haengende
      // Gateway-/Command-Verbindungen regelmaessig von selbst heilen. Greift nur,
      // wenn pm2 mit dieser Konfig (neu) gestartet wurde: nach Aenderungen an
      // dieser Datei "pm2 startOrReload ecosystem.config.js" ausfuehren.
      cron_restart: '0 0 * * *',
      env: {
        // Sorgt dafuer, dass "Mitternacht" oben Wien-Zeit ist, unabhaengig von
        // der Systemzeitzone des Servers.
        TZ: 'Europe/Vienna',
      },
    },
  ],
};
