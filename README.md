# German Word Quiz

A small, static web app for learning German vocabulary from A1.1 to A2.2. It has no build step, no backend and no dependencies. Progress is saved in the browser (`localStorage`).

## Practice modes

- **Mixed practice:** a varied mix of question types, chosen per word
- **German to English** and **English to German:** multiple choice
- **Articles:** choose der / die / das
- **Plurals:** type the plural of a noun
- **Perfect tense:** type the perfect form of a verb (`hat gearbeitet`, `ist gefahren`)
- **Fill the gap:** complete an example sentence
- **Flashcards:** flip a card and rate how well you knew it
- **Review my mistakes:** words you missed and have not mastered yet

Learning features: wrong answers are asked again at the end of the session, every answer shows the full word details (article, plural, perfect, example, level and lesson), and a simple spaced-repetition scheme (Leitner boxes) decides which words come up next. There is no timer and no streak counter. There are also a searchable **Vocabulary** browser and a **Progress** page with export, import and reset.

## Run locally

Open `index.html` in a browser. The vocabulary is loaded as a script (`data/vocabulary.js`), so it also works when opened straight from disk.

## Publish on GitHub Pages

1. Push this folder as a repository.
2. In the repository, go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, select your main branch and the `/ (root)` folder, then save.
4. The site appears at `https://<user>.github.io/<repository>/`.

## Project layout

```
index.html            page shell
style.css             styles (light and dark mode)
core.js               quiz logic (question building, answer checking, scheduling), no DOM
app.js                user interface
data/vocabulary.csv   vocabulary (level, lesson, type, article, word, plural, perfect, separable, meaning, example, notes)
data/vocabulary.js    the same data as a script (generated)
scripts/build_vocab.py  rebuilds both data files from the lesson notes
levels/               study notes per level: A1.1, A1.2, A2.1, A2.2 (Lektion-NN.md); B1.x are placeholders
```

## Updating the vocabulary

The CSV and JS data files are generated from the vocabulary tables of the lesson notes in `levels/` (`A1.1`, `A1.2`, `A2.1`, `A2.2`):

```
python3 scripts/build_vocab.py
```

Commit the regenerated `data/` files: the site reads only those, never the lesson notes.
