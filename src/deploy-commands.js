const { REST, Routes } = require('discord.js');
const config = require('./config');
const { loadCommands } = require('./loadCommands');

async function deployCommands() {
  const commands = loadCommands().map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.token);
  console.log(`Registriere ${commands.length} Slash-Commands fuer Guild ${config.guildId} ...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Slash-Commands erfolgreich registriert.');
}

if (require.main === module) {
  deployCommands().catch((err) => {
    console.error('Fehler beim Registrieren der Slash-Commands:', err);
    process.exit(1);
  });
}

module.exports = { deployCommands };
