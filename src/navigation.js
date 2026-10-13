(function (window) {
  'use strict';

  var app = window.RussianCinemaPlugin = window.RussianCinemaPlugin || {};

  app.createNavigation = function (options) {
    var activeRow = 0;

    function rows() {
      return options.rows();
    }

    function set(index) {
      activeRow = Math.max(0, Math.min(index, rows().length - 1));
      return activeRow;
    }

    function move(direction) {
      var next = activeRow + direction;
      if (next < 0) {
        activeRow = 0;
        options.onHead();
        return;
      }
      if (next >= rows().length) return;

      activeRow = next;
      options.update();
      options.scrollTo(rows()[activeRow]);
    }

    return {
      current: function () { return activeRow; },
      row: function () { return rows()[activeRow]; },
      set: set,
      move: move
    };
  };
})(window);
