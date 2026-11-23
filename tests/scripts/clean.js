// Deletes the results of the previous run, so reports only show this run. Run by `npm test` before every run.
const fs = require('fs');
const path = require('path');

for (const dir of ['allure-results', 'reports', 'test-results', '.features-gen']) {
  fs.rmSync(path.join(__dirname, '..', dir), { recursive: true, force: true });
}
