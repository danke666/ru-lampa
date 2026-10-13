(function (window) {
  'use strict';

  var app = window.RussianCinemaPlugin = window.RussianCinemaPlugin || {};

  app.RussianCinemaView = function () {
    var self = this;
    var api = app.api;
    var pageScroll = new Lampa.Scroll({ mask: true, over: true, scroll_by_item: true, end_ratio: 2 });
    var root = $('<div class="russian-cinema-page"></div>');
    var controls = $('<div class="russian-cinema-controls"></div>');
    var movies = createRail('movie', 'Фильмы');
    var series = createRail('tv', 'Сериалы');
    var pageLimit = 4;
    var pageFillTarget = 12;
    var destroyed = false;
    var lastFocus = null;
    var filters = app.createFilters(api, keepInView, onFilterChange);

    this.create = function () {
      root.append(controls, movies.section, series.section);
      pageScroll.append(root);
      renderControls();
      loadRail(movies, true);
      loadRail(series, true);
      return this.render();
    };
    this.render = function () { return pageScroll.render(); };
    this.start = function () {
      Lampa.Controller.add('content', {
        toggle: updateCollection,
        up: function () {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function () {
          if (Navigator.canmove('down')) Navigator.move('down');
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        right: function () {
          Navigator.move('right');
        },
        back: self.back
      });
      if (Lampa.Platform && Lampa.Platform.screen && Lampa.Platform.screen('tv') && Lampa.Keypad && Lampa.Keypad.listener) {
        Lampa.Keypad.listener.follow('keydown', onTvKeydown);
      }
      Lampa.Controller.toggle('content');
    };
    this.back = function () { Lampa.Activity.backward(); };
    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () {
      destroyed = true;
      if (Lampa.Keypad && Lampa.Keypad.listener) Lampa.Keypad.listener.remove('keydown', onTvKeydown);
      pageScroll.destroy();
      movies.scroll.destroy();
      series.scroll.destroy();
    };

    function onFilterChange(action) {
      renderControls();
      if (action) {
        loadAll(true, action === 'reset');
      }
    }

    function renderControls() {
      controls.empty().append(filters.createButton());
    }

    function updateCollection() {
      var active = Lampa.Controller.enabled && Lampa.Controller.enabled();
      if (!active || active.name !== 'content') return;

      var html = pageScroll.render();
      Lampa.Controller.collectionSet(html);
      var focus = lastFocus && html[0].contains(lastFocus) ? lastFocus : false;
      Lampa.Controller.collectionFocus(focus, html);
    }

    function onTvKeydown(input) {
      var active = Lampa.Controller.enabled && Lampa.Controller.enabled();
      if (destroyed || !input || input.enabled === false || !active || active.name !== 'content') return;

      var direction = ({ 19: 'up', 20: 'down', 21: 'left', 22: 'right' })[Number(input.code)];
      if (!direction) return;

      if (input.event && input.event.preventDefault) input.event.preventDefault();
      Lampa.Controller.move(direction);
    }

    function createRail(type, title) {
      var rail = {
        type: type,
        page: 1,
        version: 0,
        hasMore: false,
        loading: false,
        section: $('<section class="russian-cinema-rail"></section>'),
        status: $('<div class="russian-cinema-rail-status"></div>'),
        cards: $('<div class="russian-cinema-list"></div>'),
        scroll: new Lampa.Scroll({ horizontal: true, step: 300, mask: true, over: true })
      };
      var heading = $('<div class="russian-cinema-rail-title"></div>').text(title);
      rail.scroll.append(rail.cards);
      rail.section.append(heading, rail.status, rail.scroll.render());
      return rail;
    }

    function keepInView(element, rail) {
      element.on('hover:focus', function () {
        lastFocus = this;
        if (rail) {
          rail.scroll.update(this);
          if ($(this).hasClass('russian-cinema-item')) {
            var items = rail.cards.find('.russian-cinema-item');
            var index = items.index(this);
            if (rail.hasMore && !rail.loading && index >= Math.max(0, items.length - 8)) {
              loadRail(rail, false);
            }
          }
        }
        pageScroll.update(this);
      });
      return element;
    }

    function loadAll(reset, force) {
      loadRail(movies, reset, force);
      loadRail(series, reset, force);
    }

    function loadRail(rail, reset, force) {
      if (rail.loading && !reset) return;
      if (reset) {
        rail.version += 1;
        rail.page = 1;
        rail.hasMore = false;
        rail.cards.empty();
        var activeController = Lampa.Controller.enabled && Lampa.Controller.enabled();
        if (activeController && activeController.name === 'content') updateCollection();
      }
      rail.loading = true;
      rail.status.text('Загружаю…');
      scanPages(rail, rail.version, force, 0, 0);
    }

    function scanPages(rail, version, force, pagesScanned, found) {
      if (version !== rail.version || destroyed) return;
      var requestedPage = rail.page;
      Promise.resolve(api.getPage(rail.type, requestedPage, filters.state, force)).then(function (data) {
        if (version !== rail.version || destroyed) return;
        data.items.forEach(function (item) { renderItem(rail, item); });
        found += data.items.length;
        rail.page = requestedPage + 1;
        rail.hasMore = data.hasMore;
        if (rail.hasMore && found < pageFillTarget && pagesScanned + 1 < pageLimit) {
          scanPages(rail, version, force, pagesScanned + 1, found);
          return;
        }

        rail.loading = false;
        var total = rail.cards.find('.russian-cinema-item').length;
        if (!total) {
          rail.status.text(filters.state.strictStudios ? 'Нет карточек с российской студией на этих страницах.' : 'Нет карточек с российской страной производства на этих страницах.');
        } else {
          rail.status.empty();
        }
        updateCollection();
      }).catch(function (error) {
        showError(rail, error, version);
      });
    }

    function showError(rail, error, version) {
      if (version !== rail.version) return;
      rail.loading = false;
      if (destroyed) return;
      rail.status.text(error && error.message ? error.message : 'Не удалось загрузить каталог. Проверьте TMDB и API Key.');
      var retry = keepInView($('<div class="russian-cinema-action selector">Повторить</div>'), rail);
      retry.on('hover:enter', function () { loadRail(rail, true, true); });
      rail.cards.append(retry);
      updateCollection();
    }

    function renderItem(rail, item) {
      var title = item.title || item.name || item.original_title || item.original_name || 'Без названия';
      var year = (item.release_date || item.first_air_date || '').slice(0, 4);
      var row = keepInView($('<div class="russian-cinema-item selector"><div class="russian-cinema-poster"><div class="russian-cinema-poster-fallback">Нет постера</div><div class="russian-cinema-rating"></div></div><div class="russian-cinema-title"></div><div class="russian-cinema-meta"></div></div>'), rail);
      if (item.poster_path) {
        var fallbackPaths = (item.poster_fallbacks || []).slice();
        var poster = $('<img class="russian-cinema-poster-image" alt="">');
        function imageUrl(path) {
          var cleanPath = String(path || '').replace(/^\/+/, '');
          return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/w500/' + cleanPath) : 'https://image.tmdb.org/t/p/w500/' + cleanPath;
        }
        poster.on('load', function () { row.find('.russian-cinema-poster-fallback').remove(); });
        poster.on('error', function () {
          if (Lampa.TMDB && Lampa.TMDB.broken) Lampa.TMDB.broken();
          if (fallbackPaths.length) poster.attr('src', imageUrl(fallbackPaths.shift()));
        });
        poster.attr('src', imageUrl(item.poster_path));
        row.find('.russian-cinema-poster').prepend(poster);
      }
      row.find('.russian-cinema-title').text(title);
      row.find('.russian-cinema-meta').text(year);
      if (item.vote_average) row.find('.russian-cinema-rating').text(Number(item.vote_average).toFixed(1));
      row.on('hover:enter', function () {
        Lampa.Activity.push({
          url: '', title: title, component: 'full', id: item.id,
          method: rail.type, card: item, source: 'tmdb'
        });
      });
      rail.cards.append(row);
    }
  };
})(window);
