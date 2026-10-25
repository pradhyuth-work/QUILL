import json, re, sys, os
here=os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(here,p),encoding='utf-8').read()
def blob(p): return json.dumps(json.load(open(os.path.join(here,p),encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
def assemble(variant):
    order=['core','settings','model','library_a','library_b','reader_a','speech','reader_b','reader_c','sheets','resize','guard','ocr','backup','import','sync','tail']
    body=''.join(rd('src/js/%s.js'%n) for n in order)
    js=rd('src/js/storage.js')+"\nFolioDB.init().catch(function(){return null}).then(function(){\n"+body+"\n});\n"
    ex=rd('src/extract.js').replace('/*EXTRACT_START*/\n','').replace('/*EXTRACT_END*/\n','')
    ex=re.sub(r"      if\(typeof FOLIO_DEBUG==='function'\)[^\n]*\n",'',ex)
    js=js.replace('/*@@EXTRACT@@*/',ex)
    js=js.replace('/*@@DEMO@@*/[]',blob('corpus/demo_baked.json'))
    html=rd('src/head.html')+'\n<style>\n'+rd('src/style.css')+'\n</style>\n'+rd('src/body.html')+'\n<script>\n'+js+'\n</script>\n'
    html=html.replace('__DATA_BASE__',"'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/'" if variant=='hosted' else 'PDF_BASE')
    return html
if __name__=='__main__':
    os.makedirs(os.path.join(here,'dist'),exist_ok=True)
    h=assemble('artifact')
    open(os.path.join(here,'dist/artifact.html'),'w',encoding='utf-8').write(h)
    print('artifact.html',len(h)//1024,'KB')
    h2=assemble('hosted')
    open(os.path.join(here,'dist/hosted.html'),'w',encoding='utf-8').write(h2)
    print('hosted.html',len(h2)//1024,'KB')
