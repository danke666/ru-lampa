(function () {
  'use strict';

  var READY = 'plugin_russian_cinema_ready';
  var ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 4v16M16 4v16M3 9h5m-5 6h5m8-6h5m-5 6h5" stroke="currentColor" stroke-width="1.5"/></svg>';
  var cache = {};

  function start() {
    if (window[READY] || !window.Lampa) return;
    window[READY] = true;

    Lampa.SettingsApi.addComponent({
      component: 'russian_cinema',
      name: 'Российское кино',
      icon: ICON
    });
    Lampa.SettingsApi.addParam({
      component: 'russian_cinema',
      param: { name: 'russian_cinema_tmdb_key', type: 'input', default: '', values: '', placeholder: 'TMDB API Key v3' },
      field: { name: 'TMDB API Key v3', description: 'Ключ v3 из настроек TMDB. Нужен, если встроенный ключ этой версии Lampa отклоняется. Сохраняется локально в настройках Lampa.' }
    });

    Lampa.Component.add('russian_cinema_view', RussianCinemaView);
    if (Lampa.Head && Lampa.Head.addIcon) {
      Lampa.Head.addIcon(ICON, openCatalog).addClass('russian-cinema-head');
    }
    if (Lampa.Menu && Lampa.Menu.addButton) {
      Lampa.Menu.addButton(ICON, 'Российское кино', openCatalog).addClass('russian-cinema-menu');
    }
  }

  function openCatalog() {
    Lampa.Activity.push({ url: '', title: 'Российское кино', component: 'russian_cinema_view' });
  }

  function request(endpoint) {
    var path = endpoint.replace(/^\/+/, '');
    var customKey = '';
    if (Lampa.Storage) {
      if (Lampa.Storage.field) customKey = Lampa.Storage.field('russian_cinema_tmdb_key') || '';
      if (!customKey && Lampa.Storage.get) customKey = Lampa.Storage.get('russian_cinema_tmdb_key', '') || '';
    }
    var key = customKey || (Lampa.TMDB && Lampa.TMDB.key ? Lampa.TMDB.key() : '');
    if (!key) return Promise.reject(new Error('В этой версии Lampa недоступен встроенный ключ TMDB. Обновите приложение.'));
    var isAccessToken = key.indexOf('.') !== -1 || key.indexOf('eyJ') === 0;
    var url = Lampa.TMDB && Lampa.TMDB.api ? Lampa.TMDB.api(path) : 'https://api.themoviedb.org/3/' + path;
    if (!isAccessToken) url += (url.indexOf('?') === -1 ? '?' : '&') + 'api_key=' + encodeURIComponent(key);
    var network = Lampa.Reguest ? new Lampa.Reguest() : (Lampa.Network || null);

    if (network && network.silent) {
      return new Promise(function (resolve, reject) {
        network.silent(url, function (data) {
          if (data && data.success === false) {
            reject(new Error(data.status_message || 'TMDB отклонил запрос. Проверьте API Key.'));
          } else {
            resolve(data);
          }
        }, function (error, exception) {
          var statusCode = error && Number(error.status || (network.errorCode && network.errorCode(error))) || 0;
          var body = network.errorJSON ? network.errorJSON(error) : (error && error.responseJSON) || {};
          var decoded = network.errorDecode ? network.errorDecode(error, exception) : '';
          var detail = body.status_message || body.text || (error && (error.statusText || error.message)) || decoded || '';
          if (!statusCode) {
            var code = String(detail).match(/\b([45]\d\d)\b/);
            if (code) statusCode = Number(code[1]);
          }
          var message;

          if (statusCode === 401) {
            message = 'HTTP 401: TMDB отклонил ключ. Проверьте API Key v3 в настройках плагина.';
          } else if (statusCode === 403) {
            message = 'HTTP 403: доступ запрещён сервером или прокси.';
          } else if (statusCode === 404) {
            message = 'HTTP 404: адрес TMDB или прокси не найден. Проверьте настройки прокси TMDB в Lampa.';
          } else if (statusCode === 0) {
            message = 'Нет ответа от TMDB: проверьте VPN, сеть, DNS и прокси на телевизоре.';
          } else {
            message = 'Ошибка TMDB, HTTP ' + statusCode + '.';
          }

          if (detail) message += ' Ответ: ' + String(detail).replace(/\s+/g, ' ').slice(0, 180);
          reject(new Error(message));
        }, false, isAccessToken ? { headers: { Authorization: 'Bearer ' + key } } : undefined);
      });
    }

    var headers = { accept: 'application/json' };
    if (isAccessToken) headers.Authorization = 'Bearer ' + key;
    return fetch(url, { headers: headers }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          if (response.status === 401) throw new Error('HTTP 401: TMDB отклонил ключ. Проверьте API Key v3 в настройках плагина.');
          throw new Error(data.status_message || 'TMDB вернул ошибку (' + response.status + ').');
        }
        return data;
      });
    });
  }

  function RussianCinemaView() {
    var self = this;
    var pageScroll = new Lampa.Scroll({ mask: true, over: true });
    var root = $('<div class="russian-cinema-page"></div>');
    var controls = $('<div class="russian-cinema-controls"></div>');
    var movies = createRail('movie', 'Фильмы');
    var series = createRail('tv', 'Сериалы');
    var genresByType = {};
    var genreRequests = {};
    var genreNames = [];
    var strictStudios = false;
    var year = '';
    var minRating = 0;
    var sort = 'popularity.desc';
    var pageLimit = 4;
    var pageFillTarget = 12;
    var destroyed = false;
    var lastFocus = null;

    this.create = function () {
      root.append(controls, movies.section, series.section);
      pageScroll.append(root);
      renderControls();
      loadGenres('movie').then(renderControls);
      loadGenres('tv').then(renderControls);
      loadRail(movies, true);
      loadRail(series, true);
      return this.render();
    };
    this.render = function () { return pageScroll.render(); };
    this.start = function () {
      Lampa.Controller.add('content', {
        toggle: function () {
          updateCollection();
        },
        up: function () {
          moveOrScroll('up');
        },
        down: function () {
          moveOrScroll('down');
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        right: function () {
          if (Navigator.canmove('right')) Navigator.move('right');
        },
        back: self.back
      });
      if (!Lampa.Platform || !Lampa.Platform.screen || !Lampa.Platform.screen('tv')) {
        window.addEventListener('keydown', onBrowserKeydown, true);
      }
      Lampa.Controller.toggle('content');
    };
    this.back = function () { Lampa.Activity.backward(); };
    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () {
      destroyed = true;
      window.removeEventListener('keydown', onBrowserKeydown, true);
      pageScroll.destroy();
      movies.scroll.destroy();
      series.scroll.destroy();
    };

    function updateCollection() {
      var active = Lampa.Controller.enabled && Lampa.Controller.enabled();
      if (!active || active.name !== 'content') return;

      var container = pageScroll.render();
      Lampa.Controller.collectionSet(container);
      var focus = lastFocus && container[0].contains(lastFocus) ? lastFocus : false;
      Lampa.Controller.collectionFocus(focus, container);
    }

    function moveOrScroll(direction) {
      if (focusAdjacentRail(direction)) return;

      if (Navigator.canmove(direction)) {
        Navigator.move(direction);
        return;
      }

      var viewport = pageScroll.render()[0];
      var step = Math.max(180, Math.round(viewport.clientHeight * 0.7));
      pageScroll.wheel(direction === 'down' ? step : -step);
    }

    function onBrowserKeydown(event) {
      var active = Lampa.Controller.enabled && Lampa.Controller.enabled();
      if (destroyed || event.defaultPrevented || !active || active.name !== 'content') return;

      var keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      var direction = keys[event.key] || ({ 38: 'up', 40: 'down', 37: 'left', 39: 'right' })[event.keyCode];
      if (!direction) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (direction === 'up' || direction === 'down') {
        moveOrScroll(direction);
      } else if (Navigator.canmove(direction)) {
        Navigator.move(direction);
      } else if (direction === 'left') {
        Lampa.Controller.toggle('menu');
      }
    }

    function focusAdjacentRail(direction) {
      var container = pageScroll.render()[0];
      var current = lastFocus && container.contains(lastFocus) ? lastFocus : container.querySelector('.focus');
      var fromRail = movies.section[0].contains(current) ? movies : (series.section[0].contains(current) ? series : null);
      var targetRail;
      var target;

      if (direction === 'down' && current && controls[0].contains(current)) {
        targetRail = movies;
      } else if (direction === 'up' && fromRail === movies && current.classList.contains('russian-cinema-item')) {
        target = controls.querySelector('.selector');
      } else if (direction === 'down' && fromRail === movies && current.classList.contains('russian-cinema-item')) {
        targetRail = series;
      } else if (direction === 'up' && fromRail === series && current.classList.contains('russian-cinema-item')) {
        targetRail = movies;
      }

      if (targetRail) {
        var sourceItems = fromRail ? fromRail.cards.find('.russian-cinema-item').toArray() : [];
        var targetItems = targetRail.cards.find('.russian-cinema-item').toArray();
        var sourceIndex = sourceItems.indexOf(current);

        if (targetItems.length) target = targetItems[Math.min(Math.max(sourceIndex, 0), targetItems.length - 1)];
        else target = targetRail.cards.find('.selector').get(0);
      }

      if (!target) return false;
      Navigator.focus(target);
      return true;
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
        scroll: new Lampa.Scroll({ horizontal: true, mask: true, over: true })
      };
      var heading = $('<div class="russian-cinema-rail-title"></div>').text(title);
      rail.scroll.append(rail.cards);
      rail.section.append(heading, rail.status, rail.scroll.render());
      return rail;
    }

    function keepInView(element, rail) {
      element.on('hover:focus', function () {
        lastFocus = this;
        if (rail) rail.scroll.update(this);
        pageScroll.update(rail ? rail.section[0] : this);
      });
      return element;
    }

    function renderControls() {
      controls.empty();
      var count = genreNames.length + (year ? 1 : 0) + (minRating ? 1 : 0) + (sort !== 'popularity.desc' ? 1 : 0) + (strictStudios ? 1 : 0);
      var button = keepInView($('<div class="russian-cinema-filter selector"></div>').text('Фильтры' + (count ? ' · ' + count : '')));
      button.on('hover:enter', showFilterMenu);
      controls.append(button);
    }

    function showFilterMenu() {
      Promise.all([loadGenres('movie'), loadGenres('tv')]).then(function () {
        var options = [
          { title: 'Показать результаты', action: 'apply' },
          {
            title: 'Жанр',
            subtitle: genreNames.length ? genreNames.join(', ') : 'Любой',
            key: 'genres',
            items: buildGenreOptions()
          },
          {
            title: 'Год выпуска',
            subtitle: year || 'Любой',
            key: 'year',
            items: buildSingleOptions([{ title: 'Любой год', value: '' }].concat(yearOptions()), year)
          },
          {
            title: 'Рейтинг',
            subtitle: minRating ? 'От ' + minRating.toFixed(1) : 'Любой',
            key: 'rating',
            items: buildSingleOptions([
              { title: 'Любой рейтинг', value: 0 },
              { title: 'От 5.0', value: 5 },
              { title: 'От 6.0', value: 6 },
              { title: 'От 7.0', value: 7 },
              { title: 'От 8.0', value: 8 }
            ], minRating)
          },
          {
            title: 'Сортировка',
            subtitle: sortLabel(sort),
            key: 'sort',
            items: buildSingleOptions([
              { title: 'По популярности', value: 'popularity.desc' },
              { title: 'По рейтингу', value: 'vote_average.desc' },
              { title: 'Сначала новые', value: 'date.desc' }
            ], sort)
          },
          {
            title: 'Производство',
            subtitle: strictStudios ? 'Российские студии' : 'Страна: Россия',
            key: 'production',
            items: buildSingleOptions([
              { title: 'Страна производства: Россия', value: false },
              { title: 'Российские студии', value: true }
            ], strictStudios)
          },
          { title: 'Сбросить фильтры', action: 'reset' }
        ];

        Lampa.Select.show({
          title: Lampa.Lang && Lampa.Lang.translate ? Lampa.Lang.translate('title_filter') : 'Фильтр',
          items: options,
          onBack: function () {
            renderControls();
            Lampa.Controller.toggle('content');
          },
          onSelect: function (item) {
            if (item.action === 'apply') {
              Lampa.Controller.toggle('content');
              renderControls();
              loadAll(true);
            } else if (item.action === 'reset') {
              genreNames = [];
              year = '';
              minRating = 0;
              sort = 'popularity.desc';
              strictStudios = false;
              renderControls();
              loadAll(true, true);
              showFilterMenu();
            } else {
              showFilterSubmenu(item);
            }
          }
        });
      });
    }

    function showFilterSubmenu(menu) {
      var options = menu.items;
      var multi = menu.key === 'genres';
      Lampa.Select.show({
        title: menu.title,
        items: options,
        onBack: function () {
          renderControls();
          showFilterMenu();
        },
        onCheck: function () {
          genreNames = options.filter(function (item) { return item.checked; }).map(function (item) { return item.value; });
        },
        onSelect: function (item) {
          if (multi) return;
          if (menu.key === 'year') year = item.value;
          if (menu.key === 'rating') minRating = item.value;
          if (menu.key === 'sort') sort = item.value;
          if (menu.key === 'production') strictStudios = item.value;
          renderControls();
          showFilterMenu();
        }
      });
    }

    function buildGenreOptions() {
      var genres = [];
      var names = {};
      ['movie', 'tv'].forEach(function (mediaType) {
        (genresByType[mediaType] || []).forEach(function (item) {
          if (!names[item.name]) {
            names[item.name] = true;
            genres.push({ title: item.name, value: item.name, checkbox: true, checked: genreNames.indexOf(item.name) >= 0 });
          }
        });
      });
      return genres;
    }

    function yearOptions() {
      var items = [];
      for (var value = new Date().getFullYear(); value >= 1950; value -= 1) {
        items.push({ title: String(value), value: String(value) });
      }
      return items;
    }

    function buildSingleOptions(items, selected) {
      items.forEach(function (item) { item.selected = item.value === selected; });
      return items;
    }

    function sortLabel(value) {
      if (value === 'vote_average.desc') return 'По рейтингу';
      if (value === 'date.desc') return 'Сначала новые';
      return 'По популярности';
    }

    function loadGenres(mediaType) {
      if (genresByType[mediaType]) return Promise.resolve(genresByType[mediaType]);
      if (genreRequests[mediaType]) return genreRequests[mediaType];
      genreRequests[mediaType] = request('/genre/' + mediaType + '/list?language=ru-RU').then(function (data) {
        genresByType[mediaType] = Array.isArray(data.genres) ? data.genres : [];
        return genresByType[mediaType];
      }).catch(function () {
        genresByType[mediaType] = [];
        return genresByType[mediaType];
      });
      return genreRequests[mediaType];
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
      var result;
      try {
        result = getPage(rail.type, requestedPage, force);
      } catch (error) {
        showError(rail, error, version);
        return;
      }
      Promise.resolve(result).then(function (data) {
        if (version !== rail.version) return;
        if (destroyed) return;
        data.items.forEach(function (item) { renderItem(rail, item); });
        found += data.items.length;
        rail.page = requestedPage + 1;
        rail.hasMore = data.hasMore;
        if (found < pageFillTarget && rail.hasMore && pagesScanned + 1 < pageLimit) {
          scanPages(rail, version, force, pagesScanned + 1, found);
          return;
        }

        rail.loading = false;
        var total = rail.cards.find('.russian-cinema-item').length;
        if (!total) {
          rail.status.text(strictStudios ? 'Нет карточек с российской студией на этих страницах.' : 'Нет карточек с российской страной производства на этих страницах.');
        } else if (strictStudios) {
          rail.status.text('Российские студии по данным TMDB.');
        } else {
          rail.status.text('Страна производства RU по данным TMDB.');
        }
        if (rail.hasMore) appendMore(rail);
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

    function getPage(mediaType, pageNumber, force) {
      var genreIds = (genresByType[mediaType] || []).filter(function (item) {
        return genreNames.indexOf(item.name) >= 0;
      }).map(function (item) { return String(item.id); });
      var cacheKey = [mediaType, pageNumber, strictStudios, genreNames.slice().sort().join(','), year, minRating, sort].join(':');
      var saved = cache[cacheKey];
      if (!force && saved && Date.now() - saved.time < 15 * 60 * 1000) return Promise.resolve(saved.value);

      var endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
      var mediaSort = sort === 'date.desc' ? (mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : sort;
      var params = 'page=' + pageNumber + '&language=ru-RU&include_adult=false&sort_by=' + encodeURIComponent(mediaSort) + '&with_origin_country=RU';
      if (genreIds.length) params += '&with_genres=' + encodeURIComponent(genreIds.join(','));
      if (year) params += (mediaType === 'tv' ? '&first_air_date_year=' : '&primary_release_year=') + encodeURIComponent(year);
      if (minRating) params += '&vote_average.gte=' + encodeURIComponent(minRating);

      return request(endpoint + '?' + params).then(function (data) {
        var candidates = Array.isArray(data.results) ? data.results : [];
        return mapInBatches(candidates, 4, function (candidate) {
          return request('/' + mediaType + '/' + candidate.id + '?language=ru-RU').then(function (detail) {
            var studios = (detail.production_companies || []).filter(function (company) {
              return company.origin_country === 'RU';
            });
            if (strictStudios && !studios.length) return null;
            var companies = strictStudios ? studios : (detail.production_companies || []);
            return normalize(detail, mediaType, companies);
          }).catch(function () { return null; });
        }).then(function (items) {
          var value = {
            items: items.filter(Boolean),
            hasMore: pageNumber < Number(data.total_pages || 0)
          };
          cache[cacheKey] = { time: Date.now(), value: value };
          return value;
        });
      });
    }

    function appendMore(rail) {
      var more = keepInView($('<div class="russian-cinema-action selector">Загрузить ещё</div>'), rail);
      more.on('hover:enter', function () {
        if (rail.loading || !rail.hasMore) return;
        more.remove();
        loadRail(rail, false);
      });
      rail.cards.append(more);
    }

    function renderItem(rail, item) {
      var title = item.title || item.name || item.original_title || item.original_name || 'Без названия';
      var year = (item.release_date || item.first_air_date || '').slice(0, 4);
      var studios = item.production_companies.map(function (company) { return company.name; }).filter(Boolean).join(', ');
      var row = keepInView($('<div class="russian-cinema-item selector"><div class="russian-cinema-poster"><div class="russian-cinema-poster-fallback">Нет постера</div><div class="russian-cinema-rating"></div></div><div class="russian-cinema-title"></div><div class="russian-cinema-meta"></div></div>'), rail);
      if (item.poster_path) {
        var imageUrl = Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/w500' + item.poster_path) : 'https://image.tmdb.org/t/p/w500' + item.poster_path;
        var poster = $('<img class="russian-cinema-poster-image" alt="">').attr('src', imageUrl);
        poster.on('load', function () { row.find('.russian-cinema-poster-fallback').remove(); });
        poster.on('error', function () {
          if (Lampa.TMDB && Lampa.TMDB.broken) Lampa.TMDB.broken();
        });
        row.find('.russian-cinema-poster').prepend(poster);
      }
      row.find('.russian-cinema-title').text(title);
      row.find('.russian-cinema-meta').text((rail.type === 'tv' ? 'Сериал' : 'Фильм') + (year ? ' · ' + year : '') + (studios ? ' · ' + studios : ''));
      if (item.vote_average) row.find('.russian-cinema-rating').text('★ ' + Number(item.vote_average).toFixed(1));
      row.on('hover:enter', function () {
        Lampa.Activity.push({
          url: '', title: title, component: 'full', id: item.id,
          method: rail.type, card: item, source: 'tmdb'
        });
      });
      rail.cards.append(row);
    }
  }

  function normalize(item, mediaType, companies) {
    var series = mediaType === 'tv';
    return {
      id: Number(item.id),
      source: 'tmdb',
      media_type: mediaType,
      title: series ? (item.name || item.original_name || '') : (item.title || item.original_title || ''),
      original_title: series ? (item.original_name || item.name || '') : (item.original_title || item.title || ''),
      name: series ? (item.name || item.original_name || '') : '',
      original_name: series ? (item.original_name || item.name || '') : '',
      overview: item.overview || '',
      poster_path: item.poster_path || null,
      backdrop_path: item.backdrop_path || null,
      release_date: item.release_date || '',
      first_air_date: item.first_air_date || '',
      vote_average: Number(item.vote_average) || 0,
      vote_count: Number(item.vote_count) || 0,
      genre_ids: Array.isArray(item.genres) ? item.genres.map(function (genre) { return genre.id; }) : [],
      genres: Array.isArray(item.genres) ? item.genres : [],
      origin_country: item.origin_country || [],
      production_companies: companies.map(function (company) {
        return { id: company.id, name: company.name, origin_country: company.origin_country };
      }),
      is_series: series
    };
  }

  function mapInBatches(items, size, mapper) {
    var output = [];
    var chain = Promise.resolve();
    for (var index = 0; index < items.length; index += size) {
      (function (batch) {
        chain = chain.then(function () {
          return Promise.all(batch.map(mapper)).then(function (results) { output.push.apply(output, results); });
        });
      })(items.slice(index, index + size));
    }
    return chain.then(function () { return output; });
  }

  function addStyles() {
    if (document.getElementById('russian-cinema-styles')) return;
    var style = document.createElement('style');
    style.id = 'russian-cinema-styles';
    style.textContent = '.russian-cinema-page{padding:1.4em 2.4em 3em}.russian-cinema-controls{display:flex;flex-wrap:wrap;align-items:center;gap:.45em;margin:0 0 1.1em}.russian-cinema-filter,.russian-cinema-refresh{padding:.65em .9em;background:rgba(255,255,255,.08);border-radius:.2em;white-space:nowrap}.russian-cinema-filter.focus,.russian-cinema-refresh.focus{background:rgba(255,255,255,.22);outline:3px solid #fff;outline-offset:2px;z-index:2}.russian-cinema-rail{margin:0 0 1.4em}.russian-cinema-rail-title{font-size:1.25em;font-weight:600;margin:0 0 .25em}.russian-cinema-rail-status{min-height:1.1em;font-size:.82em;opacity:.65;margin:0 0 .35em}.russian-cinema-list{display:flex;flex-flow:row nowrap;align-items:flex-start;gap:.8em;width:max-content;min-width:100%;padding:.25em .25em .65em;box-sizing:border-box}.russian-cinema-item{flex:0 0 12em;width:12em;box-sizing:border-box;padding:.35em;border-radius:.2em;background:rgba(255,255,255,.035)}.russian-cinema-item.focus{background:rgba(255,255,255,.17);outline:3px solid #fff;outline-offset:2px;transform:scale(1.025);z-index:2}.russian-cinema-action{flex:0 0 12em;width:12em;box-sizing:border-box;padding:.65em .9em;background:rgba(255,255,255,.08);white-space:nowrap}.russian-cinema-action.focus{outline:3px solid #fff;outline-offset:2px}.russian-cinema-poster{position:relative;width:100%;height:0;padding-bottom:150%;border-radius:.18em;background:#292929;overflow:hidden}.russian-cinema-poster-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.russian-cinema-poster-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.45;font-size:.85em}.russian-cinema-rating{position:absolute;right:.35em;top:.35em;padding:.25em .4em;border-radius:.15em;background:rgba(0,0,0,.76);font-size:.85em;font-weight:600}.russian-cinema-title{margin:.5em .15em .15em;font-size:.95em;line-height:1.2;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.4em}.russian-cinema-meta{margin:.15em .15em .35em;font-size:.76em;line-height:1.25;opacity:.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:1.9em}@media(max-width:700px){.russian-cinema-page{padding:1em}.russian-cinema-list{gap:.55em}.russian-cinema-item,.russian-cinema-action{flex-basis:8.5em;width:8.5em}}';
    document.head.appendChild(style);
  }

  addStyles();
  function bootstrap() {
    if (!window.Lampa) {
      setTimeout(bootstrap, 100);
      return;
    }
    if (window.appready) {
      start();
      return;
    }
    if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') start();
      });
      return;
    }
    setTimeout(bootstrap, 100);
  }

  bootstrap();
})();
