const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGasFiles(relativePaths) {
  const sandbox = {};
  vm.createContext(sandbox);
  relativePaths.forEach((relativePath) => {
    const fullPath = path.join(__dirname, '..', '..', relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, sandbox);
  });
  return sandbox;
}

module.exports = { loadGasFiles };
