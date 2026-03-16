#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  const output = execSync('npm test -- ./src/pages/Chat.test.js --no-coverage', {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(output);
} catch (error) {
  console.log(error.stdout);
  console.log(error.stderr);
  process.exit(error.status);
}
