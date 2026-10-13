(function (window) {
  'use strict';

  var app = window.RussianCinemaPlugin = window.RussianCinemaPlugin || {};

  app.addStyles = function () {
    if (document.getElementById('russian-cinema-styles')) return;
    var style = document.createElement('style');
    style.id = 'russian-cinema-styles';
    style.textContent = [
      '.russian-cinema-page{padding:1.4em 2.4em 3em}',
      '.russian-cinema-controls{display:flex;flex-wrap:wrap;align-items:center;gap:.45em;margin:0 0 1.25em}',
      '.russian-cinema-filter,.russian-cinema-refresh{padding:.65em .9em;background:rgba(255,255,255,.08);border-radius:.25em;white-space:nowrap}',
      '.russian-cinema-filter.focus,.russian-cinema-refresh.focus{background:rgba(255,255,255,.22);outline:3px solid #fff;outline-offset:2px;z-index:2}',
      '.russian-cinema-rail{margin:0 0 2.15em}',
      '.russian-cinema-rail-title{font-size:1.55em;line-height:1.2;font-weight:500;margin:0 0 .55em}',
      '.russian-cinema-rail-status{min-height:0;font-size:.82em;opacity:.65;margin:0 0 .35em}',
      '.russian-cinema-list{display:flex;flex-flow:row nowrap;align-items:flex-start;gap:1em;width:max-content;min-width:100%;padding:.25em .25em .75em;box-sizing:border-box}',
      '.russian-cinema-item{flex:0 0 14em;width:14em;box-sizing:border-box;padding:0;background:transparent}',
      '.russian-cinema-item.focus{outline:3px solid rgba(255,255,255,.9);outline-offset:3px;transform:scale(1.025);z-index:2}',
      '.russian-cinema-action{flex:0 0 14em;width:14em;box-sizing:border-box;padding:.65em .9em;background:rgba(255,255,255,.08);white-space:nowrap}',
      '.russian-cinema-action.focus{outline:3px solid #fff;outline-offset:2px}',
      '.russian-cinema-poster{position:relative;width:100%;height:0;padding-bottom:150%;border-radius:1em;background:#292929;overflow:hidden}',
      '.russian-cinema-poster-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
      '.russian-cinema-poster-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.45;font-size:.9em}',
      '.russian-cinema-rating{position:absolute;right:.45em;bottom:.45em;padding:.2em .55em;border-radius:1em;background:rgba(0,0,0,.82);font-size:1.1em;font-weight:600}',
      '.russian-cinema-title{margin:.55em 0 .15em;font-size:1.15em;line-height:1.22;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.44em}',
      '.russian-cinema-meta{margin:.15em 0 .25em;font-size:1em;line-height:1.25;opacity:.8;min-height:1.25em}',
      '@media(max-width:700px){.russian-cinema-page{padding:1em}.russian-cinema-list{gap:.7em}.russian-cinema-item,.russian-cinema-action{flex-basis:8.5em;width:8.5em}.russian-cinema-rail-title{font-size:1.25em}.russian-cinema-title{font-size:.95em}.russian-cinema-meta{font-size:.82em}}'
    ].join('');
    document.head.appendChild(style);
  };
})(window);
