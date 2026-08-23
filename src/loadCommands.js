const fs = require('fs');
const path = require('path');

function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  return fs
    .readdirSync(commandsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => require(path.join(commandsDir, f)));
}

module.exports = { loadCommands };
