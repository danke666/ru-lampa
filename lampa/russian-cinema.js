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
    var base = Lampa.TMDB && Lampa.TMDB.api ? Lampa.TMDB.api('') : 'https://api.themoviedb.org/3/';
    var separator = path.indexOf('?') === -1 ? '?' : '&';
    var isAccessToken = key.indexOf('.') !== -1 || key.indexOf('eyJ') === 0;
    var url = base.replace(/\/+$/, '/') + path + (isAccessToken ? '' : separator + 'api_key=' + encodeURIComponent(key));
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
          var detail = body.status_message || body.text || (error && (error.statusText || error.message)) || '';
          var message;

          if (statusCode === 401) {
            message = 'HTTP 401: TMDB отклонил ключ. Проверьте API Key v3 в настройках плагина.';
          } else if (statusCode === 403) {
            message = 'HTTP 403: доступ запрещён сервером или прокси.';
          } else if (statusCode === 0) {
            message = 'Нет ответа от TMDB: проверьте VPN, сеть, DNS и прокси на телевизоре.';
          } else {
            message = 'Ошибка TMDB, HTTP ' + statusCode + '.';
          }

          if (detail) message += ' Ответ: ' + String(detail).replace(/\s+/g, ' ').slice(0, 180);
          else if (network.errorDecode) message += ' ' + network.errorDecode(error, exception);
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
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var root = $('<div class="russian-cinema-page"></div>');
    var controls = $('<div class="russian-cinema-controls"></div>');
    var status = $('<div class="russian-cinema-status"></div>');
    var list = $('<div class="russian-cinema-list"></div>');
    var type = 'movie';
    var genresByType = {};
    var genreId = '';
    var genreName = 'Все жанры';
    var strictStudios = false;
    var year = '';
    var minRating = 0;
    var sort = 'popularity.desc';
    var page = 1;
    var loadVersion = 0;
    var pageLimit = 4;
    var pageFillTarget = 18;
    var hasMore = false;
    var loading = false;
    var destroyed = false;

    this.create = function () {
      root.append(controls, status, list);
      scroll.append(root);
      renderControls();
      Lampa.Controller.collectionSet(scroll.render(), scroll.render());
      loadGenres(type);
      load(true);
      return this.render();
    };
    this.render = function () { return scroll.render(); };
    this.start = function () {
      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), scroll.render());
          Lampa.Controller.collectionFocus(false, scroll.render());
        },
        up: function () {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function () { Navigator.move('down'); },
        left: function () { Lampa.Controller.toggle('menu'); },
        back: self.back
      });
      Lampa.Controller.toggle('content');
    };
    this.back = function () { Lampa.Activity.backward(); };
    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () {
      destroyed = true;
      scroll.destroy();
    };

    function renderControls() {
      controls.empty();
      [
        { value: 'movie', label: 'Фильмы' },
        { value: 'tv', label: 'Сериалы' }
      ].forEach(function (option) {
        var button = $('<div class="russian-cinema-tab selector"></div>').text(option.label);
        if (option.value === type) button.addClass('russian-cinema-tab--active');
        button.on('hover:enter', function () {
          if (type === option.value) return;
          type = option.value;
          if (sort.indexOf('_date.desc') !== -1) {
            sort = type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc';
          }
          genreId = '';
          genreName = 'Все жанры';
          renderControls();
          loadGenres(type);
          load(true);
        });
        controls.append(button);
      });

      addFilter('Жанр: ' + genreName, selectGenre);
      addFilter('Режим: ' + (strictStudios ? 'студии RU' : 'широкий'), selectProductionMode);
      addFilter('Год: ' + (year || 'любой'), selectYear);
      addFilter('Рейтинг: ' + (minRating ? minRating.toFixed(1) + '+' : 'любой'), selectRating);
      addFilter('Сортировка: ' + sortLabel(sort), selectSort);

      var refresh = $('<div class="russian-cinema-refresh selector">Сбросить</div>');
      refresh.on('hover:enter', function () {
        genreId = '';
        genreName = 'Все жанры';
        strictStudios = false;
        year = '';
        minRating = 0;
        sort = 'popularity.desc';
        renderControls();
        load(true, true);
      });
      controls.append(refresh);

      function addFilter(label, action) {
        var button = $('<div class="russian-cinema-filter selector"></div>').text(label);
        button.on('hover:enter', action);
        controls.append(button);
      }

      function selectGenre() {
        var genres = genresByType[type] || [];
        if (!genres.length) {
          if (Object.prototype.hasOwnProperty.call(genresByType, type)) {
            status.text('Не удалось загрузить жанры TMDB. Проверьте подключение и попробуйте снова.');
            return;
          }
          loadGenres(type, function () {
            var loaded = genresByType[type] || [];
            if (loaded.length) selectGenre();
            else status.text('Не удалось загрузить жанры TMDB. Проверьте подключение и попробуйте снова.');
          });
          return;
        }
        Lampa.Select.show({
          title: 'Жанр',
          items: [{ title: 'Все жанры', id: '' }].concat(genres.map(function (item) {
            return { title: item.name, id: String(item.id) };
          })),
          onSelect: function (item) {
            genreId = item.id;
            genreName = item.title;
            renderControls();
            load(true);
          }
        });
      }

      function selectYear() {
        var currentYear = new Date().getFullYear();
        var items = [{ title: 'Любой год', value: '' }];
        for (var value = currentYear; value >= 1950; value -= 1) {
          items.push({ title: String(value), value: String(value) });
        }
        Lampa.Select.show({
          title: 'Год выпуска',
          items: items,
          onSelect: function (item) {
            year = item.value;
            renderControls();
            load(true);
          }
        });
      }

      function selectProductionMode() {
        Lampa.Select.show({
          title: 'Российское производство',
          items: [
            { title: 'Шире: страна производства Россия', value: false },
            { title: 'Строго: российские студии', value: true }
          ],
          onSelect: function (item) {
            strictStudios = item.value;
            renderControls();
            load(true);
          }
        });
      }

      function selectRating() {
        Lampa.Select.show({
          title: 'Минимальный рейтинг',
          items: [
            { title: 'Любой рейтинг', value: 0 },
            { title: 'От 5.0', value: 5 },
            { title: 'От 6.0', value: 6 },
            { title: 'От 7.0', value: 7 },
            { title: 'От 8.0', value: 8 }
          ],
          onSelect: function (item) {
            minRating = item.value;
            renderControls();
            load(true);
          }
        });
      }

      function selectSort() {
        Lampa.Select.show({
          title: 'Сортировка',
          items: [
            { title: 'По популярности', value: 'popularity.desc' },
            { title: 'По рейтингу', value: 'vote_average.desc' },
            { title: 'Сначала новые', value: type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc' }
          ],
          onSelect: function (item) {
            sort = item.value;
            renderControls();
            load(true);
          }
        });
      }

      function sortLabel(value) {
        if (value === 'vote_average.desc') return 'по рейтингу';
        if (value.indexOf('_date.desc') !== -1) return 'сначала новые';
        return 'по популярности';
      }
    }

    function loadGenres(mediaType, callback) {
      if (genresByType[mediaType]) {
        if (callback) callback();
        return;
      }
      request('/genre/' + mediaType + '/list?language=ru-RU').then(function (data) {
        genresByType[mediaType] = Array.isArray(data.genres) ? data.genres : [];
        if (mediaType === type) renderControls();
        if (callback) callback();
      }).catch(function () {
        delete genresByType[mediaType];
        if (callback) callback();
      });
    }

    function load(reset, force) {
      if (loading && !reset) return;
      if (reset) {
        loadVersion += 1;
        page = 1;
        hasMore = false;
        list.empty();
      }
      var version = loadVersion;
      loading = true;
      status.text('Загружаю каталог…');
      scanPages(version, force, 0, 0);
    }

    function scanPages(version, force, pagesScanned, found) {
      if (version !== loadVersion || destroyed) return;
      var requestedPage = page;
      status.text('Загружаю каталог… страница ' + requestedPage);
      var result;
      try {
        result = getPage(type, requestedPage, force);
      } catch (error) {
        showError(error, version);
        return;
      }
      Promise.resolve(result).then(function (data) {
        if (version !== loadVersion) return;
        if (destroyed) return;
        data.items.forEach(renderItem);
        found += data.items.length;
        page = requestedPage + 1;
        hasMore = data.hasMore;
        if (found < pageFillTarget && hasMore && pagesScanned + 1 < pageLimit) {
          scanPages(version, force, pagesScanned + 1, found);
          return;
        }

        loading = false;
        var total = list.find('.russian-cinema-item').length;
        if (!total) {
          status.text(strictStudios ? 'Не нашёл карточек с российской студией на проверенных страницах.' : 'Не нашёл карточек с российской страной производства на проверенных страницах.');
        } else if (strictStudios) {
          status.text('Строгий режим: студии с отметкой RU в TMDB.');
        } else {
          status.text('Широкий режим: страна производства RU по данным TMDB.');
        }
        if (hasMore) appendMore();
        Lampa.Controller.collectionSet(scroll.render(), scroll.render());
      }).catch(function (error) {
        showError(error, version);
      });
    }

    function showError(error, version) {
      if (version !== loadVersion) return;
      loading = false;
      if (destroyed) return;
      status.text(error && error.message ? error.message : 'Не удалось загрузить каталог. Проверьте соединение с TMDB и API Key.');
      var retry = $('<div class="russian-cinema-action selector">Повторить</div>');
      retry.on('hover:enter', function () { load(true, true); });
      list.append(retry);
      Lampa.Controller.collectionSet(scroll.render(), scroll.render());
    }

    function getPage(mediaType, pageNumber, force) {
      var cacheKey = [mediaType, pageNumber, strictStudios, genreId, year, minRating, sort].join(':');
      var saved = cache[cacheKey];
      if (!force && saved && Date.now() - saved.time < 15 * 60 * 1000) return Promise.resolve(saved.value);

      var endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
      var params = 'page=' + pageNumber + '&language=ru-RU&include_adult=false&sort_by=' + encodeURIComponent(sort) + '&with_origin_country=RU';
      if (genreId) params += '&with_genres=' + encodeURIComponent(genreId);
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

    function appendMore() {
      var more = $('<div class="russian-cinema-action selector">Загрузить ещё</div>');
      more.on('hover:enter', function () {
        if (loading || !hasMore) return;
        more.remove();
        load(false);
      });
      list.append(more);
    }

    function renderItem(item) {
      var title = item.title || item.name || item.original_title || item.original_name || 'Без названия';
      var year = (item.release_date || item.first_air_date || '').slice(0, 4);
      var studios = item.production_companies.map(function (company) { return company.name; }).filter(Boolean).join(', ');
      var row = $('<div class="russian-cinema-item selector"><div class="russian-cinema-poster"><div class="russian-cinema-poster-fallback">Нет постера</div><div class="russian-cinema-rating"></div></div><div class="russian-cinema-title"></div><div class="russian-cinema-meta"></div></div>');
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
      row.find('.russian-cinema-meta').text((type === 'tv' ? 'Сериал' : 'Фильм') + (year ? ' · ' + year : '') + (studios ? ' · ' + studios : ''));
      if (item.vote_average) row.find('.russian-cinema-rating').text('★ ' + Number(item.vote_average).toFixed(1));
      row.on('hover:enter', function () {
        Lampa.Activity.push({
          url: '', title: title, component: 'full', id: item.id,
          method: type, card: item, source: 'tmdb'
        });
      });
      list.append(row);
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
    style.textContent = '.russian-cinema-page{padding:1.4em 2.4em 3em}.russian-cinema-controls{display:flex;flex-wrap:wrap;align-items:center;gap:.45em;margin:0 0 .8em}.russian-cinema-tab,.russian-cinema-filter,.russian-cinema-refresh,.russian-cinema-action{padding:.65em .9em;background:rgba(255,255,255,.08);border-radius:.2em;white-space:nowrap}.russian-cinema-tab.focus,.russian-cinema-filter.focus,.russian-cinema-refresh.focus,.russian-cinema-action.focus{background:rgba(255,255,255,.22)}.russian-cinema-tab--active{box-shadow:inset 0 -2px currentColor}.russian-cinema-status{min-height:1.4em;font-size:.9em;opacity:.72;margin:.2em 0 .8em}.russian-cinema-list{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.85em}.russian-cinema-item{width:calc((100% - 4.25em)/6);min-width:9.2em;box-sizing:border-box;padding:.35em;border-radius:.2em;background:rgba(255,255,255,.035)}.russian-cinema-item.focus{background:rgba(255,255,255,.17);transform:scale(1.025);z-index:1}.russian-cinema-poster{position:relative;width:100%;height:0;padding-bottom:150%;border-radius:.18em;background:#292929;overflow:hidden}.russian-cinema-poster-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.russian-cinema-poster-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.45;font-size:.85em}.russian-cinema-rating{position:absolute;right:.35em;top:.35em;padding:.25em .4em;border-radius:.15em;background:rgba(0,0,0,.76);font-size:.85em;font-weight:600}.russian-cinema-title{margin:.5em .15em .15em;font-size:.95em;line-height:1.2;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.4em}.russian-cinema-meta{margin:.15em .15em .35em;font-size:.76em;line-height:1.25;opacity:.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:1.9em}.russian-cinema-action{width:100%;box-sizing:border-box}@media(max-width:700px){.russian-cinema-page{padding:1em}.russian-cinema-list{gap:.55em}.russian-cinema-item{width:calc((100% - 1.65em)/4);min-width:7em}}';
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
