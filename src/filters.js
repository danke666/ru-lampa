(function (window) {
  'use strict';

  var app = window.RussianCinemaPlugin = window.RussianCinemaPlugin || {};

  app.createFilters = function (api, keepInView, onChange) {
    var state = {
      genreNames: [],
      strictStudios: false,
      year: '',
      minRating: 0,
      sort: 'popularity.desc'
    };

    function createButton() {
      var count = state.genreNames.length + (state.year ? 1 : 0) + (state.minRating ? 1 : 0) +
        (state.sort !== 'popularity.desc' ? 1 : 0) + (state.strictStudios ? 1 : 0);
      var button = $('<div class="russian-cinema-filter selector"></div>')
        .text('Фильтры' + (count ? ' · ' + count : ''));
      button.on('hover:enter', open);
      return keepInView(button);
    }

    function open() {
      Promise.all([api.loadGenres('movie'), api.loadGenres('tv')]).then(function () {
        var options = [
          { title: 'Показать результаты', action: 'apply' },
          {
            title: 'Жанр',
            subtitle: state.genreNames.length ? state.genreNames.join(', ') : 'Любой',
            key: 'genres',
            items: buildGenreOptions()
          },
          {
            title: 'Год выпуска',
            subtitle: state.year || 'Любой',
            key: 'year',
            items: buildSingleOptions([{ title: 'Любой год', value: '' }].concat(yearOptions()), state.year)
          },
          {
            title: 'Рейтинг',
            subtitle: state.minRating ? 'От ' + state.minRating.toFixed(1) : 'Любой',
            key: 'rating',
            items: buildSingleOptions([
              { title: 'Любой рейтинг', value: 0 },
              { title: 'От 5.0', value: 5 },
              { title: 'От 6.0', value: 6 },
              { title: 'От 7.0', value: 7 },
              { title: 'От 8.0', value: 8 }
            ], state.minRating)
          },
          {
            title: 'Сортировка',
            subtitle: sortLabel(state.sort),
            key: 'sort',
            items: buildSingleOptions([
              { title: 'По популярности', value: 'popularity.desc' },
              { title: 'По рейтингу', value: 'vote_average.desc' },
              { title: 'Сначала новые', value: 'date.desc' }
            ], state.sort)
          },
          {
            title: 'Производство',
            subtitle: state.strictStudios ? 'Российские студии' : 'Страна: Россия',
            key: 'production',
            items: buildSingleOptions([
              { title: 'Страна производства: Россия', value: false },
              { title: 'Российские студии', value: true }
            ], state.strictStudios)
          },
          { title: 'Сбросить фильтры', action: 'reset' }
        ];

        Lampa.Select.show({
          title: Lampa.Lang && Lampa.Lang.translate ? Lampa.Lang.translate('title_filter') : 'Фильтр',
          items: options,
          onBack: function () {
            onChange();
            Lampa.Controller.toggle('content');
          },
          onSelect: function (item) {
            if (item.action === 'apply') {
              Lampa.Controller.toggle('content');
              onChange('apply');
            } else if (item.action === 'reset') {
              reset();
              onChange('reset');
              open();
            } else {
              showSubmenu(item);
            }
          }
        });
      });
    }

    function showSubmenu(menu) {
      var options = menu.items;
      var multi = menu.key === 'genres';
      Lampa.Select.show({
        title: menu.title,
        items: options,
        onBack: function () {
          onChange();
          open();
        },
        onCheck: function () {
          state.genreNames = options.filter(function (item) { return item.checked; }).map(function (item) { return item.value; });
        },
        onSelect: function (item) {
          if (multi) return;
          if (menu.key === 'year') state.year = item.value;
          if (menu.key === 'rating') state.minRating = item.value;
          if (menu.key === 'sort') state.sort = item.value;
          if (menu.key === 'production') state.strictStudios = item.value;
          onChange();
          open();
        }
      });
    }

    function reset() {
      state.genreNames = [];
      state.year = '';
      state.minRating = 0;
      state.sort = 'popularity.desc';
      state.strictStudios = false;
    }

    function buildGenreOptions() {
      var genres = [];
      var names = {};
      ['movie', 'tv'].forEach(function (mediaType) {
        api.getGenres(mediaType).forEach(function (item) {
          if (!names[item.name]) {
            names[item.name] = true;
            genres.push({ title: item.name, value: item.name, checkbox: true, checked: state.genreNames.indexOf(item.name) >= 0 });
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

    return {
      state: state,
      createButton: createButton,
      open: open
    };
  };
})(window);
