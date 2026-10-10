/* The shell only handles the public app identity and deployment URL. Passwords and
   journal data stay in the Google Apps Script frame and never cross this boundary. */
(function () {
  'use strict';
  const identity = window.SirrIdentity;
  const $ = id => document.getElementById(id);
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } },
    remove(key) { try { localStorage.removeItem(key); return true; } catch (_) { return false; } }
  };
  const URL_KEY = 'sirr-shell-url-v1', BRAND_KEY = 'sirr-shell-branding-v1';
  let journalURL = identity.execURL(storage.get(URL_KEY));
  let brand = identity.branding(readJSON(storage.get(BRAND_KEY)));
  let draft = { ...brand }, frame = null, ready = false, timeout = null, prompt = null, toastTimer = null;
  let workerReady = null, saveRunning = false, loadRequest = 0, reconnectTimer = null;
  let shellSource = null, shellOrigin = null, shellControls = false, settingsFromJournal = false;
  function readJSON(value) { try { return JSON.parse(value); } catch (_) { return null; } }
  function svgURL(preset) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(identity.svg(preset)); }
  function tell(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
  }
  function paint() {
    document.title = brand.name;
    $('brand-name').textContent = brand.name;
    const icon = brand.icon192 || svgURL(brand.preset);
    $('brand-icon').src = icon; $('favicon').href = icon; $('touch-icon').href = icon;
    document.querySelector('meta[name="theme-color"]').content = identity.presets[brand.preset].color;
  }
  function action(label, handler, href) {
    const button = document.createElement(href ? 'a' : 'button'); button.textContent = label;
    if (href) { button.href = href; button.target = '_blank'; button.rel = 'noopener noreferrer'; }
    else { button.type = 'button'; button.addEventListener('click', handler); }
    return button;
  }
  function showJournal() {
    $('cover').hidden = true; document.body.classList.add('journal-visible');
    $('shell-settings-toggle').hidden = shellControls;
  }
  function cover(title, description, actions) {
    document.body.classList.remove('journal-visible'); $('shell-settings-toggle').hidden = true;
    $('cover-title').textContent = title; $('cover-text').textContent = description;
    $('cover-actions').replaceChildren(...(actions || [])); $('cover').hidden = false;
  }
  function setup() {
    cover('مذكرتك، أينما كنت', 'اربط رابط النشر، واختر الاسم والأيقونة، ثم ثبّت مذكرتك على شاشة هاتفك.', [action('إعداد المذكرة', showSettings)]);
  }
  function offline() {
    clearTimeout(timeout);
    if (frame && ready) { $('network-note').hidden = false; return; }
    cover('أنت غير متصل الآن', 'تحتاج المذكرات اتصالًا بالإنترنت لفتحها ومزامنتها. لا تحتفظ صفحة التثبيت بنسخة من المذكرات. ستُفتح المذكرة عند عودة الاتصال.', [action('إعادة المحاولة', loadJournal)]);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { if (journalURL && !ready) loadJournal(); }, 8000);
  }
  async function hasConnection() {
    if (navigator.onLine === false) return false;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('./connection.txt?check=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      return response.ok && response.headers.get('X-Sirr-Offline') !== '1';
    } catch (_) { return false; }
    finally { clearTimeout(timer); }
  }
  async function loadJournal() {
    const request = ++loadRequest;
    clearTimeout(reconnectTimer);
    clearTimeout(timeout); ready = false; shellSource = null; shellOrigin = null; shellControls = false;
    if (!journalURL) return setup();
    if (!await hasConnection()) { if (request === loadRequest) offline(); return; }
    if (request !== loadRequest) return;
    $('network-note').hidden = true;
    cover('جاري فتح المذكرة…', 'ستظهر شاشة كلمة المرور داخل التطبيق.', [action('فتح في المتصفح', null, journalURL)]);
    if (frame) frame.remove();
    frame = document.createElement('iframe'); frame.id = 'journal-frame'; frame.title = brand.name;
    frame.setAttribute('allow', 'clipboard-write; web-share'); frame.referrerPolicy = 'no-referrer';
    frame.src = journalURL + '?app=1'; $('stage').prepend(frame);
    timeout = setTimeout(() => {
      if (ready) return;
      if (navigator.onLine === false) return offline();
      cover('تعذّر التأكد من فتح المذكرة', 'تحقق من رابط النشر. للدخول دون بريد، يجب نشر Google Apps Script بخيار «أي شخص» وتفعيل الدخول بالرابط داخل المذكرة. يمكنك فتح الرابط في المتصفح للاطلاع على رسالة Google.', [
        action('إعادة المحاولة', loadJournal), action('فتح في المتصفح', null, journalURL),
        action('عرض الصفحة المحمّلة', showJournal)
      ]);
    }, 16000);
  }
  function belongsToFrame(source) {
    try {
      for (let i = 0; source && frame && i < 10; i++) {
        if (source === frame.contentWindow) return true;
        if (source === source.parent) return false;
        source = source.parent;
      }
    } catch (_) { return false; }
    return false;
  }
  function googleOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.protocol === 'https:' && !url.port && (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' || /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname));
    } catch (_) { return false; }
  }
  window.addEventListener('message', event => {
    if (!event.data || event.data.sirr !== 1 || !googleOrigin(event.origin) || !belongsToFrame(event.source)) return;
    if (event.data.type === 'ready') {
      ready = true; clearTimeout(timeout); showJournal();
      $('network-note').hidden = navigator.onLine !== false;
      if (event.data.shellControls === 1) {
        shellSource = event.source; shellOrigin = event.origin;
        shellSource.postMessage({ sirr: 1, type: 'shell-connected' }, shellOrigin);
      }
    } else if (event.source === shellSource && event.origin === shellOrigin) {
      if (event.data.type === 'shell-controls-ready') {
        shellControls = true;
        if (document.body.classList.contains('journal-visible')) $('shell-settings-toggle').hidden = true;
      } else if (event.data.type === 'open-shell-settings' && shellControls) {
        showSettings(true);
      }
    }
  });
  function selectPreset(preset) {
    draft = { name: draft.name, preset };
    $('custom-icon').value = '';
    for (const button of $('presets').children) button.setAttribute('aria-pressed', String(button.dataset.preset === preset));
  }
  function showSettings(fromJournal) {
    settingsFromJournal = fromJournal === true;
    draft = { ...brand }; $('app-name').value = brand.name; $('journal-url').value = journalURL;
    $('custom-icon').value = ''; $('settings-error').textContent = '';
    for (const button of $('presets').children) button.setAttribute('aria-pressed', String(!brand.custom && button.dataset.preset === brand.preset));
    if (!$('preferences').open) $('preferences').showModal();
  }
  for (const [key, value] of Object.entries(identity.presets)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'preset'; button.dataset.preset = key;
    button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img'); image.src = svgURL(key); image.alt = '';
    const label = document.createElement('span'); label.textContent = value.label;
    button.append(image, label); button.addEventListener('click', () => selectPreset(key)); $('presets').append(button);
  }
  function imageFromURL(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('تعذّر قراءة الصورة.')); image.src = url; }); }
  function iconData(image, size, custom) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = identity.presets[draft.preset].color; ctx.fillRect(0, 0, size, size);
    const area = custom ? size * .70 : size, ratio = Math.min(area / image.width, area / image.height);
    const width = image.width * ratio, height = image.height * ratio;
    ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  }
  async function buildIcons(current) {
    if (current.icon192 && current.icon512) return current;
    const image = await imageFromURL(svgURL(current.preset));
    return { ...current, icon192: iconData(image, 192, false), icon512: iconData(image, 512, false) };
  }
  $('custom-icon').addEventListener('change', async () => {
    const file = $('custom-icon').files[0]; if (!file) return;
    $('settings-error').textContent = ''; $('save-settings').disabled = true;
    let objectURL;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('اختر صورة PNG أو JPEG أو WebP لا تتجاوز 5 ميغابايت.');
      objectURL = URL.createObjectURL(file); const image = await imageFromURL(objectURL);
      if (image.width > 8192 || image.height > 8192) throw new Error('استخدم صورة بأبعاد لا تتجاوز 8192 بكسل.');
      draft.icon192 = iconData(image, 192, true); draft.icon512 = iconData(image, 512, true); draft.custom = true;
      for (const button of $('presets').children) button.setAttribute('aria-pressed', 'false');
      tell('تم اختيار الصورة. احفظ الإعدادات لتطبيقها.');
    } catch (error) { $('settings-error').textContent = error.message; $('custom-icon').value = ''; }
    finally { if (objectURL) URL.revokeObjectURL(objectURL); $('save-settings').disabled = false; }
  });
  async function initializeWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const registration = await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(() => resolve(null), 8000))]);
      if (!registration) return null;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => {
          const timer = setTimeout(done, 5000);
          function done() { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); }
          navigator.serviceWorker.addEventListener('controllerchange', done);
        });
      }
      return registration.active;
    } catch (_) { return null; }
  }
  async function persistManifest(value) {
    const worker = await workerReady;
    if (!worker) return false;
    const saved = await new Promise(resolve => {
      const channel = new MessageChannel(), timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 5000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data && event.data.ok === true); };
      worker.postMessage({ type: 'sirr-branding', branding: value }, [channel.port2]);
    });
    if (saved) {
      const old = $('manifest'), link = old.cloneNode(); link.href = './manifest.webmanifest?v=' + Date.now(); old.replaceWith(link);
    }
    return saved;
  }
  $('preferences-form').addEventListener('submit', async event => {
    event.preventDefault(); if (saveRunning) return;
    const url = identity.execURL($('journal-url').value);
    if (!url) { $('settings-error').textContent = 'أدخل رابط HTTPS صحيحًا من script.google.com ينتهي بـ /exec، دون معاملات إضافية.'; return; }
    const changedURL = url !== journalURL;
    if (changedURL && frame && !confirm('تغيير الرابط سيغلق المذكرة المفتوحة. احفظ تغييراتك فيها قبل المتابعة. هل تريد فتح المذكرة الأخرى؟')) return;
    saveRunning = true; $('save-settings').disabled = true; $('settings-error').textContent = '';
    try {
      draft.name = identity.name($('app-name').value); draft = await buildIcons(draft); brand = identity.branding(draft);
      journalURL = url; const stored = storage.set(URL_KEY, url) && storage.set(BRAND_KEY, JSON.stringify(brand));
      paint(); const manifestSaved = await persistManifest(brand);
      $('preferences').close();
      if (changedURL || !frame) loadJournal(); else frame.title = brand.name;
      tell(!stored ? 'التخزين المحلي غير متاح؛ قد تحتاج إعادة الربط عند فتح التطبيق.' : !manifestSaved ? 'حُفظت الإعدادات. تعذّر تحديث أيقونة التثبيت الآن؛ أعد فتح الصفحة عبر HTTPS قبل التثبيت.' : 'حُفظت الإعدادات. يمكنك تثبيت التطبيق بالاسم والأيقونة المختارين.');
    } catch (_) { $('settings-error').textContent = 'تعذّر حفظ الإعدادات. أعد المحاولة أو اختر أيقونة جاهزة.'; }
    finally { saveRunning = false; $('save-settings').disabled = false; }
  });
  $('forget').addEventListener('click', () => {
    if (!confirm('إزالة الربط ستغلق المذكرة المفتوحة. احفظ تغييراتك أولًا. لن تُحذف المذكرات من Google Drive. هل تريد المتابعة؟')) return;
    const removed = storage.remove(URL_KEY); journalURL = ''; ++loadRequest; clearTimeout(timeout); clearTimeout(reconnectTimer); if (frame) { frame.remove(); frame = null; }
    $('network-note').hidden = true;
    $('preferences').close(); setup(); if (!removed) tell('تعذّر حذف الرابط من تخزين المتصفح؛ امسح بيانات الموقع لإزالته نهائيًا.');
  });
  $('settings').addEventListener('click', showSettings);
  $('shell-settings-toggle').addEventListener('click', showSettings);
  $('close-settings').addEventListener('click', () => $('preferences').close());
  $('preferences').addEventListener('close', () => {
    if (!frame || !document.body.classList.contains('journal-visible')) return;
    if (settingsFromJournal || $('shell-settings-toggle').hidden) {
      frame.focus();
      if (shellControls && shellSource) shellSource.postMessage({ sirr: 1, type: 'shell-settings-closed' }, shellOrigin);
    } else $('shell-settings-toggle').focus();
  });
  function isInstalled() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; });
  async function installApp() {
    if (prompt) { const available = prompt; prompt = null; await available.prompt(); await available.userChoice; }
    else { $('install-text').textContent = isInstalled() ? 'التطبيق مفتوح بالفعل في وضع التطبيق المثبّت.' : 'في Chrome على أندرويد، افتح قائمة ⋮ واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». اختر الاسم والأيقونة من الإعدادات قبل التثبيت. على iPhone استخدم «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».'; $('install-help').showModal(); }
  }
  $('install').addEventListener('click', installApp);
  $('install-settings').addEventListener('click', installApp);
  window.addEventListener('appinstalled', () => { prompt = null; $('install').hidden = true; $('install-settings').hidden = true; tell('تم تثبيت المذكرة. افتحها من أيقونتها على الجهاز.'); });
  async function acceptIncoming(url, params) {
    const changedURL = url !== journalURL;
    journalURL = url; storage.set(URL_KEY, url);
    if (params.has('name') || params.has('icon')) {
      const preset = Object.hasOwn(identity.presets, params.get('icon')) ? params.get('icon') : brand.preset;
      draft = identity.branding({ name: params.get('name') || brand.name, preset });
      brand = await buildIcons(draft); storage.set(BRAND_KEY, JSON.stringify(brand)); paint(); await persistManifest(brand);
    }
    if (changedURL || !frame) loadJournal(); else frame.title = brand.name;
  }
  function incoming() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    const raw = params.get('url') || params.get('u'), url = identity.execURL(raw);
    if (raw && !url) { cover('رابط المذكرة غير صالح', 'استخدم رابط Google Apps Script الذي ينتهي بـ /exec، ثم أعد الربط من الإعدادات.', [action('إعدادات التطبيق', showSettings)]); return; }
    if (url && journalURL && url !== journalURL) {
      cover('ربط مذكرة أخرى؟', 'الرابط الوارد مختلف عن المذكرة المحفوظة. فتحه سيغلق المذكرة الحالية؛ احفظ تغييراتها أولًا. يمكنك إبقاء المذكرة الحالية للعودة إليها.', [action('استخدام الرابط الجديد', () => acceptIncoming(url, params).catch(() => tell('تعذّر تغيير الرابط. أعد المحاولة من الإعدادات.'))), action('إبقاء المذكرة الحالية', () => { if (frame && ready) showJournal(); else loadJournal(); })]);
    } else if (url) acceptIncoming(url, params).catch(() => { loadJournal(); tell('تعذّر تحديث مظهر التطبيق. يمكنك المحاولة من الإعدادات.'); });
    else loadJournal();
  }
  window.addEventListener('online', () => { $('network-note').hidden = true; if (journalURL && !ready) loadJournal(); });
  window.addEventListener('offline', () => { if (journalURL) offline(); });
  window.addEventListener('hashchange', incoming);
  paint(); $('install').hidden = $('install-settings').hidden = isInstalled(); workerReady = initializeWorker(); incoming();
})();
