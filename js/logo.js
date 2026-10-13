/*
 * Logo da Marcenaria Dier: um "D" com os anéis de crescimento da madeira.
 * Usado no topo do site, no PDF e nos ícones do app (icons/).
 */
(function (global) {
  'use strict';

  const COLORS = { wood: '#7b4a26', cream: '#f4e7d4' };

  function svg(opts) {
    const o = Object.assign({ rounded: true }, opts);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
      + `<rect width="64" height="64" rx="${o.rounded ? 14 : 0}" fill="${COLORS.wood}"/>`
      + `<g fill="none" stroke="${COLORS.cream}" stroke-linecap="round" stroke-linejoin="round">`
      + `<path d="M16 14h15a18 18 0 0 1 0 36H16z" stroke-width="5"/>`
      + `<path d="M23 22h8a10 10 0 0 1 0 20h-8" stroke-width="2.6" opacity=".8"/>`
      + `<path d="M23 29h8a3 3 0 0 1 0 6h-8" stroke-width="2.4" opacity=".6"/>`
      + `</g></svg>`;
  }

  // Logo como PNG (data URL), para o PDF.
  let png = null;
  function pngDataUrl(size = 256) {
    if (png) return png;
    png = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img, 0, 0, size, size);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg());
    });
    return png;
  }

  global.Logo = { COLORS, svg, pngDataUrl };
})(window);
