export function chronicleLabels(language: string) {
  if (language === 'pt') return { title: 'Crônica familiar', chapter: 'Capítulo', next: 'A seguir', back: 'Voltar', print: 'Imprimir como livro', preparing: 'Preparando o livro…', failed: 'Não foi possível preparar o livro.' };
  if (language === 'en') return { title: 'Family chronicle', chapter: 'Chapter', next: 'Next', back: 'Back', print: 'Print as a book', preparing: 'Preparing book…', failed: 'The book could not be prepared.' };
  return { title: 'Familienchronik', chapter: 'Kapitel', next: 'Weiter', back: 'Zurück', print: 'Als Buch drucken', preparing: 'Buch wird vorbereitet…', failed: 'Das Buch konnte nicht vorbereitet werden.' };
}
