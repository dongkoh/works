import './style.css';

const SHEET_ID = '1GeT9KtSixzkHwffSeddezPUxwiarclgNzccPctFhhcg';
const gviz = sheet => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

const WRITING_PLACEHOLDER = 'working on it... writing in progress... bit by bit... sry...';

const ww = { data: [], years: [], cats: [], activeYears: new Set(), activeCats: new Set() };
const pw = { data: [], years: [], cats: [], activeYears: new Set(), activeCats: new Set() };
let cvUrl = null;
let aboutContent = [];
const _hideTimers = {};

// ── Utilities ──────────────────────────────────────────────
function isReal(v) {
  return v && v.trim() !== '' && v.trim().toLowerCase() !== 'placeholder';
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))].sort();
}

function driveImg(url, size = 'w400') {
  if (!isReal(url)) return null;
  const m = url.match(/\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=${size}`;
  return url;
}

// ── Data ───────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQuote = false;
  const str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === '"' && str[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if      (ch === '"')  inQuote = true;
      else if (ch === ',')  { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
  }
  row.push(cur);
  if (row.some(c => c !== '')) rows.push(row);

  return rows;
}

async function fetchSheetRows(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const rows = parseCSV(await res.text());
    if (rows.length < 2) return [];
    const cols = rows[0];
    return rows.slice(1)
      .map(row => { const obj = {}; cols.forEach((col, i) => { obj[col] = row[i] ?? ''; }); return obj; })
      .filter(row => isReal(row.Title));
  } catch (e) { console.error('[fetch]', e); return []; }
}

async function fetchAboutContent() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent('About')}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const json = JSON.parse(text.replace(/^[^{]*/, '').replace(/\);?\s*$/, ''));
    const table = json.table;
    if (!table?.rows) return [];
    const cols = (table.cols || []).map(c => (c.label || '').trim().toLowerCase().replace(/\s/g, ''));
    const colIdx = ['text', 'content', 'body', 'about'].reduce(
      (found, key) => found !== -1 ? found : cols.indexOf(key), -1
    );
    const idx = colIdx !== -1 ? colIdx : 0;
    return table.rows
      .map(row => row.c?.[idx]?.v)
      .filter(v => v != null)
      .map(v => String(v));
  } catch (e) { console.error('[About fetch]', e); return []; }
}

async function fetchCvUrl() {
  try {
    const res = await fetch(gviz('CV'));
    if (!res.ok) return null;
    const rows = parseCSV(await res.text());
    const colIdx = rows[0].map(h => h.trim().toLowerCase().replace(/\s/g, '')).indexOf('linkurl');
    if (colIdx !== -1 && rows[1]) return rows[1][colIdx]?.trim() || null;
  } catch (e) { console.error('[CV fetch]', e); }
  return null;
}

// ── Filters ────────────────────────────────────────────────
function buildFilterState(state, yearId, catId, onChange) {
  state.years = unique(state.data.map(p => String(p.Year)));
  state.cats  = unique(state.data.map(p => p.Category));
  state.activeYears = new Set(state.years);
  state.activeCats  = new Set(state.cats);
  state._yearId = yearId;
  state._catId  = catId;
  state._onChange = onChange;
  renderYearFilter(state);
  renderCatFilter(state);
}

function renderYearFilter(state) {
  renderPills(state._yearId, state.years, state.activeYears, v => {
    state.activeYears.has(v) ? state.activeYears.delete(v) : state.activeYears.add(v);
    renderYearFilter(state);
    renderCatFilter(state);
    state._onChange();
  });
}

function renderCatFilter(state) {
  const counts = new Map(state.cats.map(cat => [cat,
    state.data.filter(p => state.activeYears.has(String(p.Year)) && p.Category === cat).length
  ]));
  renderPills(state._catId, state.cats, state.activeCats, v => {
    state.activeCats.has(v) ? state.activeCats.delete(v) : state.activeCats.add(v);
    renderCatFilter(state);
    state._onChange();
  }, counts);
}

function renderPills(containerId, values, activeSet, onToggle, counts) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  values.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (activeSet.has(v) ? ' active' : '');
    if (counts != null) {
      const nameSpan = document.createElement('span');
      nameSpan.textContent = v;
      const countSpan = document.createElement('span');
      countSpan.textContent = counts.get(v);
      countSpan.style.opacity = '0.5';
      btn.appendChild(nameSpan);
      btn.appendChild(countSpan);
    } else {
      btn.textContent = v;
    }
    btn.addEventListener('click', () => onToggle(v));
    container.appendChild(btn);
  });
}

function getFiltered(state) {
  return state.data.filter(p =>
    state.activeYears.has(String(p.Year)) && state.activeCats.has(p.Category)
  );
}

// ── Personal Works grid ────────────────────────────────────
function renderPersonalGrid() {
  const grid = document.getElementById('personal-grid');
  grid.innerHTML = '';
  const projects = getFiltered(pw);
  if (!projects.length) {
    grid.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:14px;">pls clik sth</div>';
    return;
  }
  projects.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'pw-card';
    card.style.animationDelay = `${i * 0.04}s`;
    card.addEventListener('click', () => showProject(p));

    const wrap = document.createElement('div');
    wrap.className = 'pw-thumb-wrap';
    const imgUrl = driveImg(p['Img URL 1']) || driveImg(p['Img URL 2']);
    const img = document.createElement('img');
    img.className = 'pw-thumb';
    img.src = imgUrl || PLACEHOLDER_IMGS[Math.floor(Math.random() * PLACEHOLDER_IMGS.length)];
    img.alt = p.Title || '';
    if (imgUrl) img.onerror = () => { img.src = PLACEHOLDER_IMGS[Math.floor(Math.random() * PLACEHOLDER_IMGS.length)]; };
    wrap.appendChild(img);
    card.appendChild(wrap);

    const info = document.createElement('div');
    info.className = 'pw-card-info';
    const title = document.createElement('div');
    title.className = 'pw-card-title';
    title.textContent = p.Title || 'Untitled';
    const meta = document.createElement('div');
    meta.className = 'pw-card-year';
    meta.textContent = p.Year || '';
    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(info);

    grid.appendChild(card);
  });
}

// ── Carousel ───────────────────────────────────────────────
const ROW_CONFIG = [
  { speed: 65, offset: 0.00, dir:  1 },
  { speed: 75, offset: 0.35, dir: -1 },
  { speed: 70, offset: 0.60, dir:  1 },
  { speed: 60, offset: 0.15, dir: -1 },
];

let _drag = null;
let _dragged = false;

function snapX(x, halfW) {
  let n = x % -halfW;
  if (n > 0) n -= halfW;
  return n;
}

function pauseInner(inner) {
  const x = new DOMMatrix(getComputedStyle(inner).transform).m41;
  inner.style.animation = 'none';
  inner.style.transform = `translateX(${x}px)`;
  return x;
}

function resumeInner(inner, x, speed, dir) {
  const halfW = inner.scrollWidth / 2;
  if (!halfW) return;
  const nx = snapX(x, halfW);
  const progress = dir === 1 ? (-nx / halfW) : (1 - (-nx / halfW));
  const delay = -(Math.max(0, Math.min(1, progress)) * speed);
  inner.style.transform = `translateX(${nx}px)`;
  inner.offsetWidth;
  inner.style.transform = '';
  inner.style.animation = `scroll-left ${speed}s ${delay}s linear infinite`;
  if (dir === -1) inner.style.animationDirection = 'reverse';
}

window.addEventListener('mousemove', e => {
  if (!_drag) return;
  if (Math.abs(e.clientX - _drag.startX) > 5) _dragged = true;
  _drag.inner.style.transform = `translateX(${_drag.originX + e.clientX - _drag.startX}px)`;
});
window.addEventListener('mouseup', () => {
  if (!_drag) return;
  const { inner, speed, dir, row } = _drag;
  const x = new DOMMatrix(getComputedStyle(inner).transform).m41;
  _drag = null;
  row.classList.remove('dragging');
  resumeInner(inner, x, speed, dir);
});
window.addEventListener('touchmove', e => {
  if (!_drag || !e.touches.length) return;
  if (Math.abs(e.touches[0].clientX - _drag.startX) > 5) _dragged = true;
  _drag.inner.style.transform = `translateX(${_drag.originX + e.touches[0].clientX - _drag.startX}px)`;
}, { passive: true });
window.addEventListener('touchend', () => {
  if (!_drag) return;
  const { inner, speed, dir } = _drag;
  const x = new DOMMatrix(getComputedStyle(inner).transform).m41;
  _drag = null;
  resumeInner(inner, x, speed, dir);
});

function fadeAndRebuild() {
  const carousel = document.getElementById('carousel');
  carousel.style.opacity = '0';
  function onFadeOut(e) {
    if (e.propertyName !== 'opacity') return;
    carousel.removeEventListener('transitionend', onFadeOut);
    buildCarousel();
    carousel.style.transition = 'none';
    carousel.style.transform = 'translateY(calc(-45% + 8px))';
    carousel.offsetWidth;
    carousel.style.transition = '';
    carousel.style.transform = 'translateY(-45%)';
    carousel.style.opacity = '1';
  }
  carousel.addEventListener('transitionend', onFadeOut);
}

function buildCarousel() {
  _drag = null;
  const carousel = document.getElementById('carousel');
  carousel.innerHTML = '';
  const projects = getFiltered(ww);
  if (!projects.length) {
    carousel.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:14px;">pls clik sth</div>';
    return;
  }

  const rowCount = projects.length <= 5 ? 1 : projects.length <= 8 ? 2 : projects.length <= 11 ? 3 : 4;
  const activeRows = ROW_CONFIG.slice(0, rowCount);
  const base  = Math.floor(projects.length / rowCount);
  const extra = projects.length % rowCount;
  const rowSlices = activeRows.map((_, i) => {
    const size  = base + (i < extra ? 1 : 0);
    const start = i * base + Math.min(i, extra);
    return projects.slice(start, start + size);
  });

  activeRows.forEach(({ speed, offset, dir }, rowIndex) => {
    const row   = document.createElement('div');
    row.className = 'marquee-row';
    const inner = document.createElement('div');
    inner.className = 'marquee-inner';

    const rowProjects = rowSlices[rowIndex].length ? rowSlices[rowIndex] : projects;
    let pool = [];
    while (pool.length < 16) pool = pool.concat(rowProjects);
    const items = [...pool, ...pool];

    items.forEach(p => {
      const item = document.createElement('div');
      item.className = 'marquee-item';
      const imgUrl = driveImg(p['Img URL 1']) || driveImg(p['Img URL 2']);
      if (imgUrl) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.src = imgUrl;
        img.alt = p.Brand || '';
        img.onerror = () => img.replaceWith(makePlaceholder());
        item.appendChild(img);
      } else {
        item.appendChild(makePlaceholder());
      }
      const title = document.createElement('span');
      title.className = 'project-title';
      title.appendChild(document.createTextNode(p.Brand || 'Untitled'));
      if (isReal(p.Index)) {
        const idx = document.createElement('span');
        idx.className = 'project-index';
        idx.textContent = p.Index;
        title.appendChild(idx);
      }
      item.appendChild(title);
      item.addEventListener('click', () => { if (_dragged) { _dragged = false; return; } showProject(p); });
      inner.appendChild(item);
    });

    inner.style.animation = `scroll-left ${speed}s ${-(offset * speed)}s linear infinite`;
    if (dir === -1) inner.style.animationDirection = 'reverse';
    row.appendChild(inner);
    carousel.appendChild(row);

    row.addEventListener('mouseenter', () => { if (!_drag) pauseInner(inner); });
    row.addEventListener('mouseleave', () => {
      if (!_drag && inner.style.transform !== '') {
        const x = new DOMMatrix(getComputedStyle(inner).transform).m41;
        resumeInner(inner, x, speed, dir);
      }
    });
    row.addEventListener('mousedown', e => {
      e.preventDefault();
      _drag = { inner, speed, dir, row, startX: e.clientX, originX: pauseInner(inner) };
      row.classList.add('dragging');
    });
    row.addEventListener('touchstart', e => {
      if (!e.touches.length) return;
      _drag = { inner, speed, dir, row, startX: e.touches[0].clientX, originX: pauseInner(inner) };
    }, { passive: true });
  });
}

const PLACEHOLDER_IMGS = [
  'https://www.the-tls.com/wp-content/uploads/2019/11/e24ea47a-1ab1-11e7-a725-c619aa6571c2.jpeg',
  'https://i.pinimg.com/236x/2f/5e/7d/2f5e7d445b97cf8da9a7310b9b6c5c88.jpg',
  'https://ih1.redbubble.net/image.5884462479.0801/pp,504x498-pad,600x600,f8f8f8.jpg',
  'https://live.staticflickr.com/2772/4447887891_6b959df6cb_b.jpg',
];

function makePlaceholder() {
  const img = document.createElement('img');
  img.className = 'thumb placeholder';
  img.src = PLACEHOLDER_IMGS[Math.floor(Math.random() * PLACEHOLDER_IMGS.length)];
  img.onerror = () => { img.removeAttribute('src'); };
  return img;
}

// ── Pages ──────────────────────────────────────────────────
function showPage(id) {
  if (_hideTimers[id]) { clearTimeout(_hideTimers[id]); delete _hideTimers[id]; }
  const page = document.getElementById(id);
  page.style.display = 'flex';
  page.style.pointerEvents = '';
  requestAnimationFrame(() => { page.classList.add('visible'); updateCursorState(); });
}

function hidePage(id) {
  const page = document.getElementById(id);
  if (!page.classList.contains('visible')) return;
  page.classList.remove('visible');
  // Drop hit-testing immediately so the cursor reacts to what's underneath right away.
  page.style.pointerEvents = 'none';
  updateCursorState();
  _hideTimers[id] = setTimeout(() => {
    page.style.display = 'none';
    delete _hideTimers[id];
  }, 250);
}

function showProject(p) {
  const textEl = document.getElementById('project-body-text');
  textEl.innerHTML = '';
  const kor = p['Context(KOR)'];
  const eng = p['Context(ENG)'];
  if (!isReal(kor) && !isReal(eng)) {
    const el = document.createElement('p');
    el.textContent = WRITING_PLACEHOLDER;
    el.style.opacity = '0.35';
    textEl.appendChild(el);
  } else {
    const row = document.createElement('div');
    row.className = 'context-row';
    [[kor, 'kor'], [eng, 'eng']].forEach(([txt, lang]) => {
      const col = document.createElement('div');
      col.className = `context-col ${lang}`;
      col.textContent = isReal(txt) ? txt : '';
      row.appendChild(col);
    });
    textEl.appendChild(row);
  }

  const imgsEl = document.getElementById('project-images');
  imgsEl.innerHTML = '';
  const validUrls = ['Img URL 1', 'Img URL 2', 'Img URL 3', 'Img URL 4']
    .map(k => driveImg(p[k], 'w1200')).filter(Boolean);
  validUrls.forEach((url, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'p-img-wrap';
    wrap.style.animationDelay = `${i * 0.07}s`;
    const img = document.createElement('img');
    img.src = url;
    img.alt = p.Title || '';
    wrap.appendChild(img);
    imgsEl.appendChild(wrap);
  });

  const metaEl = document.getElementById('project-meta');
  metaEl.innerHTML = '';
  const titleLine = document.createElement('div');
  titleLine.className = 'p-title-line';
  titleLine.textContent = [p.Title, p.Year].filter(isReal).join(', ');
  metaEl.appendChild(titleLine);
  if (isReal(p.Brand)) {
    const el = document.createElement('div');
    el.className = 'p-brand-line';
    el.textContent = p.Brand;
    metaEl.appendChild(el);
  }
  if (isReal(p['Link URL'])) {
    const el = document.createElement('a');
    el.className = 'p-link-line';
    el.href = p['Link URL'];
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.textContent = p['Link URL'];
    el.addEventListener('click', e => e.stopPropagation());
    metaEl.appendChild(el);
  }

  document.getElementById('project-scroll').scrollTop = 0;
  showPage('project-page');
}

function showAbout() {
  const textEl = document.getElementById('about-text');
  textEl.innerHTML = '';
  aboutContent.forEach(txt => {
    const el = document.createElement('p');
    if (txt.trim()) {
      el.textContent = txt;
    } else {
      el.style.height = '0.8em';
    }
    textEl.appendChild(el);
  });
  document.getElementById('about-scroll').scrollTop = 0;
  showPage('about-page');
}

function triggerFilterEnter(el) {
  el.style.animation = 'none';
  el.offsetWidth;
  el.style.animation = 'filter-enter 0.5s ease forwards';
}

function showPersonalWorks() {
  renderPersonalGrid();
  document.getElementById('personal-scroll').scrollTop = 0;
  showPage('personal-page');
  requestAnimationFrame(() => triggerFilterEnter(document.getElementById('personal-filters')));
}

document.getElementById('project-page').addEventListener('click', () => hidePage('project-page'));

// ── Custom cursor (single rotating arrow, blended against background) ──
const cursorEl = document.getElementById('custom-cursor');
let lastX = 0, lastY = 0;
function updateCursorState() {
  const el = document.elementFromPoint(lastX, lastY);
  const overLink = el && el.closest && el.closest('a');
  const overProject = el && el.closest && el.closest('#project-page');
  cursorEl.classList.toggle('link', !!overLink);
  cursorEl.classList.toggle('project', !!overProject && !overLink);
}
document.addEventListener('pointermove', e => {
  lastX = e.clientX;
  lastY = e.clientY;
  cursorEl.style.display = 'block';
  cursorEl.style.left = `${e.clientX}px`;
  cursorEl.style.top = `${e.clientY}px`;
  updateCursorState();
});
document.addEventListener('pointerleave', () => { cursorEl.style.display = 'none'; });

// ── Bottom nav ─────────────────────────────────────────────
document.querySelectorAll('#menu .menu-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const s = btn.dataset.section;
    if (s === 'cv') { if (cvUrl) window.open(cvUrl, '_blank'); return; }
    if (btn.classList.contains('active')) return;
    hidePage('project-page');
    hidePage('about-page');
    hidePage('personal-page');
    if (s === 'work') triggerFilterEnter(document.getElementById('filters'));
    if (s === 'about') showAbout();
    if (s === 'personal') showPersonalWorks();
    document.querySelectorAll('#menu .menu-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Boot ───────────────────────────────────────────────────
function preloadImg(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = url;
  });
}

Promise.all([
  fetchSheetRows(gviz('Work Works')),
  fetchSheetRows(gviz('Personal Works')),
  fetchCvUrl(),
  fetchAboutContent(),
]).then(async ([wwData, pwData, fetchedCvUrl, fetchedAbout]) => {
  cvUrl = fetchedCvUrl;
  aboutContent = fetchedAbout;
  ww.data = wwData;
  pw.data = pwData;
  buildFilterState(ww, 'year-filters', 'cat-filters', () => fadeAndRebuild());
  buildFilterState(pw, 'personal-year-filters', 'personal-cat-filters', () => renderPersonalGrid());

  // Gate on the thumbnails actually shown first (Personal Works grid).
  const thumbUrls = [...new Set(
    pw.data.map(p => driveImg(p['Img URL 1']) || driveImg(p['Img URL 2'])).filter(Boolean)
  )];
  // Wait for every visible thumbnail to finish (preloadImg resolves on error too,
  // so broken images won't hang it). 20s safety cap for stalled network.
  await Promise.race([
    Promise.all(thumbUrls.map(preloadImg)),
    new Promise(resolve => setTimeout(resolve, 20000)),
  ]);

  document.getElementById('loading').style.display = 'none';
  buildCarousel();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.getElementById('carousel').style.opacity = '1';
    document.getElementById('filters').style.opacity = '1';
  }));
  showPersonalWorks();

  // Defer heavy full-res preloading so it doesn't compete with the visible grid.
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1500));
  idle(() => {
    const fullImgUrls = [...new Set(
      [...ww.data, ...pw.data].flatMap(p =>
        ['Img URL 1', 'Img URL 2', 'Img URL 3', 'Img URL 4'].map(k => driveImg(p[k], 'w1200')).filter(Boolean)
      )
    )];
    fullImgUrls.forEach(url => { const img = new Image(); img.src = url; });
  });
}).catch(err => {
  document.getElementById('loading').textContent = 'Failed to load data';
  console.error(err);
});
