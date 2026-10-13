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
      param: { name: 'russian_cinema_tmdb_key', type: 'input', default: '', values: '', placeholder: 'TMDB API Key' },
      field: { name: 'TMDB API Key', description: 'Ключ API v3 из настроек TMDB. Ключ сохраняется в Lampa на этом устройстве.' }
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
    var key = Lampa.Storage.get('russian_cinema_tmdb_key', '') || '';
    if (!key) return Promise.reject(new Error('Добавьте TMDB API Key в настройках «Российское кино».'));

    var separator = endpoint.indexOf('?') === -1 ? '?' : '&';
    var url = 'https://api.themoviedb.org/3' + endpoint + separator + 'api_key=' + encodeURIComponent(key);
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.status_message || 'TMDB вернул ошибку (' + response.status + '). Проверьте API Key.');
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
    var page = 1;
    var hasMore = false;
    var loading = false;
    var destroyed = false;

    this.create = function () {
      root.append(controls, status, list);
      scroll.append(root);
      renderControls();
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
          if (type === option.value || loading) return;
          type = option.value;
          renderControls();
          load(true);
        });
        controls.append(button);
      });

      var refresh = $('<div class="russian-cinema-refresh selector">Обновить</div>');
      refresh.on('hover:enter', function () { load(true, true); });
      controls.append(refresh);
    }

    function load(reset, force) {
      if (loading) return;
      if (reset) {
        page = 1;
        hasMore = false;
        list.empty();
      }
      loading = true;
      status.text('Загружаю каталог TMDB…');
      getPage(type, page, force).then(function (data) {
        loading = false;
        if (destroyed) return;
        if (reset) list.empty();
        data.items.forEach(renderItem);
        hasMore = data.hasMore;
        if (!data.items.length && page === 1) {
          status.text('Не нашёл карточек с подтверждённой российской студией.');
        } else {
          status.text('В каталоге показаны произведения с российской производственной компанией по данным TMDB.');
        }
        if (hasMore) appendMore();
        Lampa.Controller.collectionSet(scroll.render(), scroll.render());
      }).catch(function (error) {
        loading = false;
        if (destroyed) return;
        status.text(error.message || 'Не удалось загрузить каталог.');
        var retry = $('<div class="russian-cinema-action selector">Повторить</div>');
        retry.on('hover:enter', function () { load(true, true); });
        list.append(retry);
        Lampa.Controller.collectionSet(scroll.render(), scroll.render());
      });
    }

    function getPage(mediaType, pageNumber, force) {
      var cacheKey = mediaType + ':' + pageNumber;
      var saved = cache[cacheKey];
      if (!force && saved && Date.now() - saved.time < 15 * 60 * 1000) return Promise.resolve(saved.value);

      var endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
      var params = new URLSearchParams({
        page: String(pageNumber),
        language: 'ru-RU',
        include_adult: 'false',
        sort_by: 'popularity.desc',
        with_origin_country: 'RU'
      });

      return request(endpoint + '?' + params.toString()).then(function (data) {
        var candidates = Array.isArray(data.results) ? data.results : [];
        return mapInBatches(candidates, 4, function (candidate) {
          return request('/' + mediaType + '/' + candidate.id + '?language=ru-RU').then(function (detail) {
            var companies = (detail.production_companies || []).filter(function (company) {
              return company.origin_country === 'RU';
            });
            if (!companies.length) return null;
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
        page += 1;
        more.remove();
        load(false);
      });
      list.append(more);
    }

    function renderItem(item) {
      var title = item.title || item.name || item.original_title || item.original_name || 'Без названия';
      var year = (item.release_date || item.first_air_date || '').slice(0, 4);
      var studios = item.production_companies.map(function (company) { return company.name; }).filter(Boolean).join(', ');
      var row = $('<div class="russian-cinema-item selector"><div class="russian-cinema-poster"></div><div class="russian-cinema-copy"><div class="russian-cinema-title"></div><div class="russian-cinema-meta"></div><div class="russian-cinema-overview"></div><div class="russian-cinema-studios"></div></div><div class="russian-cinema-open">Открыть</div></div>');
      if (item.poster_path) row.find('.russian-cinema-poster').css('background-image', 'url(https://image.tmdb.org/t/p/w342' + item.poster_path + ')');
      row.find('.russian-cinema-title').text(title);
      row.find('.russian-cinema-meta').text((type === 'tv' ? 'Сериал' : 'Фильм') + (year ? ' · ' + year : ''));
      row.find('.russian-cinema-overview').text(item.overview || '');
      row.find('.russian-cinema-studios').text('Студия: ' + studios);
      row.on('hover:enter', function () {
        Lampa.Activity.push({ url: '', title: title, component: 'full', id: item.id, source: 'tmdb', movie: item });
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
      title: item.title || item.name || item.original_title || item.original_name || '',
      original_title: item.original_title || item.original_name || item.title || item.name || '',
      name: item.name || item.title || '',
      original_name: item.original_name || item.original_title || '',
      overview: item.overview || '',
      poster_path: item.poster_path || null,
      backdrop_path: item.backdrop_path || null,
      release_date: item.release_date || '',
      first_air_date: item.first_air_date || '',
      vote_average: Number(item.vote_average) || 0,
      vote_count: Number(item.vote_count) || 0,
      genre_ids: Array.isArray(item.genres) ? item.genres.map(function (genre) { return genre.id; }) : [],
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
    style.textContent = '.russian-cinema-page{padding:1.5em 3em 3em}.russian-cinema-status{font-size:1.05em;opacity:.75;margin:0 0 1.2em}.russian-cinema-controls{display:flex;align-items:center;gap:.6em;margin:0 0 1.2em}.russian-cinema-tab,.russian-cinema-refresh,.russian-cinema-action{padding:.85em 1.2em;background:rgba(255,255,255,.08);border-radius:.25em}.russian-cinema-tab.focus,.russian-cinema-refresh.focus,.russian-cinema-action.focus{background:rgba(255,255,255,.2)}.russian-cinema-tab--active{box-shadow:inset 0 -2px currentColor}.russian-cinema-item{display:flex;align-items:center;gap:1.25em;padding:1em 1.2em;margin:0 0 .7em;background:rgba(255,255,255,.07);border-radius:.3em;min-height:8em}.russian-cinema-item.focus{background:rgba(255,255,255,.18)}.russian-cinema-poster{width:5em;height:7.5em;flex:none;border-radius:.2em;background:#292929 center/cover no-repeat}.russian-cinema-copy{flex:1;min-width:0}.russian-cinema-title{font-size:1.2em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.russian-cinema-meta,.russian-cinema-studios{font-size:.88em;opacity:.68;margin-top:.35em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.russian-cinema-overview{font-size:.86em;opacity:.72;margin-top:.45em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.russian-cinema-open{flex:none;opacity:.7}@media(max-width:700px){.russian-cinema-page{padding:1em}.russian-cinema-item{gap:.8em;padding:.75em}.russian-cinema-poster{width:3.8em;height:5.7em}.russian-cinema-open{display:none}.russian-cinema-overview{max-width:55vw}}';
    document.head.appendChild(style);
  }

  addStyles();
  if (window.Lampa) start();
  else {
    var attempts = 0;
    var wait = setInterval(function () {
      attempts += 1;
      if (window.Lampa || attempts > 80) {
        clearInterval(wait);
        start();
      }
    }, 100);
  }
})();
