function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? value.trim() : null;
  } catch {
    return null;
  }
}

function renderInline(value) {
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+)\*|(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g;
  let html = '';
  let previousIndex = 0;

  for (const match of value.matchAll(pattern)) {
    html += escapeHtml(value.slice(previousIndex, match.index));
    if (match[1] !== undefined) {
      html += `<code>${escapeHtml(match[1])}</code>`;
    } else if (match[2] !== undefined) {
      const href = safeHttpUrl(match[3]);
      html += href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[2])}</a>`
        : escapeHtml(match[0]);
    } else if (match[4] !== undefined || match[5] !== undefined) {
      html += `<strong>${escapeHtml(match[4] ?? match[5])}</strong>`;
    } else if (match[6] !== undefined) {
      html += `<del>${escapeHtml(match[6])}</del>`;
    } else {
      html += `<em>${escapeHtml(match[7] ?? match[8])}</em>`;
    }
    previousIndex = match.index + match[0].length;
  }

  return html + escapeHtml(value.slice(previousIndex));
}

function tableCells(line) {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableAt(lines, index) {
  if (index + 1 >= lines.length || !lines[index].includes('|') || !lines[index + 1].includes('|')) return false;
  const separator = tableCells(lines[index + 1]);
  return separator.length > 0 && separator.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function listMarker(line) {
  const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
  if (unordered) return { type: 'ul', text: unordered[1] };
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  if (ordered) return { type: 'ol', text: ordered[1] };
  return null;
}

function startsBlock(lines, index) {
  const line = lines[index];
  return /^\s*#{1,6}\s+/.test(line)
    || /^\s*(`{3,}|~{3,})/.test(line)
    || /^\s*>/.test(line)
    || /^\s*(?:[-*_]\s*){3,}$/.test(line)
    || listMarker(line) !== null
    || isTableAt(lines, index);
}

function renderTable(lines, start) {
  const headers = tableCells(lines[start]);
  const rows = [];
  let index = start + 2;
  while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
    rows.push(tableCells(lines[index]));
    index += 1;
  }

  const headerHtml = headers.map((header) => `<th scope="col">${renderInline(header)}</th>`).join('');
  const rowHtml = rows.map((row) => {
    const cells = headers.map((header, cellIndex) => {
      const value = row[cellIndex] ?? '';
      return `<td data-label="${escapeHtml(header)}">${renderInline(value)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return {
    html: `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table></div>`,
    nextIndex: index,
  };
}

function renderCodeBlock(lines, start) {
  const opening = lines[start].trim().match(/^(`{3,}|~{3,})\s*([a-zA-Z0-9_-]*)/);
  const fence = opening[1];
  const language = opening[2];
  const code = [];
  let index = start + 1;
  while (index < lines.length && !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[index])) {
    code.push(lines[index]);
    index += 1;
  }
  if (index < lines.length) index += 1;
  const className = language ? ` class="language-${language}"` : '';
  return { html: `<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`, nextIndex: index };
}

function isWarningHeading(text) {
  return /未执行|未验证|not run|not verified|important/i.test(text);
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let warningOpen = false;
  let index = 0;

  const closeWarning = () => {
    if (!warningOpen) return;
    blocks.push('</aside>');
    warningOpen = false;
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const title = heading[2];
      const level = Math.min(6, Math.max(2, heading[1].length));
      if (isWarningHeading(title)) {
        closeWarning();
        blocks.push('<aside class="md-warning">');
        warningOpen = true;
      } else {
        closeWarning();
      }
      blocks.push(`<h${level}>${renderInline(title)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      const rendered = renderCodeBlock(lines, index);
      blocks.push(rendered.html);
      index = rendered.nextIndex;
      continue;
    }

    if (isTableAt(lines, index)) {
      const rendered = renderTable(lines, index);
      blocks.push(rendered.html);
      index = rendered.nextIndex;
      continue;
    }

    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    const firstMarker = listMarker(line);
    if (firstMarker) {
      const items = [];
      while (index < lines.length) {
        const marker = listMarker(lines[index]);
        if (!marker || marker.type !== firstMarker.type) break;
        items.push(`<li>${renderInline(marker.text)}</li>`);
        index += 1;
      }
      blocks.push(`<${firstMarker.type}>${items.join('')}</${firstMarker.type}>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  closeWarning();
  return blocks.join('');
}
