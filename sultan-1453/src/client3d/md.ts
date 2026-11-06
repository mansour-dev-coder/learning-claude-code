// Tiny markdown for the chronicle: headings, bold, italic, strike, lists. Escapes everything else.
export function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }
function inline(s: string) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
}
export function md(src: string) {
  const out: string[] = [];
  let list = false;
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('```') || !line.trim()) continue;
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}

