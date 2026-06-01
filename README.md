# Holdings — Private & Pre-IPO Tracker

A simple, single-page web app for tracking private, pre-IPO, and public company
shares that mainstream portfolio apps can't handle. There are no live prices —
you enter every value manually.

## What it does

For each holding you record:

- Company name
- Type (Private / Pre-IPO / Public)
- Number of shares
- Cost per share
- Date acquired
- Last known valuation per share (e.g. from the most recent funding round)

The app then shows, per holding and across the whole portfolio:

- **Total cost** (shares × cost per share)
- **Current value** (shares × last known valuation)
- **Gain / loss** in both dollars and percent

You can add, edit, and delete holdings. All data is saved in your browser's
`localStorage`, so it persists across page reloads — nothing is sent anywhere.

## Running it

No build step or server required. Just open `index.html` in any modern browser:

```
open index.html
```

(Or double-click the file.)

## Files

- `index.html` — markup and layout
- `styles.css` — clean, calm visual styling
- `app.js` — state, calculations, and persistence (localStorage)
