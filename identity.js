(function (root) {
  'use strict';
  const presets = {
    book: { label: 'دفتر', color: '#155e63', path: '<path d="M29 28h18c5 0 9 3 9 8v38c-2-4-5-6-10-6H29zm54 0H65c-5 0-9 3-9 8v38c2-4 5-6 10-6h17z" fill="none" stroke="#fff8e9" stroke-width="5" stroke-linejoin="round"/>' },
    leaf: { label: 'ورقة', color: '#436752', path: '<path d="M82 28c-39-3-61 18-45 44 25 16 47-6 45-44Z" fill="#edf4de"/><path d="m31 81 38-38" stroke="#436752" stroke-width="5" stroke-linecap="round"/>' },
    moon: { label: 'قمر', color: '#4b4777', path: '<path d="M68 27a29 29 0 1 0 19 40A29 29 0 0 1 68 27Z" fill="#f5e9c6"/><path d="m81 28 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#f5e9c6"/>' },
    pen: { label: 'قلم', color: '#916020', path: '<path d="m34 65 34-34 13 13-34 34-18 5z" fill="#fff4d5"/><path d="m62 37 13 13M34 65l13 13" stroke="#916020" stroke-width="4"/>' }
  };
  function execURL(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port || url.username || url.password || url.search || url.hash) return '';
      return /^\/(?:macros|a\/macros\/[a-zA-Z0-9.-]+)\/s\/[a-zA-Z0-9_-]{1,512}\/exec$/.test(url.pathname) ? url.href : '';
    } catch (_) { return ''; }
  }
  function name(value) { return Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 40).join('') || 'سِرّ — مذكرتي'; }
  function validPNG(value) { return typeof value === 'string' && value.length <= 900000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value); }
  function branding(value) {
    if (!value || typeof value !== 'object') return { name: name(''), preset: 'book' };
    const result = { name: name(value.name), preset: Object.hasOwn(presets, value.preset) ? value.preset : 'book', custom: value.custom === true };
    if (validPNG(value.icon192) && validPNG(value.icon512)) { result.icon192 = value.icon192; result.icon512 = value.icon512; }
    return result;
  }
  function svg(preset) {
    const item = presets[preset] || presets.book;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112"><rect width="112" height="112" fill="' + item.color + '"/>' + item.path + '</svg>';
  }
  const api = { presets, execURL, name, branding, svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SirrIdentity = api;
})(typeof self !== 'undefined' ? self : globalThis);
