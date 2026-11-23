// solve.js — a fast, dependency-free reimplementation of the makefun-site 1.0.0
// static-site build, written from the competition kit's README spec.
// Exports run(input), which returns one generated site's output tree:
// a JSON object of every output path and that file's text, byte for byte.

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_TEST = /[&<>"']/;
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FM_KEYS = new Set(['title', 'summary', 'date', 'tags', 'draft', 'layout', 'slug']);

function esc(s) {
  // Most strings hold nothing to escape; skip the replace when the test
  // finds none of the five characters.
  return ESC_TEST.test(s) ? s.replace(/[&<>"']/g, (c) => ESC_MAP[c]) : s;
}

function escChar(c) {
  return ESC_MAP[c] || c;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const slugCache = new Map();
function slugOf(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  let s = text.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  if (s.length > 64) {
    s = s.slice(0, 64);
    if (s.endsWith('-')) s = s.slice(0, -1);
  }
  const out = s || 'untitled';
  slugCache.set(text, out);
  return out;
}

function dateLong(dateStr) {
  if (!dateStr) return '';
  const y = +dateStr.slice(0, 4);
  const m = +dateStr.slice(5, 7);
  const d = +dateStr.slice(8, 10);
  return d + ' ' + MONTHS[m - 1] + ' ' + y;
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

// ---------- front matter ----------

function validDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (y < 1970 || y > 2099 || mo < 1 || mo > 12) return false;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d >= 1 && d <= dim;
}

function parseFmString(value) {
  if (value[0] === '"') {
    let out = '';
    for (let i = 1; i < value.length; i++) {
      const c = value[i];
      if (c === '\\') {
        const nx = value[i + 1];
        if (nx === '"' || nx === '\\') {
          out += nx;
          i++;
        } else {
          return { error: 'a quoted string is not closed' };
        }
      } else if (c === '"') {
        if (i === value.length - 1) return { value: out };
        return { error: 'a quoted string is not closed' };
      } else {
        out += c;
      }
    }
    return { error: 'a quoted string is not closed' };
  }
  if (value[0] === '[') return { error: 'a bare string opens on [' };
  return { value };
}

function parseFmTags(value) {
  if (!value.startsWith('[') || !value.endsWith(']')) return { error: 'not a list [a, b]' };
  const inner = value.slice(1, -1);
  if (inner === '') return { value: [] };
  const tags = [];
  for (const part of inner.split(',')) {
    const name = part.replace(/^[ \t]+|[ \t]+$/g, '');
    if (name === '' || name.includes('"') || name.includes('[') || name.includes(']')) {
      return { error: 'an empty tag, or one holding " [ or ]' };
    }
    tags.push(name);
  }
  return { value: tags };
}

function parseFrontMatter(content) {
  const lines = content.split('\n');
  if (lines.length === 0 || lines[0] !== '---') return { ok: false, reason: 'no front matter' };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) return { ok: false, reason: 'the front matter is not closed' };
  const meta = {};
  const seen = new Set();
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    const n = i + 1;
    if (/^[ \t]*$/.test(line)) continue;
    if (line.startsWith('#')) continue;
    const ci = line.indexOf(':');
    if (ci === -1) return { ok: false, reason: 'line ' + n + ' is not "key: value"' };
    const key = line.slice(0, ci);
    if (!/^[a-z_]+$/.test(key)) return { ok: false, reason: 'line ' + n + ' is not "key: value"' };
    // One space after the colon, if there is one, belongs to the separator;
    // a bare `key:` is a key with no value, not a malformed line.
    let value = line.slice(ci + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    value = value.replace(/[ \t]+$/, '');
    if (!FM_KEYS.has(key)) return { ok: false, reason: 'unknown key "' + key + '"' };
    if (seen.has(key)) return { ok: false, reason: 'key "' + key + '" is given twice' };
    seen.add(key);
    if (value === '') return { ok: false, reason: 'key "' + key + '" has no value' };
    if (key === 'title' || key === 'summary') {
      const r = parseFmString(value);
      if (r.error) return { ok: false, reason: 'key "' + key + '": ' + r.error };
      meta[key] = r.value;
    } else if (key === 'date') {
      if (!validDate(value)) {
        return { ok: false, reason: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      }
      meta.date = value;
    } else if (key === 'tags') {
      const r = parseFmTags(value);
      if (r.error) return { ok: false, reason: 'key "tags": ' + r.error };
      meta.tags = r.value;
    } else if (key === 'draft') {
      if (value !== 'true' && value !== 'false') return { ok: false, reason: 'key "draft": true or false' };
      meta.draft = value === 'true';
    } else if (key === 'layout') {
      if (!/^[a-z0-9-]+$/.test(value)) return { ok: false, reason: 'key "layout": not a template name' };
      meta.layout = value;
    } else if (key === 'slug') {
      if (value.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
        return { ok: false, reason: 'key "slug": not a slug' };
      }
      meta.slug = value;
    }
  }
  if (meta.title === undefined) return { ok: false, reason: 'no title' };
  return { ok: true, meta, body: lines.slice(close + 1).join('\n') };
}

// ---------- links ----------

function resolvePath(dir, path) {
  const stack = dir === '' ? [] : dir.split('/');
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join('/');
}

function resolveHref(target, ctx) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('/') || target.startsWith('#')) {
    return target;
  }
  let path = target;
  let frag = '';
  const hi = target.indexOf('#');
  if (hi !== -1) {
    path = target.slice(0, hi);
    frag = target.slice(hi);
  }
  const resolved = resolvePath(ctx.sourceDir, path);
  const pageUrl = ctx.pageBySource.get(resolved);
  if (pageUrl !== undefined) return pageUrl + frag;
  if (ctx.staticSet.has(resolved)) return ctx.base + '/' + resolved + frag;
  const line = 'broken-link ' + ctx.sourcePath + ' -> ' + target;
  if (!ctx.brokenSeen.has(line)) {
    ctx.brokenSeen.add(line);
    ctx.reports.push(line);
  }
  return target;
}

// ---------- inline markdown ----------

function isEscaped(text, pos) {
  // A character is escaped when an odd run of backslashes stands right before it.
  let n = 0;
  for (let k = pos - 1; k >= 0 && text[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

function starsBefore(text, j) {
  // Consecutive unescaped stars ending just before j. A star run pairs up
  // from its left, so a * with an even count before it is a lone star (the
  // leftover of an odd run), while an odd count makes it the second star of
  // a ** pair. An escaped star breaks the run.
  let n = 0;
  for (let k = j - 1; k >= 0 && text[k] === '*' && !isEscaped(text, k); k--) n++;
  return n;
}

// Trim spaces and tabs at both ends, without a regular expression: the
// lines this runs on are usually already trimmed, so it is a couple of
// character tests.
function trimST(s) {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === ' ' || s[a] === '\t')) a++;
  while (b > a && (s[b - 1] === ' ' || s[b - 1] === '\t')) b--;
  return s.slice(a, b);
}

function tryLink(text, i, ctx) {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\' && j + 1 < text.length && text[j + 1] === ']') {
      j += 2;
      continue;
    }
    if (text[j] === ']') break;
    j++;
  }
  if (j >= text.length || text[j] !== ']' || text[j + 1] !== '(') return null;
  let k = j + 2;
  while (k < text.length && text[k] !== ')') k++;
  if (k >= text.length) return null;
  const target = text.slice(j + 2, k);
  if (target === '' || /\s/.test(target)) return null;
  const href = resolveHref(target, ctx);
  return { html: '<a href="' + esc(href) + '">' + inline(text.slice(i + 1, j), ctx) + '</a>', next: k + 1 };
}

const SPECIAL_RE = /[\\`*[]/g;

function inline(text, ctx) {
  const parts = [];
  let pending = '';
  let i = 0;
  const n = text.length;
  const flush = () => {
    if (pending !== '') {
      parts.push(esc(pending));
      pending = '';
    }
  };
  while (i < n) {
    // Plain runs have no markup in them; find the next character that could
    // start some, in one scan, instead of testing every character.
    SPECIAL_RE.lastIndex = i;
    const m = SPECIAL_RE.exec(text);
    const next = m ? m.index : n;
    if (next > i) {
      pending += text.slice(i, next);
      i = next;
      if (i >= n) break;
    }
    const c = text[i];
    if (c === '\\' && i + 1 < n && ESCAPABLE.has(text[i + 1])) {
      flush();
      parts.push(escChar(text[i + 1]));
      i += 2;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n && text[j] !== '`') j++;
      if (j < n && j > i + 1) {
        flush();
        parts.push('<code>' + esc(text.slice(i + 1, j)) + '</code>');
        i = j + 1;
        continue;
      }
      pending += '`';
      i++;
      continue;
    }
    if (c === '*' && text[i + 1] === '*') {
      // A ** opens strong only when it is not itself followed by another **:
      // ****desert**** is a literal **, a strong desert, then a literal **,
      // while ***an *were* token*** opens at the first **.
      if (text[i + 2] === '*' && text[i + 3] === '*') {
        pending += '**';
        i += 2;
        continue;
      }
      let j = i + 3;
      let found = -1;
      while (j + 1 < n) {
        if (text[j] === '*' && text[j + 1] === '*' && !isEscaped(text, j)) {
          found = j;
          break;
        }
        j++;
      }
      if (found !== -1) {
        flush();
        parts.push('<strong>' + inline(text.slice(i + 2, found), ctx) + '</strong>');
        i = found + 2;
        continue;
      }
      pending += '**';
      i += 2;
      continue;
    }
    if (c === '*') {
      // A single * opens emphasis, closed by the next * that can close: not
      // itself escaped, the last star of its run, and a lone star — the count
      // of unescaped stars right before it is even. A run of stars pairs up
      // from its left, so the second star of a ** pair never closes, while
      // the leftover star of an odd run does: *quick*** closes on its third
      // star, but the second star of **front, of ** after valley, and of
      // **render** close nothing.
      let j = i + 1;
      let found = -1;
      while (j < n) {
        if (
          text[j] === '*' &&
          !isEscaped(text, j) &&
          (j + 1 >= n || text[j + 1] !== '*') &&
          j > i + 1 &&
          starsBefore(text, j) % 2 === 0
        ) {
          found = j;
          break;
        }
        j++;
      }
      if (found !== -1) {
        flush();
        parts.push('<em>' + inline(text.slice(i + 1, found), ctx) + '</em>');
        i = found + 1;
        continue;
      }
      pending += '*';
      i++;
      continue;
    }
    if (c === '[') {
      const r = tryLink(text, i, ctx);
      if (r) {
        flush();
        parts.push(r.html);
        i = r.next;
        continue;
      }
      pending += '[';
      i++;
      continue;
    }
    pending += c;
    i++;
  }
  flush();
  return parts.join('');
}

// ---------- block markdown ----------

function isFenceStart(line) {
  const m = /^```([A-Za-z0-9_+]*)([ \t]*)$/.exec(line);
  return m ? m[1] : null;
}

function isFenceEnd(line) {
  return /^```[ \t]*$/.test(line);
}

function headingOf(line) {
  const m = /^(#{1,6})[ \t]+(.*)$/.exec(line);
  if (!m) return null;
  const text = m[2].replace(/[ \t]+$/, '');
  if (text === '') return null;
  return { level: m[1].length, text };
}

function isBreak(line) {
  return /^(---|\*\*\*)[ \t]*$/.test(line);
}

function isBlank(line) {
  return /^[ \t]*$/.test(line);
}

// Whether a line ends a paragraph: a blank line, a fence, a heading or a
// thematic break. List and blockquote lines do not end one. The first
// character decides which test, if any, is needed.
function endsParagraph(line) {
  if (line === '') return true;
  const c0 = line[0];
  if (c0 === ' ' || c0 === '\t') return isBlank(line);
  if (c0 === '`') return isFenceStart(line) !== null;
  if (c0 === '#') return headingOf(line) !== null;
  if (c0 === '-' || c0 === '*') return isBreak(line);
  return false;
}

const WORD_RE = /\S+/g;
function countWords(s) {
  // Count runs of non-whitespace with the regex engine instead of a
  // per-character loop; the pattern is reset on every call.
  WORD_RE.lastIndex = 0;
  let n = 0;
  while (WORD_RE.exec(s) !== null) n++;
  return n;
}

function renderBody(body, ctx) {
  const lines = body.split('\n');
  const out = [];
  let excerpt = '';
  const toc = [];
  const headingIds = new Set();
  const uniqueId = (slug) => {
    if (!headingIds.has(slug)) {
      headingIds.add(slug);
      return slug;
    }
    let k = 2;
    while (headingIds.has(slug + '-' + k)) k++;
    const id = slug + '-' + k;
    headingIds.add(id);
    return id;
  };
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (line === '') {
      i++;
      continue;
    }
    const c0 = line[0];
    if (c0 === ' ' || c0 === '\t') {
      if (isBlank(line)) {
        i++;
        continue;
      }
      // An indented line starts no block; it is paragraph text.
    } else if (c0 === '`') {
      const lang = isFenceStart(line);
      if (lang !== null) {
        let j = i + 1;
        let code = '';
        while (j < n && !isFenceEnd(lines[j])) {
          code += esc(lines[j]) + '\n';
          j++;
        }
        out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code + '</code></pre>');
        i = j < n ? j + 1 : n;
        continue;
      }
    } else if (c0 === '#') {
      const hd = headingOf(line);
      if (hd) {
        const id = uniqueId(slugOf(hd.text));
        const html = inline(hd.text, ctx);
        out.push('<h' + hd.level + ' id="' + id + '">' + html + '</h' + hd.level + '>');
        if (hd.level === 2 || hd.level === 3) toc.push({ level: hd.level, id, html });
        i++;
        continue;
      }
    } else if (c0 === '-' || c0 === '*') {
      if (isBreak(line)) {
        out.push('<hr>');
        i++;
        continue;
      }
    } else if (c0 === '>') {
      const kept = [];
      let j = i;
      while (j < n && lines[j][0] === '>') {
        let t = lines[j].startsWith('> ') ? lines[j].slice(2) : lines[j].slice(1);
        t = trimST(t);
        if (t !== '') kept.push(t);
        j++;
      }
      if (kept.length > 0) {
        out.push('<blockquote>\n<p>' + inline(kept.join('\n'), ctx) + '</p>\n</blockquote>');
      } else {
        out.push('<blockquote>\n</blockquote>');
      }
      i = j;
      continue;
    }
    const lm = /^(- |\* |\d+\. )/.exec(line);
    if (lm) {
      const ordered = /^\d+\. /.test(line);
      const firstNum = ordered ? parseInt(line, 10) : 0;
      const items = [];
      let item = line.slice(lm[0].length);
      let j = i + 1;
      while (j < n) {
        const lj = lines[j];
        const jm = /^(- |\* |\d+\. )/.exec(lj);
        const sameKind = jm && (ordered ? /^\d+\. /.test(lj) : /^(- |\* )/.test(lj));
        if (sameKind) {
          items.push(item);
          item = lj.slice(jm[0].length);
          j++;
          continue;
        }
        if (/^  +\S/.test(lj)) {
          item += '\n' + trimST(lj);
          j++;
          continue;
        }
        break;
      }
      items.push(item);
      const lis = items.map((t) => '<li>' + inline(t, ctx) + '</li>').join('\n');
      if (ordered) {
        out.push(firstNum !== 1 ? '<ol start="' + firstNum + '">\n' + lis + '\n</ol>' : '<ol>\n' + lis + '\n</ol>');
      } else {
        out.push('<ul>\n' + lis + '\n</ul>');
      }
      i = j;
      continue;
    }
    // paragraph: lines up to a blank line, a fence, a heading or a thematic break
    const parts = [trimST(line)];
    let j = i + 1;
    while (j < n && !endsParagraph(lines[j])) {
      parts.push(trimST(lines[j]));
      j++;
    }
    const inner = inline(parts.join('\n'), ctx);
    out.push('<p>' + inner + '</p>');
    if (excerpt === '') excerpt = inner;
    i = j;
  }
  return { html: out.map((b) => b + '\n').join(''), excerpt, toc };
}

// ---------- templates ----------

function parsePath(inner) {
  const s = inner.trim();
  if (s === '') return null;
  const names = s.split('.');
  for (const name of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  }
  return names;
}

function parseTemplateBody(s) {
  let pos = 0;
  const n = s.length;
  function parseSeq(stops) {
    const nodes = [];
    let term = null;
    while (pos < n) {
      const nextVar = s.indexOf('{{', pos);
      const nextTag = s.indexOf('{%', pos);
      let next = -1;
      let isTag = false;
      if (nextVar === -1) {
        next = nextTag;
        isTag = true;
      } else if (nextTag === -1) {
        next = nextVar;
        isTag = false;
      } else if (nextTag < nextVar) {
        next = nextTag;
        isTag = true;
      } else {
        next = nextVar;
        isTag = false;
      }
      if (next === -1) {
        nodes.push({ t: 'text', s: s.slice(pos) });
        pos = n;
        break;
      }
      if (next > pos) nodes.push({ t: 'text', s: s.slice(pos, next) });
      if (!isTag) {
        if (s.startsWith('{{{', next)) {
          const end = s.indexOf('}}}', next + 3);
          if (end === -1) return { error: '{{{ is not closed' };
          const path = parsePath(s.slice(next + 3, end));
          if (!path) return { error: 'not a path' };
          nodes.push({ t: 'var', raw: true, path });
          pos = end + 3;
        } else {
          const end = s.indexOf('}}', next + 2);
          if (end === -1) return { error: '{{ is not closed' };
          const path = parsePath(s.slice(next + 2, end));
          if (!path) return { error: 'not a path' };
          nodes.push({ t: 'var', raw: false, path });
          pos = end + 2;
        }
      } else {
        const end = s.indexOf('%}', next + 2);
        if (end === -1) return { error: '{% is not closed' };
        const inner = s.slice(next + 2, end).trim();
        pos = end + 2;
        if (inner === 'endfor' || inner === 'endif' || inner === 'else') {
          if (stops && stops.has(inner)) {
            term = inner;
            return { nodes, term };
          }
          if (inner === 'endfor') return { error: 'endfor without for' };
          if (inner === 'endif') return { error: 'endif without if' };
          return { error: 'else without if' };
        }
        const forM = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/.exec(inner);
        if (forM) {
          const path = parsePath(forM[2]);
          if (!path) return { error: 'not a path' };
          const body = parseSeq(new Set(['endfor']));
          if (body.error) return body;
          if (body.term !== 'endfor') return { error: 'for is not closed' };
          nodes.push({ t: 'for', name: forM[1], path, body: body.nodes });
          continue;
        }
        const ifM = /^if\s+(not\s+)?(.+)$/.exec(inner);
        if (ifM) {
          const path = parsePath(ifM[2]);
          if (!path) return { error: 'not a path' };
          const then = parseSeq(new Set(['else', 'endif']));
          if (then.error) return then;
          let otherwise = null;
          if (then.term === 'else') {
            const els = parseSeq(new Set(['endif']));
            if (els.error) return els;
            if (els.term !== 'endif') return { error: 'if is not closed' };
            otherwise = els.nodes;
          } else if (then.term !== 'endif') {
            return { error: 'if is not closed' };
          }
          nodes.push({ t: 'if', not: !!ifM[1], path, then: then.nodes, otherwise });
          continue;
        }
        const incM = /^include\s+"([^"]*)"$/.exec(inner);
        if (incM) {
          nodes.push({ t: 'include', name: incM[1] });
          continue;
        }
        return { error: 'unknown tag' };
      }
    }
    return { nodes, term };
  }
  const r = parseSeq(null);
  if (r.error) return r;
  return { nodes: r.nodes };
}

function parseTemplate(source) {
  // A {% %} tag alone on its line (only spaces or tabs beside it) takes the
  // whole line with it, its newline included. Remove those lines' wrapping
  // whitespace first; the tag itself stays.
  const tagRe = /\{%[\s\S]*?%\}/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = tagRe.exec(source)) !== null) {
    const tagStart = m.index;
    const tagEnd = tagStart + m[0].length;
    const lineStart = source.lastIndexOf('\n', tagStart - 1) + 1;
    const before = source.slice(lineStart, tagStart);
    const afterFull = source.slice(tagEnd);
    const nl = afterFull.indexOf('\n');
    const after = nl === -1 ? afterFull : afterFull.slice(0, nl);
    if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) {
      out += source.slice(last, lineStart);
      out += m[0];
      last = nl === -1 ? source.length : tagEnd + nl + 1;
      tagRe.lastIndex = last;
    }
  }
  out += source.slice(last);
  return parseTemplateBody(out);
}

function lookup(path, frames) {
  const first = path[0];
  let v;
  let found = false;
  for (let i = frames.length - 1; i >= 0; i--) {
    const fr = frames[i];
    if (first === 'loop' && fr.loop !== undefined) {
      v = fr.loop;
      found = true;
      break;
    }
    if (fr.var !== undefined && first === fr.var) {
      v = fr.value;
      found = true;
      break;
    }
  }
  if (!found) {
    const root = frames[0];
    if (root && Object.prototype.hasOwnProperty.call(root, first)) {
      v = root[first];
      found = true;
    }
  }
  if (!found) return undefined;
  for (let i = 1; i < path.length; i++) {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'object' || typeof v === 'function') {
      if (Object.prototype.hasOwnProperty.call(v, path[i])) v = v[path[i]];
      else return undefined;
    } else {
      return undefined;
    }
  }
  return v;
}

function writeValue(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(writeValue).join(', ');
  return '';
}

function isTruthy(v) {
  if (v === undefined || v === null || v === false || v === '' || v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function renderNodes(nodes, frames, depth, tplMap) {
  let out = '';
  for (const node of nodes) {
    if (node.t === 'text') {
      out += node.s;
    } else if (node.t === 'var') {
      const v = lookup(node.path, frames);
      out += node.raw ? writeValue(v) : esc(writeValue(v));
    } else if (node.t === 'for') {
      const v = lookup(node.path, frames);
      if (Array.isArray(v)) {
        for (let idx = 0; idx < v.length; idx++) {
          frames.push({
            var: node.name,
            value: v[idx],
            loop: { index: idx + 1, first: idx === 0, last: idx === v.length - 1, length: v.length },
          });
          out += renderNodes(node.body, frames, depth, tplMap);
          frames.pop();
        }
      }
    } else if (node.t === 'if') {
      const v = lookup(node.path, frames);
      const take = node.not ? !isTruthy(v) : isTruthy(v);
      out += renderNodes(take ? node.then : node.otherwise || [], frames, depth, tplMap);
    } else if (node.t === 'include') {
      if (depth + 1 > 8) continue;
      const tpl = tplMap.get(node.name);
      if (tpl) out += renderNodes(tpl, frames, depth + 1, tplMap);
    }
  }
  return out;
}

// ---------- the build ----------

function dedupeTags(names) {
  const seen = new Set();
  const out = [];
  for (const name of names) {
    const slug = slugOf(name);
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push({ name, slug });
    }
  }
  return out;
}

export function run(input) {
  const site = input.site || {};
  const base = String(site.base_url ?? '').replace(/\/+$/, '');
  const perPageRaw = site.per_page;
  const perPage = typeof perPageRaw === 'number' && perPageRaw > 0 ? Math.floor(perPageRaw) : 1;
  const recentN = site.recent;
  const templates = input.templates || {};
  const files = (input.files || []).slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const reports = [];

  // Templates, parsed once per case, in code-unit order of name.
  const tplNames = Object.keys(templates).sort();
  const tplMap = new Map();
  for (const name of tplNames) {
    const r = parseTemplate(templates[name]);
    if (r.error) {
      reports.push('template "' + name + '": ' + r.error);
      tplMap.set(name, null);
    } else {
      tplMap.set(name, r.nodes);
    }
  }

  // Sources, in sorted order.
  const statics = [];
  const staticSet = new Set();
  const pages = [];
  const pageBySource = new Map();
  const takenByDir = new Map();
  const takenSet = (dir) => {
    let s = takenByDir.get(dir);
    if (!s) {
      s = new Set();
      if (dir === '') {
        s.add('posts');
        s.add('tags');
        s.add('page');
      }
      takenByDir.set(dir, s);
    }
    return s;
  };
  for (const f of files) {
    const p = f.path;
    if (!p.endsWith('.md')) {
      statics.push(f);
      staticSet.add(p);
      continue;
    }
    const norm = f.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const fm = parseFrontMatter(norm);
    if (!fm.ok) {
      reports.push('refused ' + p + ': ' + fm.reason);
      continue;
    }
    const meta = fm.meta;
    if (p.startsWith('tags/')) {
      reports.push('refused ' + p + ': tags/ is the generator\'s own');
      continue;
    }
    if (p.startsWith('page/')) {
      reports.push('refused ' + p + ': page/ is the generator\'s own');
      continue;
    }
    const isPost = p.startsWith('posts/');
    if (isPost && meta.date === undefined) {
      reports.push('refused ' + p + ': a post needs a date');
      continue;
    }
    const layout = meta.layout !== undefined ? meta.layout : isPost ? 'post' : 'page';
    if (!tplMap.has(layout) || tplMap.get(layout) === null) {
      reports.push('refused ' + p + ': layout "' + layout + '" is no template that parses');
      continue;
    }
    if (meta.draft === true) {
      reports.push('draft ' + p);
      continue;
    }
    const dir = isPost ? 'posts' : dirOf(p);
    const taken = takenSet(dir);
    const baseSlug = meta.slug !== undefined ? meta.slug : slugOf(meta.title);
    let slug = baseSlug;
    let k = 2;
    while (taken.has(slug)) {
      slug = baseSlug + '-' + k;
      k++;
    }
    taken.add(slug);
    const outPath = dir === '' ? slug + '/index.html' : dir + '/' + slug + '/index.html';
    const url = base + '/' + (dir === '' ? '' : dir + '/') + slug + '/';
    pageBySource.set(p, url);
    pages.push({ source: p, meta, body: fm.body, isPost, dir, slug, outPath, url, layout });
  }

  // Render every kept page's Markdown now that every page url is known.
  const brokenSeen = new Set();
  for (const pg of pages) {
    const ctx = {
      sourceDir: dirOf(pg.source),
      sourcePath: pg.source,
      base,
      pageBySource,
      staticSet,
      reports,
      brokenSeen,
    };
    const r = renderBody(pg.body, ctx);
    pg.html = r.html;
    pg.excerpt = r.excerpt;
    pg.toc = r.toc;
    pg.readingMinutes = Math.max(1, Math.ceil(countWords(pg.body) / 200));
    pg.tags = dedupeTags(pg.meta.tags || []);
  }

  // Collections: posts newest first, equal dates by slug.
  const posts = pages.filter((p) => p.isPost).sort((a, b) => {
    if (a.meta.date > b.meta.date) return -1;
    if (a.meta.date < b.meta.date) return 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  for (let i = 0; i < posts.length; i++) {
    posts[i].newer = i > 0 ? posts[i - 1] : null;
    posts[i].older = i < posts.length - 1 ? posts[i + 1] : null;
  }

  // Tags, named as first met walking the posts in collection order.
  const tagMap = new Map();
  for (const p of posts) {
    for (const t of p.tags) {
      let tag = tagMap.get(t.slug);
      if (!tag) {
        tag = { name: t.name, slug: t.slug, posts: [] };
        tagMap.set(t.slug, tag);
      }
      tag.posts.push(p);
    }
  }
  const tags = [...tagMap.values()].sort(
    (a, b) => b.posts.length - a.posts.length || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  );
  for (const t of tags) t.url = base + '/tags/' + t.slug + '/';
  // A page's tags are the shared tag objects: the name is the tag's name as
  // first met walking the posts in collection order, not the page's own
  // spelling. A tag no post has keeps the page's own spelling and an empty url.
  for (const pg of pages) {
    pg.tags = pg.tags.map((t) => ({
      name: tagMap.has(t.slug) ? tagMap.get(t.slug).name : t.name,
      slug: t.slug,
      url: tagMap.has(t.slug) ? tagMap.get(t.slug).url : '',
    }));
  }

  const cardOf = (p) => ({
    title: p.meta.title,
    url: p.url,
    date: p.meta.date !== undefined ? p.meta.date : '',
    date_long: dateLong(p.meta.date !== undefined ? p.meta.date : ''),
    summary: p.meta.summary !== undefined ? p.meta.summary : '',
    excerpt: p.excerpt,
    reading_minutes: p.readingMinutes,
    tags: p.tags,
  });
  const neighbourOf = (p) =>
    p
      ? {
          title: p.meta.title,
          url: p.url,
          date: p.meta.date !== undefined ? p.meta.date : '',
          date_long: dateLong(p.meta.date !== undefined ? p.meta.date : ''),
        }
      : null;
  const pageValue = (p) => {
    const card = cardOf(p);
    card.slug = p.slug;
    card.content = p.html;
    card.toc = p.toc;
    card.newer = p.isPost ? neighbourOf(p.newer) : null;
    card.older = p.isPost ? neighbourOf(p.older) : null;
    card.is_post = p.isPost;
    return card;
  };

  const siteVal = { title: site.title !== undefined ? site.title : '', base_url: base };
  const tagsVal = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recentVal = posts.slice(0, recentN).map(cardOf);

  const out = {};
  let pageCount = 0;
  let postCount = 0;
  for (const pg of pages) {
    const ctx = { site: siteVal, tags: tagsVal, recent: recentVal, page: pageValue(pg) };
    out[pg.outPath] = renderNodes(tplMap.get(pg.layout), [ctx], 0, tplMap);
    if (pg.isPost) postCount++;
    else pageCount++;
  }

  // Index pages, per_page posts a page, at least one even with no posts.
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  if (tplMap.get('index')) {
    for (let k = 1; k <= totalPages; k++) {
      const pagePosts = posts.slice((k - 1) * perPage, k * perPage).map(cardOf);
      const pager = {
        number: k,
        total: totalPages,
        url: k === 1 ? base + '/' : base + '/page/' + k + '/',
        newer_url: k > 1 ? (k === 2 ? base + '/' : base + '/page/' + (k - 1) + '/') : '',
        older_url: k < totalPages ? base + '/page/' + (k + 1) + '/' : '',
      };
      const ctx = { site: siteVal, tags: tagsVal, recent: recentVal, posts: pagePosts, pager };
      out[k === 1 ? 'index.html' : 'page/' + k + '/index.html'] = renderNodes(
        tplMap.get('index'),
        [ctx],
        0,
        tplMap
      );
    }
  }

  // Tag pages and the tags index.
  let tagCount = 0;
  if (tplMap.get('tag')) {
    for (const t of tags) {
      const ctx = {
        site: siteVal,
        tags: tagsVal,
        recent: recentVal,
        tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map(cardOf) },
      };
      out['tags/' + t.slug + '/index.html'] = renderNodes(tplMap.get('tag'), [ctx], 0, tplMap);
      tagCount++;
    }
  }
  if (tplMap.get('tags')) {
    out['tags/index.html'] = renderNodes(
      tplMap.get('tags'),
      [{ site: siteVal, tags: tagsVal, recent: recentVal }],
      0,
      tplMap
    );
  }

  // Static files, unless a built page has their path.
  let staticCount = 0;
  for (const f of statics) {
    if (Object.prototype.hasOwnProperty.call(out, f.path)) {
      reports.push('shadowed ' + f.path + ': a built page has its path');
      continue;
    }
    out[f.path] = f.content;
    staticCount++;
  }

  // The report: every reported line, sorted, then the built line.
  const reportLines = [...reports].sort();
  reportLines.push(
    'built ' + pageCount + ' pages, ' + postCount + ' posts, ' + tagCount + ' tags and ' + staticCount + ' static files'
  );
  out['build-report.txt'] = reportLines.join('\n') + '\n';
  return out;
}
