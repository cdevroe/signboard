const { validateStamp } = require('./buildIdentity');
// Runs for direct electron-builder calls too, including each universal/CI target.
exports.default = async (context) => { validateStamp(context.packager.projectDir); };
