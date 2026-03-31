const { importTrello } = require('./trello');
const { importObsidian } = require('./obsidian');
const { importTasksMd } = require('./tasksmd');

module.exports = {
  importTrello,
  importObsidian,
  importTasksMd,
};
