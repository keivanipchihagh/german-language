/* Core logic for the German word quiz: no DOM access, so it can be tested on its own. */
(function (root) {
  'use strict';

  const LEVELS = ['A1.1', 'A1.2', 'A2.1', 'A2.2'];
  const DAY = 86400000;
  const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]; // days until the next review for box 0..5
  const MAX_BOX = INTERVAL_DAYS.length - 1;

  const KIND_LABELS = {
    'de-en': 'German to English',
    'en-de': 'English to German',
    article: 'Articles',
    plural: 'Plurals',
    perfect: 'Perfect tense',
    gap: 'Fill the gap',
  };

  /* ---------- data ---------- */

  function group(w) {
    if (w.type === 'noun' || w.type === 'verb' || w.type === 'phrase') return w.type;
    return 'other'; // adjectives, adverbs, question words, ...
  }

  function prepare(raw) {
    return raw.map((r) => {
      const w = Object.assign({}, r);
      w.lesson = Number(r.lesson);
      w.display = (r.article ? r.article + ' ' : '') + r.word;
      w.id = [r.level, r.article, r.word, r.type].join('|');
      w.group = group(r);
      return w;
    });
  }

  /* ---------- helpers ---------- */

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function esc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function norm(s) {
    return s.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // "Häuser" -> "haeuser": lets people on an English keyboard type ae/oe/ue/ss
  function fold(s) {
    return norm(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  }

  /* ---------- question kinds ---------- */

  // the form of the word as it appears in its example sentence (or null)
  function gapMatch(w) {
    if (!w.example) return null;
    if (w.meaning.startsWith('(')) return null;
    const cands = [];
    const base = w.word.replace(/^sich /, '').replace(/\s*\(.*\)$/, '');
    cands.push(base);
    if (w.plural) cands.push(w.plural);
    for (const c of cands) {
      if (c.length < 4 || c.includes(' ')) continue;
      const re = new RegExp('(^|[^\\p{L}])(' + esc(c) + ')(?=$|[^\\p{L}])', 'iu');
      const m = re.exec(w.example);
      if (m) {
        const start = m.index + m[1].length;
        return { start, end: start + m[2].length, surface: m[2] };
      }
    }
    return null;
  }

  function kindsFor(w) {
    const k = ['de-en', 'en-de'];
    if (w.type === 'noun' && w.article) k.push('article');
    if (w.type === 'noun' && w.plural) k.push('plural');
    if (w.type === 'verb' && /^(hat|ist) [^()/]+$/.test(w.perfect)) k.push('perfect');
    if (gapMatch(w)) k.push('gap');
    return k;
  }

  function distractors(w, pool, all, textOf, n, ok) {
    const seen = new Set([textOf(w)]);
    const out = [];
    const take = (list) => {
      for (const x of shuffle(list)) {
        if (out.length >= n) return;
        const t = textOf(x);
        if (x.id === w.id || seen.has(t) || !ok(x)) continue;
        seen.add(t);
        out.push(t);
      }
    };
    const sameType = (x) => x.group === w.group && !!x.article === !!w.article;
    take(pool.filter(sameType));
    take(all.filter(sameType));
    take(all);
    return out;
  }

  function choiceQuestion(w, kind, pool, all) {
    let prompt, answer, options, tag = w.group;
    if (kind === 'article') {
      prompt = w.word;
      answer = w.article;
      options = ['der', 'die', 'das'];
    } else if (kind === 'de-en') {
      prompt = w.display;
      answer = w.meaning;
      options = shuffle([answer].concat(
        distractors(w, pool, all, (x) => x.meaning, 3, (x) => x.meaning !== w.meaning)));
    } else { // en-de
      prompt = w.meaning;
      answer = w.display;
      options = shuffle([answer].concat(
        distractors(w, pool, all, (x) => x.display, 3, (x) => x.meaning !== w.meaning)));
    }
    return { word: w, kind, mode: 'choice', prompt, tag, answer, options };
  }

  function typedQuestion(w, kind) {
    if (kind === 'plural') {
      return { word: w, kind, mode: 'type', prompt: w.display, tag: 'noun',
               hint: w.meaning, label: 'Plural: die …', answer: w.plural };
    }
    if (kind === 'perfect') {
      return { word: w, kind, mode: 'type', prompt: w.word, tag: 'verb',
               hint: w.meaning, label: 'Perfect tense (hat / ist + participle)', answer: w.perfect };
    }
    const g = gapMatch(w);
    return { word: w, kind: 'gap', mode: 'type',
             before: w.example.slice(0, g.start), after: w.example.slice(g.end),
             tag: w.group, hint: w.meaning, label: 'Missing word', answer: g.surface,
             alt: [w.word.replace(/^sich /, '').replace(/\s*\(.*\)$/, '')] };
  }

  function makeQuestion(w, kind, pool, all) {
    return (kind === 'plural' || kind === 'perfect' || kind === 'gap')
      ? typedQuestion(w, kind)
      : choiceQuestion(w, kind, pool, all);
  }

  /* ---------- checking typed answers ---------- */

  function checkTyped(q, input) {
    const given = norm(input);
    if (!given) return { correct: false, empty: true };
    const accepted = [q.answer].concat(q.alt || []);
    const strip = (s) => (q.kind === 'plural' ? norm(s).replace(/^die /, '') : norm(s));
    for (const a of accepted) if (strip(input) === norm(a)) return { correct: true };
    for (const a of accepted) {
      if (fold(strip(input)) === fold(a)) {
        return { correct: true, note: 'Correct, but mind the spelling: ' + a };
      }
    }
    return { correct: false };
  }

  /* ---------- spaced repetition (simple Leitner boxes) ---------- */

  function review(rec, correct, now, jump) {
    const r = Object.assign({ box: 0, seen: 0, misses: 0, due: 0 }, rec);
    r.seen += 1;
    if (correct) {
      r.box = Math.min(MAX_BOX, r.box + (jump || 1));
      r.due = now + INTERVAL_DAYS[r.box] * DAY;
    } else {
      r.box = 0;
      r.misses += 1;
      r.due = now;
    }
    r.last = now;
    return r;
  }

  // due words first (weakest box first), then unseen, then the rest; random within groups
  function pickWords(pool, progress, n, now) {
    const scored = pool.map((w) => {
      const p = progress[w.id];
      let pri, sub = 0;
      if (!p) pri = 1;
      else if (p.due <= now) { pri = 0; sub = p.box; }
      else { pri = 2; sub = p.box; }
      return { w, pri, sub, r: Math.random() };
    });
    scored.sort((a, b) => a.pri - b.pri || a.sub - b.sub || a.r - b.r);
    return scored.slice(0, n).map((s) => s.w);
  }

  function isMistake(p) {
    return !!p && p.misses > 0 && p.box <= 2;
  }

  function stats(words, progress, now) {
    const out = {};
    for (const l of LEVELS) out[l] = { total: 0, seen: 0, learned: 0, due: 0 };
    for (const w of words) {
      const s = out[w.level];
      const p = progress[w.id];
      s.total++;
      if (p) {
        s.seen++;
        if (p.box >= 4) s.learned++;
        if (p.due <= now) s.due++;
      }
    }
    return out;
  }

  root.Core = { LEVELS, KIND_LABELS, prepare, shuffle, norm, fold, gapMatch, kindsFor,
                makeQuestion, checkTyped, review, pickWords, isMistake, stats, DAY };
})(typeof globalThis !== 'undefined' ? globalThis : this);
