// Work exclusively on sanitized Markdown DOM; chapter source stays portable.
export function formatChapterPresentation(root: HTMLElement, thumbnails: Record<string, string>, origin: string) {
  const doc = root.ownerDocument;
  for (const quote of root.querySelectorAll('blockquote')) {
    const last = quote.lastElementChild;
    if (last?.tagName !== 'P') continue;
    const match = last.innerHTML.match(/(?:^|\n|<br\s*\/?>)\s*—\s+([^\n]+)\s*$/);
    if (!match) continue;
    const cite = doc.createElement('cite'); cite.innerHTML = match[1];
    last.innerHTML = last.innerHTML.slice(0, match.index);
    if (!last.textContent?.trim()) last.remove();
    quote.append(cite);
  }
  for (const paragraph of root.querySelectorAll('p')) {
    if (paragraph.closest('blockquote')) continue;
    const first = paragraph.firstElementChild;
    if (!first?.matches('a.chronicle-source') || paragraph.textContent?.trimStart().indexOf(first.textContent || '') !== 0) continue;
    const before = [...paragraph.childNodes].slice(0, [...paragraph.childNodes].indexOf(first));
    if (before.some(n => n.textContent?.trim())) continue;
    const after = [...paragraph.childNodes].slice([...paragraph.childNodes].indexOf(first) + 1);
    const description = after.map(n => n.textContent || '').join('');
    if (description.trim() && !/^\s+–\s+/.test(description)) continue;
    const card = doc.createElement('aside'); card.className = 'chronicle-document';
    const preview = doc.createElement('span'); preview.className = 'document-preview'; preview.setAttribute('aria-hidden', 'true');
    preview.textContent = '▤';
    const thumbnail = thumbnails[first.getAttribute('href') || ''];
    if (thumbnail) { const image = doc.createElement('img'); image.src = thumbnail; image.alt = ''; preview.append(image); }
    const content = doc.createElement('div'); first.classList.add('document-title'); content.append(first);
    if (description.trim()) {
      const text = doc.createElement('p'); text.append(...after);
      const walker = doc.createTreeWalker(text, 4); const leading = walker.nextNode();
      if (leading) leading.textContent = (leading.textContent || '').replace(/^\s+–\s+/, '');
      content.append(text);
    }
    card.append(preview, content); paragraph.replaceWith(card);
  }
  const urls: string[] = [];
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a.chronicle-source')) {
    const url = new URL(link.getAttribute('href')!, origin).href;
    let index = urls.indexOf(url); if (index < 0) { index = urls.length; urls.push(url); }
    const number = doc.createElement('sup'); number.className = 'print-source-number'; number.textContent = `[${index + 1}]`; link.after(number);
  }
  if (urls.length) {
    const notes = doc.createElement('ol'); notes.className = 'print-source-notes';
    for (const url of urls) { const item = doc.createElement('li'); item.textContent = url; notes.append(item); }
    root.append(notes);
  }
}
