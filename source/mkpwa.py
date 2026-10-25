import os,shutil,json,re,hashlib
from PIL import Image,ImageDraw
R=os.path.dirname(os.path.abspath(__file__));D=R+'/dist';P=R+'/pwa'
shutil.rmtree(P,ignore_errors=True);os.makedirs(P+'/icons')
shutil.copytree(D+'/vendor',P+'/vendor')
def icon(sz,pad):
    S=sz*4;im=Image.new('RGB',(S,S),'#1E6B57');d=ImageDraw.Draw(im)
    m=int(S*pad);w=S-2*m
    # page
    x0,y0,x1,y1=m+w*0.26,m+w*0.16,m+w*0.74,m+w*0.84
    d.rounded_rectangle([x0,y0,x1,y1],radius=w*0.05,fill='#FAFAF9')
    # bookmark ribbon
    d.polygon([(x1-w*0.15,y0),(x1-w*0.05,y0),(x1-w*0.05,y0+w*0.2),(x1-w*0.10,y0+w*0.16),(x1-w*0.15,y0+w*0.2)],fill='#1E6B57')
    # text lines
    for i,l in enumerate([0.50,0.50,0.50,0.34]):
        yy=y0+w*(0.30+i*0.09);d.rounded_rectangle([x0+w*0.07,yy,x0+w*0.07+(x1-x0-w*0.14)*l/0.5*0.96*(1 if l>0.4 else .7),yy+w*0.022],radius=w*0.011,fill='#B9C7C2')
    return im.resize((sz,sz),Image.LANCZOS)
icon(192,0.0).save(P+'/icons/icon-192.png');icon(512,0.0).save(P+'/icons/icon-512.png')
icon(512,0.10).save(P+'/icons/maskable-512.png');icon(180,0.0).save(P+'/icons/apple-touch-icon.png')
html=open(D+'/artifact.html',encoding='utf8').read()
head_extra='''<script src="config.js"></script>
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#F1F2F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0B0E0F" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Quill">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<meta name="description" content="Read or listen to your own PDFs as swipeable cards. Private and offline, with your books staying on your device unless you choose to sync them to your account.">
'''
page='<!doctype html>\n<html lang="en">\n<head>\n'+head_extra+html
# the artifact fragment starts with head content then body; make sure a <body> boundary exists
if '<body' not in page:
    i=page.find('</style>')
    # find first body-level element: the fragment's markup after the head styles
    raise SystemExit('no <body> marker found - inspect artifact.html structure')
if '</html>' not in page: page+='\n</html>\n'
reg='''<script>if('serviceWorker' in navigator&&location.protocol!=='file:'){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}</script>\n'''
page=page.replace('</body>',reg+'</body>',1) if '</body>' in page else page+reg
open(P+'/index.html','w',encoding='utf8').write(page)
json.dump({"name":"Quill","short_name":"Quill","description":"Read or listen to your own PDFs as swipeable cards.","start_url":".","scope":".","display":"standalone","orientation":"any","background_color":"#F1F2F0","theme_color":"#F1F2F0","categories":["books","education","productivity"],
 "icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]},open(P+'/manifest.webmanifest','w'),indent=1)
shutil.copy(R+'/README.pwa.md',P+'/README.md')
open(P+'/config.js','w').write(open(R+'/config.template.js').read())
shutil.copy(R+'/supabase.sql',P+'/supabase.sql')
files=['./','config.js','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png']
for root,_,fs in os.walk(P+'/vendor'):
    for f in fs: files.append(os.path.relpath(os.path.join(root,f),P).replace(os.sep,'/'))
files.sort()
h=hashlib.sha256()
for f in files:
    if f=='./':continue
    h.update(f.encode());h.update(open(P+'/'+f,'rb').read())
ver=h.hexdigest()[:10]
sw='''/* Quill service worker: precaches the app + PDF engine so it opens and imports offline. */
var VER='folio-%s';
var CORE=%s;
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VER).then(function(c){return Promise.all(CORE.map(function(u){return c.add(new Request(u,{cache:'reload'}))}))}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k.indexOf('folio-')===0&&k!==VER&&k!=='folio-fonts'}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;if(r.method!=='GET') return;
  var u=new URL(r.url);
  if(u.origin===location.origin){
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
      if(hit) return hit;
      if(r.mode==='navigate') return caches.match('index.html');
      return fetch(r);
    }));
    return;
  }
  /* Google Fonts: cache after first successful load so type works offline afterwards */
  if(/fonts\\.(googleapis|gstatic)\\.com$/.test(u.hostname)){
    e.respondWith(caches.open('folio-fonts').then(function(c){return c.match(r).then(function(hit){
      var net=fetch(r).then(function(res){if(res&&(res.ok||res.type==='opaque')) c.put(r,res.clone());return res}).catch(function(){return hit});
      return hit||net;
    })}));
  }
});
''' % (ver,json.dumps(files,indent=1))
open(P+'/sw.js','w').write(sw)
print('files',len(files),'ver',ver,'index KB',len(page)//1024)
