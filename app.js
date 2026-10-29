/* German Word Quiz: user interface. All vocabulary logic lives in core.js. */
(function () {
  'use strict';
  const C = window.Core;
  const ALL = C.prepare(window.VOCAB);
  const app = document.getElementById('app');

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep going */ } },
  };
  const GROUPS = [['noun', 'Nouns'], ['verb', 'Verbs'], ['other', 'Adjectives & other words'], ['phrase', 'Phrases']];
  const MODES = [
    ['mixed', 'Mixed practice', 'A varied mix of question types, chosen for each word. Recommended.'],
    ['de-en', 'German to English', 'See a German word and choose its meaning.'],
    ['en-de', 'English to German', 'See an English meaning and choose the German word.'],
    ['article', 'Articles', 'Choose der, die or das for a noun.'],
    ['plural', 'Plurals', 'Type the plural of a noun.'],
    ['perfect', 'Perfect tense', 'Type the perfect form of a verb (for example: hat gearbeitet).'],
    ['gap', 'Fill the gap', 'Complete an example sentence with the missing word.'],
    ['cards', 'Flashcards', 'Turn a card, then say how well you knew it. Cards return when they are due.'],
    ['mistakes', 'Review my mistakes', 'Words you got wrong and have not mastered yet.'],
  ];
  const defaults = { levels: C.LEVELS.slice(), mode: 'mixed', count: 10, groups: GROUPS.map((g) => g[0]), cardSide: 'german' };
  let settings = Object.assign({}, defaults, store.get('wq.settings', {}));
  let progress = store.get('wq.progress', {});
  const save = () => { store.set('wq.settings', settings); store.set('wq.progress', progress); };

  /* ---------- tiny DOM helper ---------- */
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    const add = (x) => {
      if (x == null || x === false) return;
      if (Array.isArray(x)) x.forEach(add);
      else n.append(x.nodeType ? x : document.createTextNode(String(x)));
    };
    kids.forEach(add);
    return n;
  }
  function show(...nodes) {
    app.replaceChildren(...nodes.flat(Infinity).filter((x) => x != null && x !== false));
    window.scrollTo(0, 0);
  }
  let keyHandler = null;
  const setKeys = (fn) => { keyHandler = fn; };
  document.addEventListener('keydown', (e) => { if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey) keyHandler(e); });

  const groupName = (g) => (GROUPS.find((x) => x[0] === g) || [0, g])[1];
  const now = () => Date.now();

  /* ---------- navigation ---------- */
  const nav = document.getElementById('nav');
  function go(view) {
    setKeys(null);
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    ({ practise: viewPractise, browse: viewBrowse, progress: viewProgress })[view]();
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.view); });
  document.getElementById('brand').addEventListener('click', (e) => { e.preventDefault(); go('practise'); });

  /* ---------- word details (used after answers, in summaries, flashcards) ---------- */
  function detail(w) {
    const rows = [];
    const add = (k, v) => v && rows.push(el('dt', null, k), el('dd', null, v));
    add('Meaning', w.meaning);
    if (w.plural) add('Plural', 'die ' + w.plural);
    if (w.perfect) add('Perfect', w.perfect + (w.separable ? '  (separable verb)' : ''));
    else if (w.separable) add('Note', 'Separable verb');
    add('Example', w.example && el('span', { class: 'ex' }, w.example));
    add('Also', w.notes);
    add('From', w.level + ', lesson ' + w.lesson);
    return el('div', { class: 'detail' }, el('div', { class: 'w' }, w.display), el('dl', null, rows));
  }

  /* ---------- practise: setup ---------- */
  function checkboxes(items, selected, onChange, disabled) {
    return el('div', { class: 'opts' + (disabled ? ' disabled' : '') }, items.map(([val, label]) =>
      el('label', null,
        el('input', { type: 'checkbox', checked: selected.includes(val), onchange: (e) => {
          const set = new Set(selected);
          e.target.checked ? set.add(val) : set.delete(val);
          onChange(Array.from(set));
        } }), label)));
  }

  function poolFor(mode) {
    const lv = new Set(settings.levels);
    const gr = new Set(settings.groups);
    const free = ['mixed', 'de-en', 'en-de', 'cards', 'mistakes'].includes(mode);
    return ALL.filter((w) => {
      if (!lv.has(w.level)) return false;
      if (free && !gr.has(w.group)) return false;
      if (mode === 'mistakes') return C.isMistake(progress[w.id]);
      if (['article', 'plural', 'perfect', 'gap'].includes(mode)) return C.kindsFor(w).includes(mode);
      return true;
    });
  }

  function viewPractise() {
    const mistakes = ALL.filter((w) => C.isMistake(progress[w.id])).length;
    const modeBox = el('div', { class: 'modes' }, MODES.map(([id, name, desc]) =>
      el('label', { class: 'mode' + (settings.mode === id ? ' on' : '') },
        el('input', { type: 'radio', name: 'mode', checked: settings.mode === id, onchange: () => { settings.mode = id; save(); viewPractise(); } }),
        el('div', null, el('b', null, name + (id === 'mistakes' ? ' (' + mistakes + ')' : '')), el('span', null, desc)))));

    const free = ['mixed', 'de-en', 'en-de', 'cards', 'mistakes'].includes(settings.mode);
    const pool = poolFor(settings.mode);
    const count = el('select', { onchange: (e) => { settings.count = Number(e.target.value); save(); } },
      [10, 20, 30, 50].map((n) => el('option', { value: n, selected: settings.count === n }, n + (settings.mode === 'cards' ? ' cards' : ' questions'))));
    const side = el('select', { onchange: (e) => { settings.cardSide = e.target.value; save(); } },
      el('option', { value: 'german', selected: settings.cardSide === 'german' }, 'German first'),
      el('option', { value: 'english', selected: settings.cardSide === 'english' }, 'English first'));
    const start = el('button', { class: 'btn primary', disabled: pool.length === 0 || settings.levels.length === 0, onclick: () => startSession(settings.mode) }, 'Start');

    show(
      el('h1', null, 'Practise'),
      el('p', { class: 'muted' }, 'Take your time. Every answer shows the correct form, the plural or perfect, and an example. Words you miss come back at the end of the session and again in later sessions.'),
      el('h2', null, 'What would you like to practise?'), modeBox,
      el('h2', null, 'Levels'),
      checkboxes(C.LEVELS.map((l) => [l, l + ' (' + ALL.filter((w) => w.level === l).length + ')']), settings.levels, (v) => { settings.levels = v; save(); viewPractise(); }),
      el('h2', null, 'Word types'),
      checkboxes(GROUPS, settings.groups, (v) => { settings.groups = v; save(); viewPractise(); }, !free),
      !free && el('p', { class: 'muted small spacer' }, 'This mode uses the word types it needs.'),
      el('h2', null, 'Session'),
      el('div', { class: 'row' }, count, settings.mode === 'cards' && side),
      el('p', { class: 'muted small spacer' }, pool.length + (pool.length === 1 ? ' word' : ' words') + ' available with these settings.'),
      el('div', { class: 'spacer' }, start));
  }

  /* ---------- practise: session ---------- */
  let S = null; // current session

  function startSession(mode) {
    const pool = poolFor(mode);
    const words = C.pickWords(pool, progress, settings.count, now());
    if (!words.length) return;
    S = { mode, pool, words, queue: [], i: 0, firstTry: 0, firstTotal: 0, missed: new Map() };
    if (mode === 'cards') {
      S.queue = C.shuffle(words).map((w) => ({ word: w, kind: 'card', retry: false }));
      return nextStep();
    }
    S.queue = C.shuffle(words).map((w) => {
      const kinds = C.kindsFor(w);
      const kind = (mode === 'mixed' || mode === 'mistakes') ? kinds[Math.floor(Math.random() * kinds.length)] : mode;
      return Object.assign(C.makeQuestion(w, kind, pool, ALL), { retry: false });
    });
    nextStep();
  }

  function nextStep() {
    if (S.i >= S.queue.length) return summary();
    const q = S.queue[S.i];
    q.kind === 'card' ? renderCard(q) : renderQuestion(q);
  }

  function header() {
    const done = S.i, total = S.queue.length;
    return [el('div', { class: 'kicker' }, 'Question ' + (done + 1) + ' of ' + total),
      el('div', { class: 'meter' }, el('i', { style: 'width:' + Math.round((done / total) * 100) + '%' }))];
  }

  function record(q, correct, jump) {
    if (!q.retry) {
      progress[q.word.id] = C.review(progress[q.word.id], correct, now(), jump);
      S.firstTotal++;
      if (correct) S.firstTry++;
      else S.missed.set(q.word.id, q.word);
      save();
    }
    if (!correct && !q.retry) {
      // ask it again once at the end of the session
      const again = q.kind === 'card' ? { word: q.word, kind: 'card', retry: true }
        : Object.assign(C.makeQuestion(q.word, q.kind, S.pool, ALL), { retry: true });
      S.queue.push(again);
    }
  }

  function prompts(q) {
    const tag = el('span', { class: 'chip' }, groupName(q.tag === 'noun' || q.tag === 'verb' || q.tag === 'phrase' ? q.tag : 'other').replace(' & other words', ''));
    if (q.kind === 'article') return [el('div', { class: 'kicker' }, 'Which article?'), el('div', { class: 'prompt' }, q.prompt, tag)];
    if (q.kind === 'de-en') return [el('div', { class: 'kicker' }, 'What does it mean?'), el('div', { class: 'prompt' }, q.prompt, tag)];
    if (q.kind === 'en-de') return [el('div', { class: 'kicker' }, 'How do you say it in German?'), el('div', { class: 'prompt' }, q.prompt, tag)];
    return [];
  }

  function feedback(q, correct, given, note) {
    const box = el('div', { class: 'feedback ' + (correct ? 'good' : 'bad'), role: 'status' },
      correct ? 'Correct.' : (given === '' ? 'No problem. The answer is ' : 'Not quite. The answer is '),
      !correct && el('span', { class: 'ans' }, q.answer + '.'),
      note && el('div', { class: 'small' }, note),
      !correct && !q.retry && el('div', { class: 'small' }, 'You will see this one again at the end.'));
    return [box, detail(q.word)];
  }

  function renderQuestion(q) {
    let answered = false;
    const area = el('div');
    const finish = (correct, given, note) => {
      answered = true;
      record(q, correct);
      const last = S.i + 1 >= S.queue.length;
      const nextBtn = el('button', { class: 'btn primary spacer', onclick: () => { S.i++; nextStep(); } }, last ? 'See summary' : 'Next');
      area.append(...feedback(q, correct, given, note), nextBtn);
      nextBtn.focus();
      setKeys(null);
    };

    if (q.mode === 'choice') {
      const buttons = q.options.map((opt, idx) => el('button', { class: 'choice', onclick: () => pick(opt) },
        el('kbd', null, idx + 1), el('span', null, opt)));
      const pick = (opt) => {
        if (answered) return;
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (q.options[i] === q.answer) b.classList.add('right');
          else if (q.options[i] === opt) b.classList.add('wrong');
        });
        finish(opt === q.answer, opt);
      };
      const unsure = el('button', { class: 'btn spacer', onclick: () => pick(null) }, "I don't know");
      area.append(el('div', { class: 'choices' + (q.kind === 'article' ? ' articles' : '') }, buttons), unsure);
      setKeys((e) => { const n = Number(e.key); if (n >= 1 && n <= q.options.length) pick(q.options[n - 1]); });
      show(...header(), ...prompts(q), area);
      return;
    }

    // typed answers
    const input = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': q.label });
    const submit = (e) => {
      e && e.preventDefault();
      if (answered) return;
      const r = C.checkTyped(q, input.value);
      if (r.empty) { input.focus(); return; }
      input.disabled = true; check.disabled = true; skip.disabled = true;
      finish(r.correct, input.value, r.note);
    };
    const check = el('button', { class: 'btn primary', type: 'submit' }, 'Check');
    const skip = el('button', { class: 'btn', type: 'button', onclick: () => { input.disabled = true; check.disabled = true; skip.disabled = true; finish(false, ''); } }, "I don't know");
    const keys = el('div', { class: 'keys' }, ['ä', 'ö', 'ü', 'ß'].map((ch) => el('button', { type: 'button', 'aria-label': 'insert ' + ch, onclick: () => {
      const s = input.selectionStart || input.value.length, t = input.selectionEnd || s;
      input.value = input.value.slice(0, s) + ch + input.value.slice(t);
      input.focus(); input.setSelectionRange(s + 1, s + 1);
    } }, ch)));

    let top;
    if (q.kind === 'gap') {
      top = [el('div', { class: 'kicker' }, 'Complete the sentence'),
        el('div', { class: 'sentence' }, q.before, input, q.after),
        el('p', { class: 'muted' }, 'Meaning of the missing word: ', el('b', null, q.hint))];
    } else {
      top = [el('div', { class: 'kicker' }, q.label), el('div', { class: 'prompt' }, q.prompt),
        el('p', { class: 'muted' }, 'Meaning: ', q.hint), el('div', { class: 'typed' }, input)];
    }
    const form = el('form', { onsubmit: submit }, top, keys, el('div', { class: 'row spacer' }, check, skip));
    area.append(form);
    show(...header(), area);
    input.focus();
  }

  function renderCard(q) {
    const w = q.word;
    const englishFirst = settings.cardSide === 'english';
    const front = englishFirst ? w.meaning : w.display;
    const area = el('div');
    const rate = (correct, jump) => { record(q, correct, jump); S.i++; nextStep(); };
    const reveal = () => {
      area.replaceChildren(
        el('div', { class: 'card flash' }, el('div', { class: 'kicker' }, englishFirst ? 'German' : 'English'),
          el('div', { class: 'prompt' }, englishFirst ? w.display : w.meaning)),
        detail(w),
        el('p', { class: 'muted small spacer' }, 'How well did you know it?'),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => rate(false) }, el('kbd', null, '1'), ' Again'),
          el('button', { class: 'btn primary', onclick: () => rate(true, 1) }, el('kbd', null, '2'), ' Good'),
          el('button', { class: 'btn', onclick: () => rate(true, 2) }, el('kbd', null, '3'), ' Easy')));
      setKeys((e) => { if (e.key === '1') rate(false); else if (e.key === '2') rate(true, 1); else if (e.key === '3') rate(true, 2); });
    };
    const showBtn = el('button', { class: 'btn primary spacer', onclick: reveal }, 'Show answer');
    area.append(el('div', { class: 'card flash' }, el('div', { class: 'kicker' }, englishFirst ? 'English' : 'German'),
      el('div', { class: 'prompt' }, front)), showBtn);
    setKeys((e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); } });
    const head = header(); head[0].textContent = 'Card ' + (S.i + 1) + ' of ' + S.queue.length + (q.retry ? ' (second look)' : '');
    show(...head, area);
    showBtn.focus();
  }

  function summary() {
    setKeys(null);
    const missed = Array.from(S.missed.values());
    const due = ALL.filter((w) => progress[w.id] && progress[w.id].due <= now()).length;
    show(
      el('h1', null, 'Session finished'),
      el('p', null, S.mode === 'cards'
        ? 'You went through ' + S.firstTotal + ' cards.'
        : 'You answered ' + S.firstTry + ' of ' + S.firstTotal + ' questions correctly on the first try.'),
      missed.length
        ? [el('h2', null, 'Words to keep an eye on'), missed.map((w) => detail(w))]
        : el('p', { class: 'muted' }, 'No mistakes this time.'),
      el('p', { class: 'muted small spacer' }, due + ' words are due for review.'),
      el('div', { class: 'row spacer' },
        el('button', { class: 'btn primary', onclick: () => startSession(S.mode) }, 'Practise again'),
        el('button', { class: 'btn', onclick: () => go('practise') }, 'Back to start')));
  }

  /* ---------- vocabulary browser ---------- */
  function viewBrowse() {
    let shown = 100;
    const f = { level: 'all', group: 'all', text: '' };
    const body = el('tbody');
    const count = el('p', { class: 'muted small' });
    const more = el('button', { class: 'btn spacer', onclick: () => { shown += 100; draw(); } }, 'Show more');
    const q = (s) => C.fold(s || '');
    function draw() {
      const t = q(f.text);
      const rows = ALL.filter((w) => (f.level === 'all' || w.level === f.level) && (f.group === 'all' || w.group === f.group) &&
        (!t || q(w.display).includes(t) || q(w.meaning).includes(t) || q(w.example).includes(t)));
      count.textContent = rows.length + ' entries';
      body.replaceChildren(...rows.slice(0, shown).map((w) => el('tr', null,
        el('td', null, el('b', null, w.display), w.separable && el('span', { class: 'tag' }, 'separable')),
        el('td', null, [w.plural && 'die ' + w.plural, w.perfect].filter(Boolean).join(' · ')),
        el('td', null, w.meaning),
        el('td', null, w.example),
        el('td', null, w.level))));
      more.style.display = rows.length > shown ? '' : 'none';
    }
    show(
      el('h1', null, 'Vocabulary'),
      el('p', { class: 'muted' }, 'Browse and search every word. Search works for German and English (ä can be typed as ae).'),
      el('div', { class: 'filters' },
        el('input', { type: 'search', placeholder: 'Search German or English', 'aria-label': 'Search', oninput: (e) => { f.text = e.target.value; shown = 100; draw(); } }),
        el('select', { 'aria-label': 'Level', onchange: (e) => { f.level = e.target.value; shown = 100; draw(); } },
          el('option', { value: 'all' }, 'All levels'), C.LEVELS.map((l) => el('option', { value: l }, l))),
        el('select', { 'aria-label': 'Word type', onchange: (e) => { f.group = e.target.value; shown = 100; draw(); } },
          el('option', { value: 'all' }, 'All types'), GROUPS.map(([v, n]) => el('option', { value: v }, n)))),
      count,
      el('div', { class: 'tablewrap' }, el('table', null,
        el('thead', null, el('tr', null, ['Word', 'Plural / perfect', 'Meaning', 'Example', 'Level'].map((h) => el('th', null, h)))), body)),
      more);
    draw();
  }

  /* ---------- progress ---------- */
  function viewProgress() {
    const st = C.stats(ALL, progress, now());
    const mistakes = ALL.filter((w) => C.isMistake(progress[w.id]));
    const fileIn = el('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((t) => {
        const d = JSON.parse(t);
        if (d && typeof d.progress === 'object') { progress = d.progress; if (d.settings) settings = Object.assign({}, defaults, d.settings); save(); viewProgress(); }
      }).catch(() => alert('That file could not be read.'));
    } });
    show(
      el('h1', null, 'Progress'),
      el('p', { class: 'muted' }, '"Seen" means you have answered the word at least once. "Learned" means you have answered it correctly several times in a row, so it now comes back only after a few weeks.'),
      el('div', { class: 'tablewrap' }, el('table', null,
        el('thead', null, el('tr', null, ['Level', 'Words', 'Seen', 'Learned', 'Due now', ''].map((h) => el('th', null, h)))),
        el('tbody', null, C.LEVELS.map((l) => {
          const s = st[l];
          return el('tr', null, el('td', null, el('b', null, l)), el('td', { class: 'num' }, s.total), el('td', { class: 'num' }, s.seen),
            el('td', { class: 'num' }, s.learned), el('td', { class: 'num' }, s.due),
            el('td', null, el('div', { class: 'bar2', title: s.learned + ' of ' + s.total + ' learned' }, el('i', { style: 'width:' + Math.round((s.learned / s.total) * 100) + '%' }))));
        })))),
      el('h2', null, 'Mistakes to review (' + mistakes.length + ')'),
      mistakes.length
        ? el('div', null, mistakes.slice(0, 12).map((w) => el('span', { class: 'chip' }, w.display)),
            el('div', { class: 'spacer' }, el('button', { class: 'btn primary', onclick: () => { settings.mode = 'mistakes'; save(); startSession('mistakes'); } }, 'Review them')))
        : el('p', { class: 'muted' }, 'Nothing to review right now.'),
      el('h2', null, 'Your data'),
      el('p', { class: 'muted small' }, 'Progress is stored in this browser only. Export it to keep a backup or move to another device.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: () => {
          const blob = new Blob([JSON.stringify({ progress, settings }, null, 1)], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: 'german-word-quiz-progress.json' });
          document.body.append(a); a.click(); a.remove();
        } }, 'Export progress'),
        el('button', { class: 'btn', onclick: () => fileIn.click() }, 'Import progress'), fileIn,
        el('button', { class: 'btn danger', onclick: () => { if (confirm('Delete all saved progress?')) { progress = {}; save(); viewProgress(); } } }, 'Reset progress')));
  }

  go('practise');
})();
