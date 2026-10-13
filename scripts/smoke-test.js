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

function makeDom() {
  var el = {
    0: { contains: function () { return false; } },
    length: 1,
    append: function () { return el; },
    empty: function () { return el; },
    text: function () { return el; },
    find: function () { return { length: 0 }; },
    on: function () { return el; },
    closest: function () { return { length: 0 }; },
    prepend: function () { return el; },
    attr: function () { return el; }
  };
  return el;
}

var scrollMinusCalls = 0;

function ScrollMock() {
  return {
    append: function () {},
    render: function () { return makeDom(); },
    update: function () {},
    destroy: function () {},
    minus: function () { scrollMinusCalls += 1; }
  };
}

var controllerCalls = [];
var controllers = {};
var toggled = [];
var Lampa = {
  SettingsApi: {
    addComponent: function (item) { settings.push(item); },
    addParam: function (item) { settings.push(item); }
  },
  Component: { add: function (name, component) { components[name] = component; } },
  Head: { addIcon: function () { return iconButton; } },
  Menu: { addButton: function () { return iconButton; } },
  Scroll: ScrollMock,
  Controller: {
    add: function (name, calls) { controllers[name] = calls; },
    toggle: function (name) {
      toggled.push(name);
      if (name === 'content' && controllers.content && controllers.content.toggle) controllers.content.toggle();
    },
    enabled: function () { return { name: 'content' }; },
    collectionSet: function (html) { controllerCalls.push(['set', html]); },
    collectionFocus: function (target, html) { controllerCalls.push(['focus', target]); }
  }
};

var navigatorCalls = [];
var canmoveMap = { up: true, down: true, left: true, right: true };
var Navigator = {
  canmove: function (direction) { return !!canmoveMap[direction]; },
  move: function (direction) { navigatorCalls.push(direction); }
};

function $(selector) { return makeDom(); }

var context = { document: document, Lampa: Lampa, Navigator: Navigator, $: $, appready: true };
context.window = context;

var bundlePath = path.join(__dirname, '..', 'lampa', 'russian-cinema.js');
vm.runInNewContext(fs.readFileSync(bundlePath, 'utf8'), context);

assert.strictEqual(typeof components.russian_cinema_view, 'function');
assert.strictEqual(settings.length, 2);
assert.strictEqual(styles.length, 1);
assert.ok(styles[0].textContent.indexOf('.russian-cinema-item') !== -1);

// Старого кастомного трекера рядов больше нет: перемещением занимается Navigator, как в оригинале.
assert.strictEqual(context.RussianCinemaPlugin.createNavigation, undefined);
assert.ok(fs.readFileSync(bundlePath, 'utf8').indexOf('navigation.move') === -1);

// Контроллер каталога делегирует стрелки Navigator, как src/components/main|category base в lampa-source.
var view = new components.russian_cinema_view();
view.create();
assert.ok(scrollMinusCalls >= 1, 'page scroll gets viewport height via minus(), otherwise Layer never sizes it and update() is a no-op');
view.start();
var content = controllers.content;
assert.ok(content, 'content controller registered');

function reset() { navigatorCalls = []; toggled = []; controllerCalls = []; }

reset();
content.up();
assert.deepStrictEqual(navigatorCalls, ['up'], 'up with free cell moves spatially');

canmoveMap.up = false;
reset();
content.up();
assert.deepStrictEqual(navigatorCalls, []);
assert.deepStrictEqual(toggled, ['head'], 'up at top goes to head');
canmoveMap.up = true;

reset();
content.down();
assert.deepStrictEqual(navigatorCalls, ['down'], 'down moves spatially');

canmoveMap.down = false;
reset();
content.down();
assert.deepStrictEqual(navigatorCalls, [], 'down at bottom does nothing');
canmoveMap.down = true;

reset();
content.right();
assert.deepStrictEqual(navigatorCalls, ['right'], 'right moves without pre-check like original main');

canmoveMap.left = false;
reset();
content.left();
assert.deepStrictEqual(toggled, ['menu'], 'left at edge opens menu');
canmoveMap.left = true;

reset();
controllers.content.toggle();
assert.ok(controllerCalls.some(function (call) { return call[0] === 'set'; }), 'toggle sets single page collection');

process.stdout.write('Plugin bootstrap smoke test passed.\n');
