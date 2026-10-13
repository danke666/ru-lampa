'use strict';

var childProcess = require('child_process');
var path = require('path');

require('./build');
childProcess.execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'lampa', 'russian-cinema.js')], { stdio: 'inherit' });
require('./smoke-test');
