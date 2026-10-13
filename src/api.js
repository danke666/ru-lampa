(function (window) {
  'use strict';

  var app = window.RussianCinemaPlugin = window.RussianCinemaPlugin || {};
  var pageCache = {};
  var genresByType = {};
  var genreRequests = {};

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

  function getPage(mediaType, pageNumber, filters, force) {
    return loadGenres(mediaType).then(function (genres) {
      var genreIds = genres.filter(function (item) {
        return filters.genreNames.indexOf(item.name) >= 0;
      }).map(function (item) { return String(item.id); });
      var cacheKey = [mediaType, pageNumber, filters.strictStudios, filters.genreNames.slice().sort().join(','), filters.year, filters.minRating, filters.sort].join(':');
      var saved = pageCache[cacheKey];
      if (!force && saved && Date.now() - saved.time < 15 * 60 * 1000) return saved.value;

      var endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
      var mediaSort = filters.sort === 'date.desc' ? (mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : filters.sort;
      var params = 'page=' + pageNumber + '&language=ru-RU&include_adult=false&sort_by=' + encodeURIComponent(mediaSort) + '&with_origin_country=RU';
      if (genreIds.length) params += '&with_genres=' + encodeURIComponent(genreIds.join(','));
      if (filters.year) params += (mediaType === 'tv' ? '&first_air_date_year=' : '&primary_release_year=') + encodeURIComponent(filters.year);
      if (filters.minRating) params += '&vote_average.gte=' + encodeURIComponent(filters.minRating);

      return request(endpoint + '?' + params).then(function (data) {
        var candidates = Array.isArray(data.results) ? data.results : [];
        return mapInBatches(candidates, 4, function (candidate) {
          return request('/' + mediaType + '/' + candidate.id + '?language=ru-RU&append_to_response=images&include_image_language=ru,en,null').then(function (detail) {
            var studios = (detail.production_companies || []).filter(function (company) {
              return company.origin_country === 'RU';
            });
            if (filters.strictStudios && !studios.length) return null;
            var companies = filters.strictStudios ? studios : (detail.production_companies || []);
            var posterPaths = posterPathsFor(detail, candidate);
            detail.poster_path = posterPaths.shift() || null;
            detail.backdrop_path = detail.backdrop_path || candidate.backdrop_path || null;
            var normalized = normalize(detail, mediaType, companies);
            normalized.poster_fallbacks = posterPaths;
            return normalized;
          }).catch(function () { return null; });
        }).then(function (items) {
          var value = {
            items: items.filter(Boolean),
            hasMore: pageNumber < Number(data.total_pages || 0)
          };
          pageCache[cacheKey] = { time: Date.now(), value: value };
          return value;
        });
      });
    });
  }

  function posterPathsFor(detail, candidate) {
    var posters = detail.images && detail.images.posters ? detail.images.posters.slice() : [];
    posters.sort(function (a, b) {
      function languageRank(image) {
        if (image.iso_639_1 === 'ru') return 0;
        if (image.iso_639_1 === 'en') return 1;
        if (!image.iso_639_1) return 2;
        return 3;
      }
      var languageDifference = languageRank(a) - languageRank(b);
      if (languageDifference) return languageDifference;
      var ratingDifference = Number(b.vote_average || 0) - Number(a.vote_average || 0);
      if (ratingDifference) return ratingDifference;
      return Number(b.vote_count || 0) - Number(a.vote_count || 0);
    });

    var paths = [];
    function add(path) {
      if (path && paths.indexOf(path) === -1) paths.push(path);
    }

    add(detail.poster_path);
    add(candidate.poster_path);
    posters.forEach(function (poster) { add(poster.file_path); });
    add(candidate.backdrop_path);
    add(detail.backdrop_path);
    return paths;
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

  app.api = {
    request: request,
    loadGenres: loadGenres,
    getGenres: function (mediaType) { return genresByType[mediaType] || []; },
    getPage: getPage
  };
})(window);
