"""Lokale PDF-Prüfung nach npm run build:data; kein Teil des Webbuilds."""
import hashlib
import json
import re
import unicodedata
from pathlib import Path
import pymupdf as fitz

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PUBLIC = ROOT / 'public'

def normalized(text):
    return re.sub(r'\s+|[\u00ad\u200b]', '', unicodedata.normalize('NFKC', text))

records = [json.loads(p.read_text()) for p in sorted((HERE / 'belege').glob('B*.json'))]
paragraphs = links = citations = 0
for record in records:
    identifier = record['id']
    assert 'tags' not in record, (identifier, 'Tags im Beleg')
    if record.get('localFile') and record.get('sha256'):
        assert hashlib.sha256((PUBLIC / 'sources' / record['localFile']).read_bytes()).hexdigest() == record['sha256'], identifier
    doc = fitz.open(PUBLIC / 'sources' / ('beleg-' + identifier.lower() + '.pdf'))
    text_pages = len(doc)
    if attachment := record.get('attachment'):
        file = HERE / attachment['file']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == attachment['sha256'], identifier
        original = fitz.open(file)
        text_pages -= len(original)
        for i, page in enumerate(original):
            before = [hashlib.sha256(original.extract_image(x[0])['image']).hexdigest() for x in page.get_images()]
            after = [hashlib.sha256(doc.extract_image(x[0])['image']).hexdigest() for x in doc[text_pages + i].get_images()]
            assert before == after, (identifier, 'Anhangabbildungen', i)
    body = normalized(''.join(p.get_text(clip=fitz.Rect(0, 0, p.rect.width, 780)) for p in doc.pages(0, text_pages)))
    for paragraph in record['text'] + record.get('references', []):
        paragraphs += 1
        assert normalized(paragraph.removeprefix('## ')) in body, (identifier, 'Text fehlt', paragraph[:90])
    for page in doc:
        for link in page.get_links():
            links += 1
            if link['kind'] == fitz.LINK_GOTO:
                assert 0 <= link['page'] < len(doc), (identifier, link)
            elif link['kind'] == fitz.LINK_GOTOR:
                target = PUBLIC / 'sources' / link['file']
                assert target.exists() and 0 <= link['page'] < len(fitz.open(target)), (identifier, link)
            elif link['kind'] == fitz.LINK_URI:
                assert link['uri'].startswith(('https://', 'http://')) and 'local-source.invalid' not in link['uri'], (identifier, link)
            else:
                raise AssertionError((identifier, 'Unerwartete Linkart', link))
    for name, page in record.get('locators', {}).items():
        assert 1 <= page <= text_pages, (identifier, name, page)
for record in json.loads((HERE / 'originale.json').read_text()):
    file = PUBLIC / 'sources' / record['file']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256'], record['id']

def verify_urls(value):
    global citations
    if isinstance(value, dict):
        for key, item in value.items():
            if key == 'url' and isinstance(item, str):
                if match := re.fullmatch(r'(/sources/[^#]+\.pdf)#page=(\d+)', item):
                    citations += 1
                    assert 1 <= int(match[2]) <= len(fitz.open(PUBLIC / match[1].lstrip('/'))), item
            else:
                verify_urls(item)
    elif isinstance(value, list):
        for item in value:
            verify_urls(item)
for file in (PUBLIC / 'data/trees').glob('*.json'):
    if file.name != 'index.json':
        verify_urls(json.loads(file.read_text()).get('people', {}))
for file in (PUBLIC / 'chronicle').rglob('*.md'):
    for url, page in re.findall(r'\[\[s:(/sources/[^#|]+\.pdf)#page=(\d+)\|', file.read_text()):
        assert 1 <= int(page) <= len(fitz.open(PUBLIC / url.lstrip('/'))), (file, url, page)
print(json.dumps({'pdfs': len(records), 'paragraphs': paragraphs, 'links': links, 'personPageCitations': citations}, ensure_ascii=False))
