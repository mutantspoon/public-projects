# Reading Style Preview

A short document for testing the new **Page View** and **Reading Accent** modes. Open this in Quill, then toggle the two new buttons in the top-right of the toolbar (next to Comments).

## What you're looking at

Page View constrains the document to a fixed letter-paper width — about 70 characters per line — and floats the page on a subtle canvas with a drop shadow. This is *not* the same as turning word wrap off. The line length stays comfortable no matter how wide your window is.

Reading Accent layers a refined emerald-green over the existing theme. Headings, the first letter of each paragraph, bold spans, inline `code`, links, list markers, and blockquote rails all pick up the accent. The goal is a visual rhythm that helps your eye find anchor points in long-form prose without turning the page into a christmas tree.

## Heading 2 — checking the green

These are the three accent surfaces to evaluate together:

1. The **bold weight** here should read as a confident green, not a fluorescent one.
2. Inline `code spans` should feel like a tinted chip, not a yellow sticker.
3. Links like [this one](https://example.com) should look clickable but quiet.

### Heading 3 — small caps territory

This is where sub-sections live. The hierarchy should still feel clear after the accent is applied — h1 dominant, h2 strong, h3 supporting.

## A long paragraph for line-length feel

The quick brown fox jumps over the lazy dog. Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump! Bright vixens jump; dozy fowl quack. The five boxing wizards jump quickly. We promptly judged antique ivory buckles for the next prize. A wizard's job is to vex chumps quickly in fog. Watch "Jeopardy!", Alex Trebek's fun TV quiz game. By Jove, my quick study of lexicography won a prize.

## Lists

Bulleted:

- Refined emerald accent (`#0E9F6E` in light, mint `#5EEAD4` in dark)
- Drop-cap-style first letter — subtle, not a magazine pull
- First-letter accent uses CSS `::first-letter`, so editing remains live

Numbered:

1. Toggle **Page View** first to set the canvas
2. Toggle **Reading Accent** on top of it
3. Try each independently to see the layering

Task list:

- [x] Page width clamped at ~760px
- [x] Subtle drop shadow on the page
- [ ] Decide whether the first-letter cap is too much

## Blockquote

> The best interfaces disappear. You shouldn't notice the rail next to this quote on your first read — but you should feel it. The accent should land just on the side of "tasteful," never on the side of "themed."

## Code block

```javascript
function applyReadingAccent(editor) {
    editor.classList.toggle('read-accent');
    localStorage.setItem('quill.readAccent', '1');
}
```

## Table

| Mode | Persists | Independent | Notes |
|------|----------|-------------|-------|
| Page View | yes (localStorage) | yes | sets a canvas + drop shadow |
| Reading Accent | yes (localStorage) | yes | works in light + dark themes |
| Word Wrap | yes (settings.json) | yes | unchanged — orthogonal to the above |

---

## Things to evaluate

- Is the green too saturated in light mode? Too pale in dark mode?
- Does the first-letter accent on every paragraph become noisy in a long doc?
- Is the page width about right, or should it be narrower (eg. 680px) for better line length?
- Does the drop shadow read as "paper on a desk," or as "card stuck to the screen"?
