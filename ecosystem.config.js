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
    },
  ],
};
