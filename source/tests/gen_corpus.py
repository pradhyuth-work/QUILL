import random, json, io, os, sys, textwrap
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit, ImageReader
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image as RLImage, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'corpus'); os.makedirs(OUT,exist_ok=True)
FONTS='/usr/share/fonts/truetype/'
def findfont(name):
    for root,_,fs in os.walk('/usr/share/fonts'):
        if name in fs: return os.path.join(root,name)
    raise Exception(name)
pdfmetrics.registerFont(TTFont('Serif',findfont('FreeSerif.ttf')))
pdfmetrics.registerFont(TTFont('SerifB',findfont('FreeSerifBold.ttf')))
R=random.Random(7)
W1='the of and a to in he she it was that his her with as for had on at by from they said but not this have were an are which one you all there would their we him been has when who will more no if out so what up its about into than them can only other new some could time these two may then do first any my now such like our over man me even most made after also did many before must through back where much your way well down should because each just those people how too little good very make still own see men work long get here between both life being under never day same another know while last might great old year off come since against go came right used take three'.split()
N1='road river house garden window letter winter morning village mother father stranger captain lantern harbour mountain bridge silence promise shadow journey kitchen candle orchard station market meadow bell clock engine ship wall door hand voice'.split()
V1='walked looked remembered carried opened closed followed waited whispered turned climbed lifted answered watched crossed noticed gathered covered reached'.split()
A1='old quiet narrow heavy pale distant careful strange gentle sudden bright empty crooked familiar'.split()
def sentence():
    n=R.randint(8,24); words=[]
    words.append(R.choice(['The','A','Her','His','Their','Every','Some','Nothing','Somewhere','Later']))
    while len(words)<n:
        r=R.random()
        if r<0.2: words.append(R.choice(A1))
        elif r<0.45: words.append(R.choice(N1))
        elif r<0.6: words.append(R.choice(V1))
        else: words.append(R.choice(W1))
    s=' '.join(words)
    s=s[0].upper()+s[1:]
    return s+R.choice(['.','.','.','.','!','?'])
def paragraph(minS=3,maxS=8):
    return ' '.join(sentence() for _ in range(R.randint(minS,maxS)))
def chart(path,i):
    fig,ax=plt.subplots(figsize=(5,3.2)); xs=list(range(10)); ax.plot(xs,[R.random()*5+i for _ in xs],marker='o'); ax.bar(xs,[R.random()*3 for _ in xs],alpha=.3); ax.set_title('Plate %d'%i); fig.tight_layout(); fig.savefig(path,dpi=110); plt.close(fig)

# ---------- 1. novel, N pages, first-line indent, no paragraph spacing ----------
def novel(path,pages,withimg=True):
    ps=ParagraphStyle('b',fontName='Serif',fontSize=11,leading=14.5,firstLineIndent=20,alignment=4,spaceAfter=0)
    hs=ParagraphStyle('h',fontName='SerifB',fontSize=22,leading=26,alignment=1,spaceBefore=80,spaceAfter=30)
    cs=ParagraphStyle('c',fontName='Serif',fontSize=9.5,leading=12,alignment=1,spaceBefore=4,spaceAfter=12)
    PW,PH=5.5*inch,8.5*inch
    def deco(c,d):
        c.saveState(); c.setFont('Serif',8)
        c.drawCentredString(PW/2,PH-30,'THE LONG ROAD HOME'); c.drawCentredString(PW/2,28,str(d.page)); c.restoreState()
    doc=BaseDocTemplate(path,pagesize=(PW,PH),leftMargin=48,rightMargin=48,topMargin=54,bottomMargin=54)
    doc.addPageTemplates([PageTemplate(id='p',frames=[Frame(48,54,PW-96,PH-108,id='f',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=deco)])
    story=[];truth={'chapters':[],'paras':0,'words':0,'figs':0,'sample':[]}
    nums='ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN SIXTEEN SEVENTEEN EIGHTEEN NINETEEN TWENTY'.split()
    chap=0;pp=0;imgs=0
    while True:
        if chap<len(nums) and (pp==0 or pp>=pages/ max(1,len(nums)) ):
            pass
        break
    # build story by paragraph count: ~ 34 paragraphs per 5 pages roughly; fill until page count reached by trial
    nchap=max(2,pages//20)
    parpp=3.3  # paragraphs per page estimate
    per=int(pages*parpp/nchap)
    for c in range(nchap):
        title='CHAPTER '+(nums[c] if c<len(nums) else str(c+1))
        story.append(PageBreak()) if c else None
        story.append(Paragraph(title,hs)); truth['chapters'].append(title)
        for k in range(per):
            t=paragraph(4,10) if R.random()>0.1 else '“'+sentence()+'” '+sentence()
            story.append(Paragraph(t.replace('&','&amp;'),ps)); truth['paras']+=1; truth['words']+=len(t.split())
            if k<2: truth['sample'].append(t)
            if withimg and k==per//2:
                imgs+=1; p=os.path.join(OUT,'_c%d.png'%imgs); chart(p,imgs)
                story.append(KeepTogether([Spacer(1,6),RLImage(p,width=PW-110,height=(PW-110)*0.64),Paragraph('Figure %d. Plate number %d from the field notes.'%(imgs,imgs),cs)])); truth['figs']+=1
    doc.build(story)
    truth['pages']=doc.page
    return truth

# ---------- 2. two column + footnotes (ordered and interleaved) ----------
def twocol(path,interleaved):
    c=canvas.Canvas(path,pagesize=letter); PW,PH=letter
    truth={'paras':[],'foot':[],'title':'A Study of Quiet Roads'}
    lm,rm,gut=54,54,22; cw=(PW-lm-rm-gut)/2
    FS=10;LD=12.5
    def para_lines(txt): return simpleSplit(txt,'Serif',FS,cw)
    pages=3; fid=0
    for pg in range(pages):
        c.setFont('Serif',8); c.drawString(lm,PH-30,'JOURNAL OF QUIET ROADS — VOL 3'); c.drawRightString(PW-rm,PH-30,'Page %d'%(pg+1))
        top=PH-70
        if pg==0:
            c.setFont('SerifB',20); c.drawCentredString(PW/2,PH-80,truth['title'])
            c.setFont('Serif',10)
            abstract='Abstract. '+paragraph(5,6)
            ls=simpleSplit(abstract,'Serif',10,PW-lm-rm)
            y=PH-110
            for l in ls: c.drawString(lm,y,l); y-=13
            truth['paras'].append(abstract); top=y-16
        # build two columns of paragraphs
        cols=[[],[]]; foot=[]
        ycol=[top,top]; bottom=130
        col=0
        lines_by_col=[[],[]]
        npara=0
        while col<2:
            txt=paragraph(3,6)
            # add footnote marks
            fm=''
            if R.random()<0.7:
                fid+=1; truth['foot'].append('Note %d: see the appendix on gravel (%d).'%(fid,fid)); fm='@@%d@@'%fid
                foot.append((fid,truth['foot'][-1]))
                words=txt.split(); k=R.randint(3,len(words)-1); words[k]=words[k]+fm; txt=' '.join(words)
            ls=simpleSplit(txt.replace('@@','@@'),'Serif',FS,cw)
            need=len(ls)*LD+6
            if ycol[col]-need<bottom:
                col+=1
                continue
            lines_by_col[col].append(ls); ycol[col]-=need
            truth['paras'].append(txt.replace('@@',''))  # marks removed in truth
        # draw
        def drawline(x,y,l,sup=True):
            import re
            parts=re.split(r'@@(\d+)@@',l)
            t=c.beginText(x,y); t.setFont('Serif',FS)
            for i,pt in enumerate(parts):
                if i%2==0: t.textOut(pt)
                else:
                    t.setFont('Serif',6.5); t.setRise(4); t.textOut(pt); t.setRise(0); t.setFont('Serif',FS)
            c.drawText(t)
        seqL=[];seqR=[]
        for ci in (0,1):
            x=lm+ci*(cw+gut); y=top
            for ls in lines_by_col[ci]:
                for l in ls:
                    (seqL if ci==0 else seqR).append((x,y,l)); y-=LD
                y-=6
        if interleaved:
            order=[]
            for i in range(max(len(seqL),len(seqR))):
                if i<len(seqL): order.append(seqL[i])
                if i<len(seqR): order.append(seqR[i])
        else: order=seqL+seqR
        for x,y,l in order: drawline(x,y,l)
        # footnotes at bottom
        c.line(lm,118,lm+120,118)
        y=108
        for fid_,f in foot:
            c.setFont('Serif',7.5); c.drawString(lm,y,'%d %s'%(fid_,f)); y-=10
        c.showPage()
    c.save(); return truth

# ---------- 3. multilingual ----------
import re as _re
def uniq_paras(paras,n=9,seed=3):
    rr=random.Random(seed); sents=[]
    for p in paras: sents+=[x for x in _re.split(r'(?<=[.!?。।])\s*',p) if x]
    out=[];seen=set()
    while len(out)<n:
        k=rr.randint(3,4); t=''.join(rr.sample(sents,k)) if paras[0][0] in '很路傍' else ' '.join(rr.sample(sents,k))
        if t not in seen: seen.add(t);out.append(t)
    return out
def multilingual():
    langs={
     'fr':('FreeSerif.ttf',['Chapitre 1','Chapitre 2'],[
        "Il était une fois un village au bord de la rivière. Les habitants se levaient tôt, car le travail ne manquait jamais. « Bonjour, Madame Dupont ! » disait le boulanger chaque matin.",
        "La route était longue et poussiéreuse. M. Martin marchait lentement, pensant à sa famille. Il n'avait pas mangé depuis hier, mais il continuait quand même.",
        "Le soir, la lumière tombait doucement sur les toits. Personne ne parlait, et le silence était complet. Puis une cloche sonna au loin."]),
     'ru':('FreeSerif.ttf',['Глава 1','Глава 2'],[
        "В давние времена на берегу реки стояла маленькая деревня. Жители вставали рано, потому что работы всегда было много. «Доброе утро!» — говорил пекарь каждый день.",
        "Дорога была длинной и пыльной. Иван шёл медленно, думая о своей семье. Он ничего не ел со вчерашнего дня, но всё равно продолжал путь.",
        "Вечером свет мягко ложился на крыши. Никто не говорил, и тишина была полной. Потом вдалеке зазвонил колокол."]),
     'hi':('FreeSerif.ttf',['अध्याय 1','अध्याय 2'],[
        "बहुत समय पहले नदी के किनारे एक छोटा सा गाँव था। गाँव के लोग सुबह जल्दी उठते थे क्योंकि काम कभी कम नहीं होता था। हर सुबह नानबाई सबको नमस्ते कहता था।",
        "रास्ता लंबा और धूल भरा था। रामू धीरे-धीरे चल रहा था और अपने परिवार के बारे में सोच रहा था। उसने कल से कुछ नहीं खाया था, फिर भी वह चलता रहा।",
        "शाम को रोशनी छतों पर धीरे से उतर आई। कोई कुछ नहीं बोला और चारों ओर सन्नाटा था। फिर दूर कहीं घंटी बजी।"]),
     'de':('FreeSerif.ttf',['Kapitel 1','Kapitel 2'],[
        "Vor langer Zeit stand am Ufer eines Flusses ein kleines Dorf. Die Bewohner standen früh auf, denn Arbeit gab es immer genug. »Guten Morgen!« sagte der Bäcker jeden Tag.",
        "Der Weg war lang und staubig. Herr Müller ging langsam und dachte an seine Familie. Er hatte seit gestern nichts gegessen, aber er ging trotzdem weiter, z. B. bis zur Brücke.",
        "Am Abend fiel das Licht sanft auf die Dächer. Niemand sprach, und die Stille war vollkommen. Dann läutete in der Ferne eine Glocke."]),
    }
    for code,(ff,heads,paras) in langs.items():
        pdfmetrics.registerFont(TTFont('F_'+code,findfont(ff)))
        pdfmetrics.registerFont(TTFont('FB_'+code,findfont('FreeSerifBold.ttf')))
        c=canvas.Canvas(os.path.join(OUT,'lang_%s.pdf'%code),pagesize=letter);PW,PH=letter
        for pi,h in enumerate(heads):
            c.setFont('FB_'+code,22); c.drawString(72,PH-110,h)
            y=PH-160
            for para in uniq_paras(paras,9,3+pi):
                for rep in range(1):
                    ls=simpleSplit(para,'F_'+code,12,PW-144)
                    for i,l in enumerate(ls):
                        c.setFont('F_'+code,12); c.drawString(72+(20 if i==0 else 0),y,l); y-=16
                    y-=6
                if y<150: break
            c.showPage()
        c.save()
    # CJK (Noto Sans CJK ttc)
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    c=canvas.Canvas(os.path.join(OUT,'lang_zh.pdf'),pagesize=letter)
    zh=["很久以前，河边有一个小村庄。村民们起得很早，因为活儿总是做不完。每天早上，面包师都会向大家问好。","路又长又尘土飞扬。小明慢慢地走着，想着他的家人。他从昨天起就没有吃东西，但他还是继续往前走。","傍晚，光线轻轻地落在屋顶上。没有人说话，四周一片寂静。然后远处传来了钟声。"]
    for pi in range(2):
        c.setFont('STSong-Light',22); c.drawString(72,PH-110,'第%d章'%(pi+1)) if False else c.drawString(72,letter[1]-110,'第%d章'%(pi+1))
        y=letter[1]-160
        for para in uniq_paras(zh,9,5+pi):
            ls=simpleSplit(para,'STSong-Light',12,letter[0]-144)
            for l in ls: c.setFont('STSong-Light',12); c.drawString(72,y,l); y-=18
            y-=8
        c.showPage()
    c.save()

# ---------- 4. scanned (images only) ----------
def scanned():
    from PIL import Image, ImageDraw, ImageFont
    f=ImageFont.truetype(findfont('DejaVuSerif.ttf'),30)
    pages=[];texts=[]
    for i in range(6):
        im=Image.new('L',(1275,1650),255); d=ImageDraw.Draw(im); y=140
        paras=[paragraph(3,4) for _ in range(3)]
        texts.append(paras)
        for p in paras:
            for l in textwrap.wrap(p,62):
                d.text((120,y),l,font=f,fill=20); y+=42
            y+=24
        im.save(os.path.join(OUT,'_scan%d.png'%i)); pages.append(im)
    c=canvas.Canvas(os.path.join(OUT,'scanned.pdf'),pagesize=letter)
    for i in range(6):
        c.drawImage(os.path.join(OUT,'_scan%d.png'%i),0,0,width=letter[0],height=letter[1]); c.showPage()
    c.save(); json.dump(texts,open(os.path.join(OUT,'scanned_truth.json'),'w'))
    import subprocess
    ocr=[]
    for i in range(6):
        r=subprocess.run(['tesseract',os.path.join(OUT,'_scan%d.png'%i),'stdout','-l','eng'],capture_output=True,text=True)
        ocr.append(r.stdout)
    json.dump(ocr,open(os.path.join(OUT,'scanned_ocr.json'),'w'))

if __name__=='__main__':
    truth={}
    truth['novel400']=novel(os.path.join(OUT,'novel400.pdf'),400)
    truth['novel40']=novel(os.path.join(OUT,'novel40.pdf'),40)
    R.seed(11)
    truth['twocol']=twocol(os.path.join(OUT,'twocol.pdf'),False)
    R.seed(11)
    truth['twocol_i']=twocol(os.path.join(OUT,'twocol_i.pdf'),True)
    multilingual(); scanned()
    from pypdf import PdfReader,PdfWriter
    r=PdfReader(os.path.join(OUT,'novel40.pdf')); w=PdfWriter()
    for p in r.pages: w.add_page(p)
    w.encrypt('folio'); w.write(open(os.path.join(OUT,'locked.pdf'),'wb'))
    b=open(os.path.join(OUT,'novel40.pdf'),'rb').read(); open(os.path.join(OUT,'corrupt.pdf'),'wb').write(b[:len(b)//2])
    open(os.path.join(OUT,'notapdf.pdf'),'w').write('This is just a text file renamed to pdf.\n'*50)
    open(os.path.join(OUT,'plain.txt'),'w').write('\n\n'.join(paragraph() for _ in range(30)))
    json.dump(truth,open(os.path.join(OUT,'truth.json'),'w'))
    for k,v in truth.items(): print(k,{a:(b if not isinstance(b,list) else len(b)) for a,b in v.items()})
    for f in os.listdir(OUT):
        if f.startswith('_'): os.remove(os.path.join(OUT,f))
