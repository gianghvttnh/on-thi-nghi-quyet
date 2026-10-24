(function () {
  'use strict';

  // ---------- Dữ liệu ----------
  const BANKS = window.QUESTION_BANKS || [];
  const GROUPS = window.QUESTION_GROUPS || [{ name: 'Bộ đề', banks: BANKS.map(b => b.id) }];
  const QBY = {};
  const BANK_NAME = {};
  const GROUP_NAME = {};
  const SEARCH = {};
  const DUPKEY = {}; // câu giống hệt nhau ở các bộ khác nhau có cùng khoá
  const LETTERS = 'ABCDEFGH';
  BANKS.forEach(b => b.questions.forEach(q => {
    QBY[q.id] = q;
    BANK_NAME[q.id] = b.name;
    GROUP_NAME[q.id] = b.group || '';
    SEARCH[q.id] = norm(q.text + ' ' + q.options.join(' '));
    DUPKEY[q.id] = JSON.stringify([q.text, q.options.slice().sort(), q.options[q.answer]]);
  }));

  // ---------- Lưu trữ trên máy ----------
  const KEY = 'ontnq.v1';
  const defaults = () => ({
    tab: 'study', banks: null, openGroups: {}, stars: {}, wrong: {}, history: [],
    cfg: {
      practice: { count: 20, random: true, shuffle: true, source: 'all' },
      exam: { count: 30, random: true, shuffle: true, source: 'all', minutes: 0, pass: 80 }
    }
  });
  const store = load();
  function load() {
    const d = defaults();
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) {
        Object.assign(d, s);
        d.cfg = {
          practice: Object.assign(defaults().cfg.practice, s.cfg && s.cfg.practice),
          exam: Object.assign(defaults().cfg.exam, s.cfg && s.cfg.exam)
        };
      }
    } catch (e) { /* bỏ qua */ }
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* bỏ qua */ } }

  // ---------- Tiện ích ----------
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const range = n => Array.from({ length: n }, (_, i) => i);
  const $ = (sel, root) => (root || document).querySelector(sel);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  function fmtDate(t) {
    const d = new Date(t);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ---------- Bộ đề ----------
  function selectedBanks() {
    if (!store.banks) return BANKS.map(b => b.id);
    return store.banks.filter(id => BANKS.some(b => b.id === id));
  }
  // Câu của các bộ được chọn; câu giống hệt ở nhiều bộ chỉ lấy 1 lần.
  function uniqueIds(bankIds) {
    const want = new Set(bankIds), seen = new Set(), ids = [];
    BANKS.forEach(b => {
      if (!want.has(b.id)) return;
      b.questions.forEach(q => {
        if (seen.has(DUPKEY[q.id])) return;
        seen.add(DUPKEY[q.id]);
        ids.push(q.id);
      });
    });
    return ids;
  }
  function pool(source) {
    let ids = uniqueIds(selectedBanks());
    if (source === 'star') ids = ids.filter(isStarred);
    if (source === 'wrong') ids = ids.filter(isWrong);
    return ids;
  }
  const GROUP_COUNT = GROUPS.map(g => uniqueIds(g.banks).length);
  const bankById = id => BANKS.find(b => b.id === id);
  function renderBanks() {
    const sel = new Set(selectedBanks());
    $('#banks-list').innerHTML = GROUPS.map((g, gi) => {
      const on = g.banks.filter(id => sel.has(id)).length;
      const open = !!store.openGroups[g.name];
      return `<div class="group ${open ? 'open' : ''}">
        <div class="group-head">
          <label class="group-check">
            <input type="checkbox" data-group="${gi}" ${on === g.banks.length ? 'checked' : ''} data-partial="${on > 0 && on < g.banks.length ? 1 : 0}">
            <span class="gname">${esc(g.name)}</span><span class="n">${GROUP_COUNT[gi]} câu</span>
          </label>
          <button class="toggle" data-toggle="${gi}" aria-expanded="${open}">${on}/${g.banks.length} bộ <span class="caret">▾</span></button>
        </div>
        <div class="group-body">${g.banks.map(id => {
          const b = bankById(id);
          return `<label class="chip ${sel.has(id) ? 'on' : ''}">
            <input type="checkbox" data-bank="${esc(id)}" ${sel.has(id) ? 'checked' : ''}>
            <span>${esc(b.name)}</span><span class="n">${b.questions.length} câu</span>
          </label>`;
        }).join('')}</div>
      </div>`;
    }).join('') || '<span class="muted">Chưa có bộ đề nào.</span>';
    document.querySelectorAll('[data-partial="1"]').forEach(cb => { cb.indeterminate = true; });
    const total = pool('all').length;
    const raw = BANKS.filter(b => sel.has(b.id)).reduce((a, b) => a + b.questions.length, 0);
    $('#banks-summary').innerHTML = sel.size
      ? `Đã chọn ${sel.size}/${BANKS.length} bộ · ${total} câu${raw > total ? ` <span class="merged">(đã gộp ${raw - total} câu trùng)</span>` : ''}`
      : '<span class="warn">Hãy chọn ít nhất 1 bộ đề</span>';
  }
  function setBanks(sel) {
    store.banks = BANKS.map(b => b.id).filter(x => sel.has(x));
    save();
    renderBanks();
    renderCurrent();
  }
  $('#banks-list').addEventListener('change', e => {
    const sel = new Set(selectedBanks());
    const { bank, group } = e.target.dataset;
    if (bank) e.target.checked ? sel.add(bank) : sel.delete(bank);
    else if (group) GROUPS[+group].banks.forEach(id => (e.target.checked ? sel.add(id) : sel.delete(id)));
    else return;
    setBanks(sel);
  });
  $('#banks').addEventListener('click', e => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const name = GROUPS[+t.dataset.toggle].name;
      if (store.openGroups[name]) delete store.openGroups[name]; else store.openGroups[name] = 1;
      save();
      renderBanks();
      return;
    }
    const a = e.target.closest('[data-all]');
    if (a) setBanks(new Set(a.dataset.all === '1' ? BANKS.map(b => b.id) : []));
  });

  // ---------- Đánh dấu & câu sai ----------
  // ★ và câu sai áp dụng cho mọi bản của cùng một câu ở các bộ khác nhau
  const sameKey = (map, id) => Object.keys(map).filter(i => DUPKEY[i] === DUPKEY[id]);
  const isStarred = id => !!store.stars[id] || sameKey(store.stars, id).length > 0;
  const isWrong = id => id in store.wrong || sameKey(store.wrong, id).length > 0;
  function toggleStar(id) {
    const on = isStarred(id);
    if (on) sameKey(store.stars, id).forEach(i => delete store.stars[i]); else store.stars[id] = 1;
    save();
    document.querySelectorAll(`[data-star="${CSS.escape(id)}"]`).forEach(b => {
      b.classList.toggle('on', !on);
      b.title = !on ? 'Bỏ đánh dấu' : 'Đánh dấu câu khó';
    });
  }
  // Sai → vào danh sách; đúng 2 lần liên tiếp → tự gỡ.
  function recordAnswer(id, correct) {
    const ids = sameKey(store.wrong, id);
    if (!correct) { ids.forEach(i => delete store.wrong[i]); store.wrong[id] = 0; return; }
    ids.forEach(i => {
      store.wrong[i] += 1;
      if (store.wrong[i] >= 2) delete store.wrong[i];
    });
  }
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-star]');
    if (s) {
      e.preventDefault();
      toggleStar(s.dataset.star);
      if (store.tab === 'study' && study.filter === 'star') renderStudy();
    }
  });

  // ---------- Thẻ câu hỏi ----------
  // o: { id, order, num, chosen, reveal, interactive, badge }
  function qCard(o) {
    const q = QBY[o.id];
    const order = o.order || range(q.options.length);
    const opts = order.map((oi, i) => {
      const isAns = oi === q.answer;
      let cls = '', tag = '';
      if (o.reveal) {
        if (isAns) { cls = 'right'; tag = o.chosen === i ? '✓ Bạn chọn đúng' : '✓ Đáp án đúng'; }
        else if (o.chosen === i) { cls = 'wrong'; tag = '✗ Bạn chọn'; }
      } else if (o.chosen === i) cls = 'sel';
      const inner = `<span class="L">${LETTERS[i]}</span><span class="T">${esc(q.options[oi])}</span>${tag ? `<span class="tag">${tag}</span>` : ''}`;
      return o.interactive
        ? `<li><button class="opt ${cls}" data-pick="${i}">${inner}</button></li>`
        : `<li><div class="opt ${cls}">${inner}</div></li>`;
    }).join('');
    const star = isStarred(o.id);
    const multiBank = selectedBanks().length > 1;
    return `<article class="card q">
      <div class="q-head">
        <span class="q-num">${esc(o.num)}</span>
        <div class="q-text">${esc(q.text)}</div>
        ${o.badge || ''}
        <button class="star ${star ? 'on' : ''}" data-star="${esc(o.id)}" title="${star ? 'Bỏ đánh dấu' : 'Đánh dấu câu khó'}" aria-label="Đánh dấu">★</button>
      </div>
      ${multiBank ? `<p class="q-bank">${GROUP_NAME[o.id] ? esc(GROUP_NAME[o.id]) + ' › ' : ''}${esc(BANK_NAME[o.id])} · câu ${q.no}</p>` : ''}
      <ul class="opts">${opts}</ul>
    </article>`;
  }

  // ---------- ÔN TẬP ----------
  const study = { order: null, optOrder: {}, filter: 'all', search: '' };
  function renderStudy() {
    let ids = pool('all');
    if (study.order) {
      const pos = {};
      study.order.forEach((id, i) => { pos[id] = i; });
      ids.sort((a, b) => (pos[a] ?? 1e9) - (pos[b] ?? 1e9));
    }
    const total = ids.length;
    if (study.filter === 'star') ids = ids.filter(isStarred);
    if (study.filter === 'wrong') ids = ids.filter(isWrong);
    const term = norm(study.search.trim());
    if (term) ids = ids.filter(id => SEARCH[id].includes(term));
    $('#study-count').textContent = `Hiển thị ${ids.length}/${total} câu` + (study.order ? ' · đã xáo trộn câu hỏi' : '') + (Object.keys(study.optOrder).length ? ' · đã xáo trộn đáp án' : '');
    $('#study-list').innerHTML = ids.length
      ? ids.map((id, i) => qCard({ id, order: study.optOrder[id], num: study.order ? `${i + 1}` : `Câu ${QBY[id].no}`, reveal: true })).join('')
      : `<div class="card empty">${study.filter === 'star' ? 'Chưa có câu nào được đánh dấu ★.' : study.filter === 'wrong' ? 'Chưa có câu làm sai nào. Tuyệt vời!' : 'Không tìm thấy câu hỏi phù hợp.'}</div>`;
  }
  $('#study-search').addEventListener('input', e => { study.search = e.target.value; renderStudy(); });
  $('#study-filter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    study.filter = b.dataset.v;
    [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
    renderStudy();
  });
  $('#study-shuffle-q').addEventListener('click', () => { study.order = shuffle(pool('all')); renderStudy(); });
  $('#study-shuffle-a').addEventListener('click', () => {
    study.optOrder = {};
    pool('all').forEach(id => { study.optOrder[id] = shuffle(range(QBY[id].options.length)); });
    renderStudy();
  });
  $('#study-reset').addEventListener('click', () => { study.order = null; study.optOrder = {}; renderStudy(); });

  // ---------- Phiên làm bài (dùng chung cho Vừa thi vừa ôn & Thi thử) ----------
  const sessions = { practice: null, exam: null };
  const roots = { practice: $('#practice-root'), exam: $('#exam-root') };
  let timer = null;

  function startSession(mode, ids, cfg) {
    const items = ids.map(id => ({
      id,
      order: cfg.shuffle ? shuffle(range(QBY[id].options.length)) : range(QBY[id].options.length),
      chosen: null, done: false
    }));
    const s = { mode, cfg, items, idx: 0, view: 'q', startedAt: Date.now(), endAt: null, reviewFilter: 'all', reviewIdx: 0 };
    if (mode === 'exam' && cfg.minutes > 0) s.endAt = s.startedAt + cfg.minutes * 60000;
    sessions[mode] = s;
    if (mode === 'exam') startTimer();
    render(mode);
    scrollTop();
  }
  const isCorrect = it => it.done && it.chosen != null && it.order[it.chosen] === QBY[it.id].answer;
  function tally(s) {
    let right = 0, wrong = 0, skip = 0;
    s.items.forEach(it => {
      if (!it.done || it.chosen == null) skip++;
      else if (isCorrect(it)) right++;
      else wrong++;
    });
    return { right, wrong, skip, n: s.items.length };
  }

  function finish(mode) {
    const s = sessions[mode];
    if (!s || s.view !== 'q') return;
    s.finishedAt = Date.now();
    s.view = 'result';
    if (mode === 'exam') {
      stopTimer();
      s.items.forEach(it => recordAnswer(it.id, isCorrect(it)));
      const t = tally(s);
      const p = pct(t.right, t.n);
      store.history.unshift({
        t: s.startedAt, banks: [...new Set(s.items.map(it => BANK_NAME[it.id]))],
        n: t.n, right: t.right, wrong: t.wrong, skip: t.skip, pct: p,
        pass: p >= s.cfg.pass, threshold: s.cfg.pass,
        secs: Math.round((s.finishedAt - s.startedAt) / 1000)
      });
      store.history = store.history.slice(0, 200);
    }
    save();
    render(mode);
    scrollTop();
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      const s = sessions.exam;
      if (!s || s.view !== 'q' || !s.endAt) return stopTimer();
      const left = (s.endAt - Date.now()) / 1000;
      const el = $('#exam-timer');
      if (el) { el.textContent = '⏱ ' + fmtTime(left); el.classList.toggle('low', left < 60); }
      if (left <= 0) { s.timedOut = true; finish('exam'); }
    }, 500);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function scrollTop() {
    const top = $('main').getBoundingClientRect().top + window.scrollY - 110;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ----- Màn hình cấu hình -----
  function renderConfig(mode) {
    const cfg = store.cfg[mode];
    const counts = { all: pool('all').length, star: pool('star').length, wrong: pool('wrong').length };
    if (!counts[cfg.source]) cfg.source = 'all';
    const max = counts[cfg.source];
    const count = Math.min(Math.max(1, cfg.count || 1), Math.max(1, max));
    const isExam = mode === 'exam';
    roots[mode].innerHTML = `<div class="card config">
      <h2>${isExam ? 'Thi thử' : 'Vừa thi vừa ôn'}</h2>
      <p class="muted sub">${isExam
        ? 'Làm lần lượt từng câu, bấm Gửi để sang câu kế tiếp. Kết quả hiện sau khi nộp bài.'
        : 'Làm từng câu, bấm Gửi để biết ngay đúng hay sai và xem đáp án đúng.'}</p>
      <div class="field">
        <span class="lbl">Nguồn câu hỏi</span>
        <div class="seg" data-cfg="source">
          <button data-v="all" class="${cfg.source === 'all' ? 'on' : ''}">Tất cả (${counts.all})</button>
          <button data-v="star" class="${cfg.source === 'star' ? 'on' : ''}" ${counts.star ? '' : 'disabled'}>★ Đánh dấu (${counts.star})</button>
          <button data-v="wrong" class="${cfg.source === 'wrong' ? 'on' : ''}" ${counts.wrong ? '' : 'disabled'}>Câu sai (${counts.wrong})</button>
        </div>
      </div>
      <div class="field">
        <label for="${mode}-count">Số lượng câu hỏi</label>
        <div class="num-row">
          <input type="number" id="${mode}-count" min="1" max="${max}" value="${count}" inputmode="numeric">
          <span class="muted">/ ${max} câu</span>
          <button class="btn ghost" data-act="all">Tất cả</button>
        </div>
      </div>
      <div class="field">
        <label class="check"><input type="checkbox" data-cfg="random" ${cfg.random ? 'checked' : ''}> Random thứ tự câu hỏi</label>
        <label class="check"><input type="checkbox" data-cfg="shuffle" ${cfg.shuffle ? 'checked' : ''}> Xáo trộn thứ tự đáp án</label>
      </div>
      ${isExam ? `
      <div class="field">
        <label for="exam-minutes">Thời gian làm bài (phút)</label>
        <div class="num-row"><input type="number" id="exam-minutes" min="0" max="600" value="${cfg.minutes}" inputmode="numeric"><span class="muted">0 = không giới hạn</span></div>
      </div>
      <div class="field">
        <label for="exam-pass">Điểm đạt (% số câu đúng)</label>
        <div class="num-row"><input type="number" id="exam-pass" min="1" max="100" value="${cfg.pass}" inputmode="numeric"><span class="muted">%</span></div>
      </div>` : ''}
      ${max ? '' : '<p class="warn">Chưa có câu hỏi nào — hãy chọn bộ đề ở trên.</p>'}
      <button class="btn primary big" data-act="start" ${max ? '' : 'disabled'}>Bắt đầu</button>
    </div>`;
  }
  function readConfig(mode) {
    const cfg = store.cfg[mode];
    const r = roots[mode];
    const num = (sel, lo, hi, dflt) => {
      const v = parseInt($(sel, r).value, 10);
      return isNaN(v) ? dflt : Math.min(hi, Math.max(lo, v));
    };
    cfg.count = num(`#${mode}-count`, 1, 100000, cfg.count);
    cfg.random = $('[data-cfg=random]', r).checked;
    cfg.shuffle = $('[data-cfg=shuffle]', r).checked;
    if (mode === 'exam') {
      cfg.minutes = num('#exam-minutes', 0, 600, 0);
      cfg.pass = num('#exam-pass', 1, 100, 80);
    }
    save();
    return cfg;
  }
  function begin(mode) {
    const cfg = readConfig(mode);
    let ids = pool(cfg.source);
    if (!ids.length) return;
    if (cfg.random) ids = shuffle(ids);
    ids = ids.slice(0, Math.min(cfg.count, ids.length));
    startSession(mode, ids, Object.assign({}, cfg));
  }

  // ----- Màn hình làm bài -----
  function renderQuestion(mode) {
    const s = sessions[mode];
    const it = s.items[s.idx];
    const n = s.items.length;
    const t = tally(s);
    const doneCount = s.items.filter(x => x.done).length;
    const isExam = mode === 'exam';
    let pills = '';
    if (isExam) {
      if (s.endAt) pills += `<span class="pill timer" id="exam-timer">⏱ ${fmtTime((s.endAt - Date.now()) / 1000)}</span>`;
      pills += `<span class="pill">Đã làm ${doneCount}/${n}</span>`;
    } else {
      pills += `<span class="pill ok">Đúng ${t.right}</span><span class="pill bad">Sai ${t.wrong}</span>`;
    }
    const reveal = !isExam && it.done;
    let feedback = '';
    if (reveal) {
      const q = QBY[it.id];
      const ok = isCorrect(it);
      const L = LETTERS[it.order.indexOf(q.answer)];
      feedback = ok
        ? '<div class="feedback ok">✓ Chính xác!</div>'
        : `<div class="feedback bad">✗ Chưa đúng. Đáp án đúng là ${L}.</div>`;
    } else if (isExam && it.done) {
      feedback = '<p class="hint">Câu này đã gửi đáp án.</p>';
    }

    let primary;
    const remaining = s.items.filter((x, i) => !x.done && i !== s.idx).length;
    if (!it.done) {
      const label = isExam && remaining === 0 ? 'Nộp bài' : 'Gửi';
      primary = `<button class="btn primary big" data-act="submit" data-primary ${it.chosen == null ? 'disabled' : ''}>${label}</button>`;
    } else if (isExam) {
      primary = remaining === 0
        ? '<button class="btn primary big" data-act="finish" data-primary>Nộp bài</button>'
        : '<button class="btn primary big" data-act="next-undone" data-primary>Câu chưa làm ›</button>';
    } else {
      primary = s.idx < n - 1
        ? '<button class="btn primary big" data-act="next" data-primary>Tiếp theo ›</button>'
        : '<button class="btn primary big" data-act="finish" data-primary>Xem kết quả</button>';
    }
    const prev = isExam && s.idx > 0 ? '<button class="btn" data-act="prev">‹ Câu trước</button>' : '';

    roots[mode].innerHTML = `
      <div class="sess-head">
        <strong>Câu ${s.idx + 1}/${n}</strong>
        <div class="score-pills">${pills}</div>
        <button class="btn ghost ${isExam ? '' : 'danger'}" data-act="${isExam ? 'finish-early' : 'end'}">${isExam ? 'Nộp bài' : 'Kết thúc'}</button>
      </div>
      <div class="progress"><div style="width:${pct(doneCount, n)}%"></div></div>
      ${qCard({ id: it.id, order: it.order, num: `${s.idx + 1}`, chosen: it.chosen, reveal, interactive: !it.done })}
      ${feedback}
      <div class="actions">${prev}<div class="right">${primary}</div></div>
      ${isExam ? `<div class="navgrid">${s.items.map((x, i) =>
        `<button data-go="${i}" class="${x.done ? 'done' : ''} ${i === s.idx ? 'cur' : ''}">${i + 1}</button>`).join('')}</div>
        <p class="hint">Bấm số để chuyển nhanh tới câu bất kỳ. Phím tắt: 1–4 hoặc A–D để chọn, Enter để gửi.</p>`
        : '<p class="hint">Phím tắt: 1–4 hoặc A–D để chọn, Enter để gửi / sang câu tiếp.</p>'}`;
  }

  function submit(mode) {
    const s = sessions[mode];
    const it = s.items[s.idx];
    if (it.done || it.chosen == null) return;
    it.done = true;
    if (mode === 'practice') {
      recordAnswer(it.id, isCorrect(it));
      save();
      render(mode);
      return;
    }
    const next = nextUndone(s);
    if (next < 0) return finish('exam');
    s.idx = next;
    render(mode);
    scrollTop();
  }
  function nextUndone(s) {
    const n = s.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (s.idx + k) % n;
      if (!s.items[i].done) return i;
    }
    return -1;
  }

  // ----- Kết quả & xem lại -----
  function renderResult(mode) {
    const s = sessions[mode];
    const t = tally(s);
    const isExam = mode === 'exam';
    const answered = t.right + t.wrong;
    const p = isExam ? pct(t.right, t.n) : pct(t.right, answered);
    const pass = p >= s.cfg.pass;
    const redo = t.wrong + (isExam ? t.skip : 0);
    roots[mode].innerHTML = `<div class="card result">
      <h2>${isExam ? 'Kết quả thi thử' : 'Kết quả luyện tập'}</h2>
      ${s.timedOut ? '<p class="warn">⏱ Hết giờ — bài thi đã được nộp tự động.</p>' : ''}
      <div class="big-score">${t.right}/${isExam ? t.n : answered}</div>
      <div class="muted">${p}% câu đúng · ${fmtTime((s.finishedAt - s.startedAt) / 1000)} phút</div>
      ${isExam ? `<div class="verdict ${pass ? 'pass' : 'fail'}">${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'} (yêu cầu ${s.cfg.pass}%)</div>` : ''}
      <div class="stats">
        <div class="stat ok"><b>${t.right}</b>Đúng</div>
        <div class="stat bad"><b>${t.wrong}</b>Sai</div>
        <div class="stat"><b>${t.skip}</b>${isExam ? 'Bỏ trống' : 'Chưa làm'}</div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="review-all">Xem lại toàn bộ</button>
        <button class="btn" data-act="review-one">Xem từng câu</button>
        ${redo ? `<button class="btn" data-act="redo">Làm lại ${redo} câu ${isExam && t.skip ? 'sai & bỏ trống' : 'sai'}</button>` : ''}
        <button class="btn ghost" data-act="new">Làm bài mới</button>
      </div>
    </div>`;
  }
  function badgeOf(it) {
    if (!it.done || it.chosen == null) return '<span class="badge skip">Bỏ trống</span>';
    return isCorrect(it) ? '<span class="badge ok">Đúng</span>' : '<span class="badge bad">Sai</span>';
  }
  function renderReviewAll(mode) {
    const s = sessions[mode];
    const f = s.reviewFilter;
    const list = s.items.map((it, i) => ({ it, i })).filter(({ it }) =>
      f === 'all' ? true : f === 'right' ? isCorrect(it) : !isCorrect(it));
    roots[mode].innerHTML = `
      <div class="review-head">
        <button class="btn" data-act="back-result">‹ Kết quả</button>
        <div class="seg" data-act-seg="review-filter">
          <button data-v="all" class="${f === 'all' ? 'on' : ''}">Tất cả</button>
          <button data-v="wrong" class="${f === 'wrong' ? 'on' : ''}">Sai / bỏ trống</button>
          <button data-v="right" class="${f === 'right' ? 'on' : ''}">Đúng</button>
        </div>
      </div>
      <div class="qlist">${list.length
        ? list.map(({ it, i }) => qCard({ id: it.id, order: it.order, num: `${i + 1}`, chosen: it.chosen, reveal: true, badge: badgeOf(it) })).join('')
        : '<div class="card empty">Không có câu nào.</div>'}</div>`;
  }
  function renderReviewOne(mode) {
    const s = sessions[mode];
    const n = s.items.length;
    const i = s.reviewIdx;
    const it = s.items[i];
    roots[mode].innerHTML = `
      <div class="review-head">
        <button class="btn" data-act="back-result">‹ Kết quả</button>
        <strong>Câu ${i + 1}/${n}</strong>
      </div>
      ${qCard({ id: it.id, order: it.order, num: `${i + 1}`, chosen: it.chosen, reveal: true, badge: badgeOf(it) })}
      <div class="actions">
        <button class="btn" data-act="r-prev" ${i === 0 ? 'disabled' : ''}>‹ Trước</button>
        <div class="right"><button class="btn primary" data-act="r-next" data-primary ${i === n - 1 ? 'disabled' : ''}>Sau ›</button></div>
      </div>
      <div class="navgrid">${s.items.map((x, k) => {
        const c = !x.done || x.chosen == null ? '' : isCorrect(x) ? 'r' : 'w';
        return `<button data-rgo="${k}" class="${c} ${k === i ? 'cur' : ''}">${k + 1}</button>`;
      }).join('')}</div>`;
  }

  function render(mode) {
    const s = sessions[mode];
    // Ẩn hộp chọn bộ đề khi đang làm bài, hiện lại ở màn hình cấu hình
    if (mode === store.tab) $('#banks').classList.toggle('hidden', s != null);
    if (!s) return renderConfig(mode);
    ({ q: renderQuestion, result: renderResult, reviewAll: renderReviewAll, reviewOne: renderReviewOne })[s.view](mode);
  }

  // ----- Sự kiện trong phiên -----
  ['practice', 'exam'].forEach(mode => {
    const root = roots[mode];
    root.addEventListener('click', e => {
      const s = sessions[mode];
      const pick = e.target.closest('[data-pick]');
      if (pick && s && s.view === 'q') {
        const it = s.items[s.idx];
        if (!it.done) { it.chosen = +pick.dataset.pick; render(mode); }
        return;
      }
      const seg = e.target.closest('.seg button');
      if (seg) {
        const box = seg.parentElement;
        if (box.dataset.cfg === 'source') {
          readConfig(mode);
          store.cfg[mode].source = seg.dataset.v; save(); renderConfig(mode);
        } else if (box.dataset.actSeg === 'review-filter') {
          s.reviewFilter = seg.dataset.v; renderReviewAll(mode);
        }
        return;
      }
      const go = e.target.closest('[data-go]');
      if (go) { s.idx = +go.dataset.go; render(mode); return; }
      const rgo = e.target.closest('[data-rgo]');
      if (rgo) { s.reviewIdx = +rgo.dataset.rgo; render(mode); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      switch (b.dataset.act) {
        case 'all': $(`#${mode}-count`, root).value = $(`#${mode}-count`, root).max; break;
        case 'start': begin(mode); break;
        case 'submit': submit(mode); break;
        case 'next': s.idx++; render(mode); scrollTop(); break;
        case 'prev': s.idx--; render(mode); break;
        case 'next-undone': { const k = nextUndone(s); if (k >= 0) { s.idx = k; render(mode); } break; }
        case 'finish': finish(mode); break;
        case 'finish-early': {
          const left = s.items.filter(x => !x.done).length;
          if (!left || confirm(`Còn ${left} câu chưa làm. Bạn chắc chắn muốn nộp bài?`)) finish(mode);
          break;
        }
        case 'end':
          if (!s.items.some(x => x.done)) { sessions[mode] = null; render(mode); }
          else finish(mode);
          break;
        case 'review-all': s.view = 'reviewAll'; s.reviewFilter = 'all'; render(mode); scrollTop(); break;
        case 'review-one': s.view = 'reviewOne'; s.reviewIdx = 0; render(mode); scrollTop(); break;
        case 'back-result': s.view = 'result'; render(mode); scrollTop(); break;
        case 'r-prev': s.reviewIdx--; render(mode); break;
        case 'r-next': s.reviewIdx++; render(mode); break;
        case 'redo': {
          const ids = s.items.filter(x => !isCorrect(x) && (mode === 'exam' || x.done)).map(x => x.id);
          const cfg = Object.assign({}, s.cfg);
          if (cfg.minutes > 0) cfg.minutes = Math.max(1, Math.ceil(cfg.minutes * ids.length / s.items.length));
          startSession(mode, cfg.random ? shuffle(ids) : ids, cfg);
          break;
        }
        case 'new': sessions[mode] = null; render(mode); break;
      }
    });
  });

  // Phím tắt
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const mode = store.tab;
    const s = sessions[mode];
    if (!s) return;
    if (s.view === 'q') {
      const it = s.items[s.idx];
      const k = e.key.toLowerCase();
      let i = -1;
      if (/^[1-8]$/.test(k)) i = +k - 1;
      else if (/^[a-h]$/.test(k)) i = k.charCodeAt(0) - 97;
      if (i >= 0 && !it.done && i < it.order.length) { it.chosen = i; render(mode); e.preventDefault(); return; }
    }
    if (e.key === 'Enter') {
      const p = $('[data-primary]', roots[mode]);
      if (p && !p.disabled) { e.preventDefault(); p.click(); }
    }
  });

  window.addEventListener('beforeunload', e => {
    const s = sessions.exam;
    if (s && s.view === 'q' && s.items.some(x => x.done)) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- LỊCH SỬ ----------
  function renderHistory() {
    const h = store.history;
    const passCount = h.filter(x => x.pass).length;
    const avg = h.length ? Math.round(h.reduce((a, x) => a + x.pct, 0) / h.length) : 0;
    const best = h.length ? Math.max(...h.map(x => x.pct)) : 0;
    const starN = Object.keys(store.stars).filter(id => QBY[id]).length;
    const wrongN = Object.keys(store.wrong).filter(id => QBY[id]).length;
    $('#history-root').innerHTML = `
      <div class="hist-stats">
        <div class="card"><b>${h.length}</b><span class="muted">Lần thi thử</span></div>
        <div class="card"><b>${passCount}</b><span class="muted">Lần đạt</span></div>
        <div class="card"><b>${avg}%</b><span class="muted">Điểm trung bình</span></div>
        <div class="card"><b>${best}%</b><span class="muted">Cao nhất</span></div>
      </div>
      <div class="card">
        ${h.length ? `<div class="table-scroll"><table class="hist">
          <thead><tr><th>Thời gian</th><th>Bộ đề</th><th>Kết quả</th><th>Thời lượng</th></tr></thead>
          <tbody>${h.map(x => `<tr>
            <td>${fmtDate(x.t)}</td>
            <td>${esc(x.banks.join(', '))}</td>
            <td><strong>${x.right}/${x.n}</strong> (${x.pct}%) <span class="badge ${x.pass ? 'ok' : 'bad'}">${x.pass ? 'Đạt' : 'Không đạt'}</span></td>
            <td>${fmtTime(x.secs)}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">Chưa có lần thi thử nào.</div>'}
      </div>
      <h2 class="section-title">Dữ liệu ôn tập trên máy này</h2>
      <div class="card">
        <p style="margin-top:0">★ Câu đã đánh dấu: <strong>${starN}</strong> · Câu đang trong danh sách làm sai: <strong>${wrongN}</strong></p>
        <p class="hint">Câu làm sai sẽ tự gỡ khỏi danh sách khi bạn trả lời đúng 2 lần liên tiếp. Dữ liệu chỉ lưu trên trình duyệt của thiết bị này.</p>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn danger" data-clear="stars">Xoá đánh dấu ★</button>
          <button class="btn danger" data-clear="wrong">Xoá danh sách câu sai</button>
          <button class="btn danger" data-clear="history">Xoá lịch sử thi</button>
        </div>
      </div>`;
  }
  $('#history-root').addEventListener('click', e => {
    const b = e.target.closest('[data-clear]');
    if (!b) return;
    const what = { stars: 'các câu đã đánh dấu ★', wrong: 'danh sách câu làm sai', history: 'toàn bộ lịch sử thi' }[b.dataset.clear];
    if (!confirm(`Xoá ${what}? Thao tác này không hoàn tác được.`)) return;
    store[b.dataset.clear] = b.dataset.clear === 'history' ? [] : {};
    save();
    renderHistory();
  });

  // ---------- Tabs ----------
  function renderCurrent() {
    const t = store.tab;
    if (t === 'study') renderStudy();
    else if (t === 'history') renderHistory();
    else {
      const s = sessions[t];
      if (!s) renderConfig(t);
    }
  }
  function setTab(t) {
    if (!['study', 'practice', 'exam', 'history'].includes(t)) t = 'study';
    store.tab = t; save();
    document.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === t);
      b.setAttribute('aria-selected', b.dataset.tab === t);
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === t));
    $('#banks').classList.toggle('hidden', t === 'history' || (sessions[t] != null));
    renderCurrent();
    if (sessions[t]) render(t);
  }
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) { setTab(b.dataset.tab); window.scrollTo(0, 0); }
  });

  renderBanks();
  setTab(store.tab);
})();
