"""Test books for margin sidebars (a narrow column of small italic epigraphs beside the main text, as in many trade paperbacks).
All text is invented. Writes into corpus/:
  sidebar_book.pdf    sidebar always on the left, ~5pt of white space after it (copies a real page that slipped past the first filter)
  sidebar_mirror.pdf  sidebar on the outer margin: left on even pages, right on odd pages
  smallprint.pdf      negative control: full-width small italic text and no main column beside it; nothing may be dropped
  ingredients.pdf     negative control: a narrow small-type list of short fragments (like recipe ingredients) beside the text; not a sidebar
plus <name>_truth.json for each (main paragraphs in order, words that only occur in sidebars).
Geometry: A5-ish page, 7pt italic sidebar, 9pt body, running head over the sidebar column.
"""
import random, json, os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus'); os.makedirs(OUT, exist_ok=True)
def findfont(name):
    for root, _, fs in os.walk('/usr/share/fonts'):
        if name in fs: return os.path.join(root, name)
    raise Exception(name)
pdfmetrics.registerFont(TTFont('Serif', findfont('FreeSerif.ttf')))
pdfmetrics.registerFont(TTFont('SerifI', findfont('FreeSerifItalic.ttf')))

PW, PH = 420, 594
SB_W = 79.5                       # sidebar column width
GAP = 5.0                         # white space between sidebar and main column
LM, RM = 37.0, 395.0              # outer text edges
FY0, FH = 41, 507

COMMON = 'the of and a to in he she it was that his her with as for had on at by from they said but not this have were an are which one you all there would their we him been when who will more no if out so what up its about into than them can only other some could time these then do first any my now such like our over most made after also did many before must through where much your way well should because each just those people how too little good very make still own see work long get here between both being never day same another know while last might great old year off come since against right used take three'.split()
NOUNS = 'road river house garden window letter winter morning village mother father stranger captain lantern harbour mountain bridge silence promise shadow journey kitchen candle orchard station market meadow bell clock engine ship wall door hand voice'.split()
VERBS = 'walked looked remembered carried opened closed followed waited whispered turned climbed lifted answered watched crossed noticed gathered covered reached'.split()
ADJ = 'old quiet narrow heavy pale distant careful strange gentle sudden bright empty crooked familiar'.split()
# sidebar vocabulary: words that never occur in the main text, so any of them in the output is a leak
SBW = 'marble tidewater cormorant juniper vellum alabaster nightingale saffron obsidian thistle amber pavilion lagoon fresco chalice minaret pomegranate turquoise zephyr olive terracotta falcon cypress mosaic quartz heron lilac granite aqueduct sapphire dune ivory'.split()
SB_FILL = 'the of and in to a with from that was his her they came over under beside through among before after'.split()

main_style = ParagraphStyle('m', fontName='Serif', fontSize=9, leading=11.3, firstLineIndent=12, alignment=4, spaceAfter=0)
small_style = ParagraphStyle('sm', fontName='SerifI', fontSize=7, leading=8.8, firstLineIndent=10, alignment=4, spaceAfter=0)
sb_right = ParagraphStyle('sr', fontName='SerifI', fontSize=7, leading=8.5, alignment=2, spaceAfter=3)
sb_left = ParagraphStyle('sl', fontName='SerifI', fontSize=7, leading=8.5, alignment=0, spaceAfter=3)
sb_just = ParagraphStyle('sj', fontName='SerifI', fontSize=7, leading=8.5, alignment=4, spaceAfter=3)
sb_attr = ParagraphStyle('sa', fontName='Serif', fontSize=5.8, leading=7.2, alignment=2, spaceAfter=15)

def build(name, seed, mirror=False, small_only=False, npages=14, ingredients=False):
    R = random.Random(seed)
    def main_sentence():
        n = R.randint(8, 22); w = [R.choice(['The', 'A', 'Her', 'His', 'Their', 'Every', 'Some', 'Nothing', 'Later'])]
        while len(w) < n:
            r = R.random()
            w.append(R.choice(ADJ) if r < .2 else R.choice(NOUNS) if r < .45 else R.choice(VERBS) if r < .6 else R.choice(COMMON))
        return ' '.join(w) + R.choice(['.', '.', '.', '!', '?'])
    def main_para(a=4, b=8): return ' '.join(main_sentence() for _ in range(R.randint(a, b)))
    def sb_sentence():
        n = R.randint(7, 14); w = []
        while len(w) < n: w.append(R.choice(SBW) if R.random() < .45 else R.choice(SB_FILL))
        s = ' '.join(w); return s[0].upper() + s[1:] + '.'
    def sb_block(nsent):
        if nsent == 'short':   # a three-line note of real prose: under four rows, too little for one page to prove a sidebar alone
            return 'The %s came over the %s and the %s.' % (R.choice(SBW), R.choice(SBW), R.choice(SBW))
        return ' '.join(sb_sentence() for _ in range(nsent))
    def ing_block(n):   # short fragments, no sentence punctuation: "3 cups marble flour"
        units = ['cup', 'cups', 'tsp', 'tbsp', 'handful of', 'pinch of']
        return '<br/>'.join('%d %s %s %s' % (R.randint(1, 9), R.choice(units), R.choice(SBW), R.choice(SBW)) for _ in range(n))
    truth = {'paras': [], 'sidebar_words': SBW, 'pages': npages, 'ingredients': ingredients}
    c = canvas.Canvas(os.path.join(OUT, name + '.pdf'), pagesize=(PW, PH))
    # which sidebar blocks go on which page: (style, sentences); page 7 also has a SHORT main column; 11-12 are sparse
    plan = {3: [(sb_right, 5), (sb_just, 4), (sb_right, 3)], 4: [(sb_just, 4), (sb_right, 5), (sb_left, 4)],
            5: [(sb_right, 6), (sb_right, 5), (sb_just, 3)], 6: [(sb_left, 5), (sb_just, 6), (sb_right, 3)],
            7: [(sb_right, 5), (sb_just, 5), (sb_right, 4)], 8: [(sb_just, 5), (sb_right, 4), (sb_just, 5)],
            9: [(sb_right, 4), (sb_left, 5), (sb_right, 3)], 10: [(sb_right, 5), (sb_just, 4)],
            11: [(sb_right, 1)], 12: [(sb_just, 'short')]}
    noattr = {12}
    pending = []
    def new_main(n):
        out = []
        for _ in range(n):
            t = main_para(); truth['paras'].append(t); out.append(Paragraph(t, small_style if small_only else main_style))
        return out
    pending += new_main(60)
    for pg in range(1, npages + 1):
        sb_on_left = (pg % 2 == 0) if mirror else True
        sb_x0 = LM if sb_on_left else RM - SB_W
        main_x0 = (LM + SB_W + GAP) if sb_on_left else LM
        main_x1 = RM if sb_on_left else (RM - SB_W - GAP)
        if small_only: main_x0, main_x1 = LM, RM
        c.setFont('SerifI', 7.5)
        if sb_on_left: c.drawString(LM, PH - 30, '%d  •  The Sample Book' % pg)
        else: c.drawRightString(RM, PH - 30, 'The Sample Book  •  %d' % pg)
        mf = Frame(main_x0, FY0, main_x1 - main_x0, FH, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        if pg == 7 and not small_only:
            mf.addFromList([pending.pop(0)], c)
        else:
            if len(pending) < 12: pending += new_main(40)
            mf.addFromList(pending, c)
        if pg in plan and not small_only:
            story = []
            for st, ns in plan[pg]:
                story.append(Paragraph(ing_block(7) if ingredients else sb_block(ns), st))
                if pg not in noattr and not ingredients: story.append(Paragraph('—' + ' '.join(R.choice(SBW).upper() for _ in range(3)) + ', BOOK ' + str(R.randint(2, 12)), sb_attr))
            sf = Frame(sb_x0, FY0, SB_W, FH, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
            sf.addFromList(story, c)
            assert not story, 'sidebar overflow on page %d' % pg
        c.showPage()
    c.save()
    # paragraphs never placed (still waiting in `pending`) are not in the PDF; a split one at the front is dropped too, which is harmless
    truth['paras'] = truth['paras'][:len(truth['paras']) - len(pending)]
    json.dump(truth, open(os.path.join(OUT, name + '_truth.json'), 'w'))
    print(name, {'pages': npages, 'paras': len(truth['paras'])})

build('sidebar_book', 11)
build('sidebar_mirror', 12, mirror=True)
build('smallprint', 13, small_only=True, npages=8)
build('ingredients', 14, ingredients=True, npages=10)
