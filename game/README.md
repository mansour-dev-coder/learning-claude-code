# Orbit Academy 🚀

A gamified, space-themed learning game about the rocket industry with real-time
3D visuals (WebGL / three.js). Progress through five missions — each with three
lessons and a five-question quiz — earning XP, ranks and badges. Score **80% or
higher** to unlock the next mission.

## Game systems

- **XP & ranks** — correct answers and mission clears earn XP; climb from
  Cadet to Flight Director. Progress shows live in the header HUD.
- **Badges & stars** — one badge per mission, plus 1-3 star ratings per quiz.
- **3D space scene** — a real-time Earth with atmosphere glow, star field and
  orbiting satellites rendered behind the whole game (with pointer parallax).
- **3D launch sequence** — Mission 2 features a WebGL launch: particle exhaust,
  camera shake at Max-Q, stage separation and orbit deploy.
- **Sound effects** — synthesised WebAudio feedback (mutable, persisted).
- Devices without WebGL automatically fall back to the 2D SVG/CSS versions.

## What you'll learn

1. **How Rockets Work** — oxidiser vs. fuel, propellant, thrust (Newton's Third
   Law), and the anatomy of a rocket.
2. **Getting to Orbit** — what "orbit" really means, the launch sequence,
   delta-v, and why staging is essential.
3. **Types of Orbit** — LEO, MEO, SSO, GEO, and why Andøya, Norway is ideal for
   sun-synchronous launches.
4. **Isar Aerospace & Spectrum** — the company, the rocket's specs, vertical
   integration, and its real flight history.
5. **The Business of Rockets** — the small-sat market, what customers value,
   insurance economics, competitors, and the industry's "valley of death."

Every technical term is introduced with an everyday analogy *before* the formal
definition.

## Running it

No build step, no server, no install. React is **vendored locally** (in
`vendor/`) and the app is pre-compiled to plain JavaScript, so it runs anywhere
with a browser — no CDN, no internet dependency, no in-browser transpiling.
Works on **iPhone, iPad, and desktop alike**.

- **Desktop:** double-click `index.html`, or open it in any modern browser.
- **iPhone / iPad:** host the folder somewhere (e.g. GitHub Pages) and open the
  link in Safari. You can then tap **Share → Add to Home Screen** to launch it
  like a native app.

Progress is saved in your browser's `localStorage`, so unlocked modules and your
best quiz scores persist across visits on that device.

## Files

- `index.html` — markup, styling, and script loading.
- `app.js` — the compiled game (built from `src/app.jsx`).
- `src/app.jsx` — the source. Edit this, then run `node build.mjs`.
- `build.mjs` — compiles the JSX source to plain JS (needs `typescript`).
- `vendor/` — React, ReactDOM and three.js, served locally (no CDN).
