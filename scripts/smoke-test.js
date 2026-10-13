'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var components = {};
var settings = [];
var styles = [];
var iconButton = { addClass: function () { return this; } };
var document = {
  head: { appendChild: function (style) { styles.push(style); } },
  getElementById: function () { return null; },
  createElement: function (tag) { return { tagName: tag }; }
};
var Lampa = {
  SettingsApi: {
    addComponent: function (item) { settings.push(item); },
    addParam: function (item) { settings.push(item); }
  },
  Component: { add: function (name, component) { components[name] = component; } },
  Head: { addIcon: function () { return iconButton; } },
  Menu: { addButton: function () { return iconButton; } }
};
var context = { document: document, Lampa: Lampa, appready: true };
context.window = context;

vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'lampa', 'russian-cinema.js'), 'utf8'), context);

assert.strictEqual(typeof components.russian_cinema_view, 'function');
assert.strictEqual(settings.length, 2);
assert.strictEqual(styles.length, 1);
assert.ok(styles[0].textContent.indexOf('.russian-cinema-item') !== -1);

var navigationEvents = [];
var navigation = context.RussianCinemaPlugin.createNavigation({
  rows: function () { return [null, 'movies', 'series']; },
  update: function () { navigationEvents.push('update'); },
  scrollTo: function (row) { navigationEvents.push(row); },
  onHead: function () { navigationEvents.push('head'); }
});
navigation.move(1);
navigation.move(1);
navigation.move(1);
assert.strictEqual(navigation.current(), 2);
assert.deepStrictEqual(navigationEvents, ['update', 'movies', 'update', 'series']);
navigation.move(-1);
navigation.move(-1);
navigation.move(-1);
assert.strictEqual(navigation.current(), 0);
assert.strictEqual(navigationEvents[navigationEvents.length - 1], 'head');
process.stdout.write('Plugin bootstrap smoke test passed.\n');
