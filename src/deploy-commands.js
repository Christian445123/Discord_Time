const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log(`Registriere ${commands.length} Slash-Commands fuer Guild ${config.guildId} ...`);
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log('Slash-Commands erfolgreich registriert.');
  } catch (err) {
    console.error('Fehler beim Registrieren der Slash-Commands:', err);
    process.exit(1);
  }
})();
