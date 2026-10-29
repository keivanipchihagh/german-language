#!/usr/bin/env python3
"""Build data/vocabulary.csv and data/vocabulary.js from the lesson notes in levels/A1.1 ... levels/A2.2.

Run from anywhere:  python3 scripts/build_vocab.py
"""
import csv, glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS_DIR = os.path.normpath(os.path.join(HERE, '..', 'levels'))
LEVELS = ['A1.1', 'A1.2', 'A2.1', 'A2.2']
COLS = ['level', 'lesson', 'type', 'article', 'word', 'plural', 'perfect',
        'separable', 'meaning', 'example', 'notes']
HINT = re.compile(r'^(er|sie|es|du|ich)\b|pl\.|Sg\.|Swiss|informal|formal|not separable|\+ ?(acc|dat)|^(der|die|das) |^[A-ZÄÖÜ][A-Za-zÄÖÜ.]{0,5}$')


def clean(s):
    s = s.replace('🔹', '')
    s = re.sub(r'[*`]+', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def split_row(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def parse_plural(cell):
    c = clean(cell)
    if not c or c in ('–', '-') or 'singular only' in c or 'plural only' in c:
        return ''
    c = re.sub(r'\(.*?\)', '', c).split(' / ')[0].strip()
    return re.sub(r'^die\s+', '', c)


def parse_word(cell, split=True):
    """-> (article, word, notes, separable)"""
    separable = '🔹' in cell or '·' in cell
    raw = cell.replace('🔹', '').replace('·', '')
    parts = [p.strip() for p in re.split(r'\s/\s', raw)] if split else [raw.strip()]
    first = clean(parts[0])
    notes = clean(' / '.join(parts[1:])) if len(parts) > 1 else ''
    article, word = '', first
    m = re.match(r'^(der|die|das)\s+(.*)$', first)   # '(das) Italien' = optional article -> none
    if m:
        article, word = m.group(1), m.group(2)
    elif re.match(r'^\((der|die|das)\)\s+', first):
        word = re.sub(r'^\((der|die|das)\)\s+', '', first)

    def hint(mm):
        nonlocal notes
        if HINT.search(mm.group(1)):
            notes = (notes + '; ' if notes else '') + mm.group(1)
            return ''
        return mm.group(0)

    word = re.sub(r'\s*\(([^)]*)\)', hint, word).strip()
    return article, word, notes, separable


def col(header, *names):
    for n in names:
        for k, h in enumerate(header):
            if h == n or h.startswith(n):
                return k
    return None


def handle_table(header, body, lvl, lesson, rows, seen):
    h0 = header[0]
    if h0.startswith(('0%', '100%', 'wohin?')):
        return
    c_en = col(header, 'english', 'meaning')
    c_ex = col(header, 'example')
    c_pl = col(header, 'plural')
    c_pf = col(header, 'perfect', 'participle')
    c_opp = col(header, 'opposite')
    if h0 == 'month':
        c_en = 1
    if h0 == 'male':
        c_en, c_pl = 3, 2
    if c_en is None:
        return
    if h0 in ('verb', 'other verbs', 'activity'):
        typ = 'verb'
    elif h0 == 'adjective':
        typ = 'adjective'
    elif h0 in ('phrase', 'german', 'word / phrase', 'sign'):
        typ = 'phrase'
    else:
        typ = None
    for r in body:
        if len(r) <= c_en or not r[0]:
            continue
        cells = [r[0], r[1]] if h0 == 'male' else [r[0]]
        for cell in cells:
            article, word, notes, sep = parse_word(cell, split=(typ != 'phrase'))
            meaning = clean(r[c_en])
            if not word or not meaning:
                continue
            ex = clean(r[c_ex]) if c_ex is not None and c_ex < len(r) else ''
            plural = parse_plural(r[c_pl]) if c_pl is not None and c_pl < len(r) else ''
            perfect = clean(r[c_pf]) if c_pf is not None and c_pf < len(r) else ''
            if c_opp is not None and c_opp < len(r) and clean(r[c_opp]):
                notes = 'opposite: ' + clean(r[c_opp]) + ('; ' + notes if notes else '')
            t = typ or ('noun' if article else 'other')
            if typ is None and not article:
                t = {'colour': 'adjective', 'day': 'noun', 'country': 'noun', 'language': 'noun',
                     'month': 'noun', 'part of day': 'noun'}.get(h0, t)
            if t == 'other':
                if meaning.startswith('to '):
                    t = 'verb'
                elif word.endswith('?'):
                    t = 'question word'
                elif ' ' in word or word.endswith('!'):
                    t = 'phrase'
            key = (article, word.lower(), t)
            if key in seen:
                continue
            seen[key] = True
            rows.append(dict(level=lvl, lesson=lesson, type=t, article=article, word=word,
                             plural=plural, perfect=perfect,
                             separable='yes' if (sep and t == 'verb') else '',
                             meaning=meaning, example=ex, notes=notes))


def main():
    rows, seen = [], {}
    for lvl in LEVELS:
        for f in sorted(glob.glob(os.path.join(LEVELS_DIR, lvl, 'Lektion-*.md'))):
            lesson = int(re.search(r'Lektion-(\d+)', f).group(1))
            text = open(f, encoding='utf-8').read()
            m = re.search(r'## 1\. Vocabulary(.*?)\n## 2\.', text, re.S)
            if not m:
                print('no vocab in', f, file=sys.stderr)
                continue
            lines = m.group(1).split('\n')
            i = 0
            while i < len(lines) - 1:
                if lines[i].startswith('|') and lines[i + 1].startswith('|---'):
                    header = [clean(h).lower() for h in split_row(lines[i])]
                    j, body = i + 2, []
                    while j < len(lines) and lines[j].startswith('|'):
                        body.append(split_row(lines[j]))
                        j += 1
                    i = j
                    handle_table(header, body, lvl, lesson, rows, seen)
                else:
                    i += 1
    out = os.path.join(HERE, '..', 'data', 'vocabulary.csv')
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    # same data as a script, so the site also works when opened from disk (no fetch needed)
    js = os.path.join(HERE, '..', 'data', 'vocabulary.js')
    with open(js, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by scripts/build_vocab.py - do not edit.\nwindow.VOCAB = ')
        json.dump(rows, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    print(len(rows), 'rows ->', os.path.normpath(out), 'and vocabulary.js')


if __name__ == '__main__':
    main()
