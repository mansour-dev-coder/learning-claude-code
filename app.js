const QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "Programs must be written for people to read, and only incidentally for machines to execute.", author: "Harold Abelson" },
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
];

const quoteTextEl = document.getElementById("quote-text");
const quoteAuthorEl = document.getElementById("quote-author");
const copyStatusEl = document.getElementById("copy-status");
const newQuoteBtn = document.getElementById("new-quote");
const copyBtn = document.getElementById("copy-quote");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = themeToggle.querySelector(".theme-toggle__icon");

let currentQuote = null;
let statusTimer = null;

function showNewQuote() {
  let next;
  do {
    next = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  } while (QUOTES.length > 1 && next === currentQuote);

  currentQuote = next;
  quoteTextEl.textContent = `“${next.text}”`;
  quoteAuthorEl.textContent = next.author;
  setStatus("");
}

function setStatus(message) {
  copyStatusEl.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  if (message) {
    statusTimer = setTimeout(() => {
      copyStatusEl.textContent = "";
    }, 2500);
  }
}

async function copyCurrentQuote() {
  if (!currentQuote) return;
  const text = `“${currentQuote.text}” — ${currentQuote.author}`;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure contexts (e.g. file://)
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setStatus("Copied to clipboard!");
  } catch (err) {
    setStatus("Could not copy. Please try again.");
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  );
  try {
    localStorage.setItem("theme", theme);
  } catch (_) {
    /* ignore storage errors */
  }
}

function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem("theme");
  } catch (_) {
    /* ignore */
  }
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
}

newQuoteBtn.addEventListener("click", showNewQuote);
copyBtn.addEventListener("click", copyCurrentQuote);
themeToggle.addEventListener("click", toggleTheme);

initTheme();
showNewQuote();
