// Presentation only: chapter files retain their original Markdown and links.
// A photo on its own line is followed by its caption, with or without a blank line.
export function formatChapterMedia(root: HTMLElement) {
  const document = root.ownerDocument;
  for (const paragraph of root.querySelectorAll('p')) {
    const first = [...paragraph.childNodes].find(node => node.nodeType === 1 || node.textContent?.trim());
    if (!(first instanceof Element)) continue;
    const image = first.tagName === 'IMG' ? first : first.matches('a:has(> img:only-child)') ? first.querySelector('img') : null;
    if (!image || paragraph.querySelectorAll('img').length !== 1) continue;
    const following = [...paragraph.childNodes].slice([...paragraph.childNodes].indexOf(first) + 1);
    const hasCaption = following.some(node => node.nodeType === 1 || node.textContent?.trim());
    // An image within an ordinary line of prose stays inline.
    if (hasCaption && !/^\s*\n/.test(following[0]?.textContent || '')) continue;

    const figure = document.createElement('figure');
    figure.className = image.getAttribute('title') === 'schmal' ? 'chronicle-figure chronicle-figure-narrow' : 'chronicle-figure';
    image.removeAttribute('title');
    figure.append(first);
    const caption = document.createElement('figcaption');
    if (hasCaption) caption.append(...following);
    else {
      const next = paragraph.nextElementSibling;
      if (next?.tagName === 'P' && !next.querySelector('img')) {
        caption.append(...next.childNodes);
        next.remove();
      }
    }
    if (caption.textContent?.trim()) figure.append(caption);
    paragraph.replaceWith(figure);
  }
}
