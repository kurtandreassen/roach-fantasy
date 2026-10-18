// Where synced state lives. Defaults to data/state in the repo; on Railway,
// set STATE_DIR to a path inside a mounted volume so redeploys keep the data.
const path = require('path');

const STATE_DIR = process.env.STATE_DIR
  || path.join(__dirname, '..', '..', 'data', 'state');

module.exports = { STATE_DIR };
