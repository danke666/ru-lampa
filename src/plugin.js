(function (window) {
  'use strict';

  var app = window.RussianCinemaPlugin = window.RussianCinemaPlugin || {};
  var READY = 'plugin_russian_cinema_ready';
  var ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 4v16M16 4v16M3 9h5m-5 6h5m8-6h5m-5 6h5" stroke="currentColor" stroke-width="1.5"/></svg>';

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

    Lampa.Component.add('russian_cinema_view', app.RussianCinemaView);
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

  app.addStyles();
  bootstrap();
})(window);
