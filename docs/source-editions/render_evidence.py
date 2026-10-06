"""Einzelbelege lokal setzen: python render_evidence.py [B000001 ...]."""
import hashlib
import html
import json
import re
import sys
from pathlib import Path
import pymupdf as fitz

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CSS = '''*{font-family:sans-serif;color:#222}body{font-size:10pt;line-height:1.42}
h1{font-size:13pt;margin:0 0 8pt;color:#2f5f5c}h2{font-size:10pt;margin:8pt 0 3pt}
p{margin:0 0 6pt}p.quote{padding-left:8pt;border-left:1.5pt solid #b9c9c7}
table{border-collapse:collapse;margin:0 0 10pt}td{font-size:9pt;padding:1.5pt 6pt 1.5pt 0;vertical-align:top}td.key{color:#666;width:62pt}
a{color:#2f5f5c}'''
LOCAL = 'https://local-source.invalid/'
def linked(value):
    def link(m):
        url=m[0].rstrip('.,;')
        return '<a href="%s">%s</a>%s' % (html.escape(html.unescape(url), quote=True),url,m[0][len(url):])
    return re.sub(r'https?://[^\s<>"“”«»]+',link,html.escape(value,quote=False))

def render(record, output):
    assert re.fullmatch(r'B\d{6}',record['id'])
    assert 'tags' not in record, 'Familientags gehören nur in den Website-Katalog.'
    rows=[('Zitierung','citation'),('Original','original'),('Archiv','archive'),('Abgerufen','retrieved'),('Wiedergabe','kind'),('Umfang','scope')]
    body='<h1>%s · %s</h1><table>%s</table>' % (record['id'],html.escape(record['title']),''.join('<tr><td class="key">%s</td><td>%s</td></tr>'%(label,linked(record.get(key,''))) for label,key in rows if record.get(key)))
    for text in record['text']:
        if text.startswith('## '):body+='<h2>%s</h2>'%html.escape(text[3:])
        else:body+='<p class="%s">%s</p>'%('' if 'Zusammenfassung' in record.get('kind','') else 'quote',linked(text))
    if record.get('references'):
        body+='<h2>Quellennachweise des Originals</h2>'
        body+=''.join('<p>%s</p>'%linked(text) for text in record['references'])
    for ref in record.get('localReferences',[]):
        body+='<p><a href="%s%s/%d">%s</a></p>'%(LOCAL,html.escape(ref['file']),ref['page'],html.escape(ref['label']))
    story=fitz.Story(html=body,user_css=CSS)
    doc=story.write_with_links(lambda *_:(fitz.paper_rect('a4'),fitz.Rect(56,56,539,780),None))
    text_pages=len(doc)
    toc=[[1,record['id']+' · '+record['title'],1]]
    for page in doc:
        merged=[]
        for link in page.get_links():
            if link['kind']!=fitz.LINK_URI:continue
            page.delete_link(link);rect=link['from']
            if rect.is_empty:continue
            if merged and merged[-1]['uri']==link['uri'] and abs(merged[-1]['from'].y0-rect.y0)<.1 and abs(merged[-1]['from'].x1-rect.x0)<1:merged[-1]['from']|=rect
            else:merged.append({'kind':fitz.LINK_URI,'uri':link['uri'],'from':rect})
        for link in merged:
            if link['uri'].startswith(LOCAL):
                file,p=link['uri'][len(LOCAL):].rsplit('/',1)
                assert Path(file).name==file and file.endswith('.pdf')
                link={'kind':fitz.LINK_GOTOR,'file':file,'page':int(p)-1,'to':fitz.Point(0,0),'from':link['from']}
            page.insert_link(link)
    if attachment:=record.get('attachment'):
        file=HERE/attachment['file']
        assert hashlib.sha256(file.read_bytes()).hexdigest()==attachment['sha256'],file
        start=len(doc)
        with fitz.open(file) as original:doc.insert_pdf(original)
        toc.append([1,attachment.get('title','Originalabbildungen'),start+1])
        page=doc[0];label=attachment.get('label','Originalabbildungen im Anhang')
        page.insert_text((56,796),label,fontsize=9,color=(.18,.37,.36))
        page.insert_link({'kind':fitz.LINK_GOTO,'page':start,'from':fitz.Rect(56,785,490,801),'to':fitz.Point(0,0)})
    for i,page in enumerate(doc):
        rect=page.rect
        if i<text_pages:
            page.insert_text((56,815),'Beleg %s · Seite %d'%(record['id'],i+1),fontsize=7.5,color=(.5,.5,.5))
        else:
            page.insert_text((12,rect.height-10),'Beleg %s · Anhang · Seite %d'%(record['id'],i+1),fontsize=8,color=(.18,.37,.36))
            page.insert_link({'kind':fitz.LINK_GOTO,'page':0,'from':fitz.Rect(10,rect.height-22,230,rect.height-5),'to':fitz.Point(0,0)})
    doc.set_metadata({'title':record['title'],'author':record.get('author','Family archive'),'subject':'Beleg '+record['id']})
    doc.set_toc(toc)
    doc.save(output,garbage=4,deflate=True)
    return {'pages':len(doc),'textPages':text_pages}

if __name__=='__main__':
    files=[HERE/'belege'/(identifier+'.json') for identifier in sys.argv[1:]] if len(sys.argv)>1 else sorted((HERE/'belege').glob('B*.json'))
    page_counts={}
    for file in files:
        record=json.loads(file.read_text());page_counts[record['id']]=render(record,ROOT/'public/sources'/('beleg-'+record['id'].lower()+'.pdf'))
    print(json.dumps(page_counts,ensure_ascii=False))
