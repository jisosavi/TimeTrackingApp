const i18n = (() => {
  const LANGS = ['en', 'fi', 'sv', 'et', 'uk', 'xh'];
  let strings = {};
  let lang = 'en';

  async function load(newLang) {
    if (!LANGS.includes(newLang)) newLang = 'en';
    try {
      const res = await fetch('/locales/' + newLang + '.json');
      if (!res.ok) throw new Error('fetch failed');
      strings = await res.json();
      lang = newLang;
    } catch {
      if (newLang !== 'en') {
        await load('en');
        return;
      }
    }
    document.documentElement.lang = newLang;
    applyToDOM();
  }

  function t(key, vars) {
    let s = Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replaceAll('{' + k + '}', String(vars[k]));
      }
    }
    return s;
  }

  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      el.value = t(el.dataset.i18nValue);
    });
  }

  function getLang() { return lang; }

  function buildLangSelect(currentLang, targetType, targetId) {
    const names = { en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa' };
    const opts = LANGS.map(l =>
      `<option value="${l}"${l === currentLang ? ' selected' : ''}>${names[l]}</option>`
    ).join('');
    return `<select data-lang-target="${targetType}" data-lang-target-id="${targetId || ''}"
      style="height:1.75rem;border-radius:6px;border:1px solid #C4CFD4;font-family:inherit;font-size:0.8rem;padding:0 0.5rem;background:#fff;cursor:pointer;">${opts}</select>`;
  }

  return { load, t, applyToDOM, getLang, buildLangSelect, LANGS };
})();

async function initPageLang(slug) {
  const storageKey = 'company_lang_' + (slug || '_');
  const cached = localStorage.getItem(storageKey) || 'en';
  await i18n.load(cached);
  if (slug) {
    fetch('/api/company_lang.php?slug=' + encodeURIComponent(slug))
      .then(r => r.json())
      .then(d => {
        const serverLang = d.ui_language || 'en';
        localStorage.setItem(storageKey, serverLang);
        if (serverLang !== i18n.getLang()) i18n.load(serverLang);
      })
      .catch(() => {});
  }
}

async function switchUserLang(lang, targetType, targetId) {
  try {
    const res = await fetch('/api/update_language.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, target_type: targetType, target_id: targetId }),
    });
    const result = await res.json();
    if (!result.success) return false;
    const slug = window.location.pathname.split('/').filter(Boolean)[0] || '_';
    localStorage.setItem('company_lang_' + slug, lang);
    await i18n.load(lang);
    return true;
  } catch { return false; }
}
