# cmp.py BEFORE_DIR AFTER_DIR OUT_DIR: old-vs-new sheets of the six README/og images (GIFs: 3 frames each)
import sys
from PIL import Image, ImageDraw, ImageFont, ImageSequence
F=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',26)
def lab(im,t):
    im=im.convert('RGB')
    if t:
        d=ImageDraw.Draw(im); w=d.textlength(t,font=F); d.rectangle([0,0,w+20,40],fill=(0,0,0)); d.text((10,6),t,fill='white',font=F)
    return im
def grid(rows,out,w):
    rows=[[lab(im.resize((w,int(im.height*w/im.width)),Image.LANCZOS),t) for im,t in r] for r in rows]
    H=sum(max(i.height for i in r) for r in rows); W=max(sum(i.width for i in r) for r in rows)
    o=Image.new('RGB',(W,H),'white'); y=0
    for r in rows:
        x=0
        for i in r: o.paste(i,(x,y)); x+=i.width
        y+=max(i.height for i in r)
    o.save(out,quality=88)
def frames(p,idx):
    fs=[f.copy() for f in ImageSequence.Iterator(Image.open(p))]; return [fs[i] for i in idx], len(fs)
B, A, D = (a.rstrip('/') + '/' for a in sys.argv[1:4])
O=Image.open
for n in ['og.jpg','og.en.jpg','readme-hero.jpg','readme-hero.en.jpg']:
    grid([[(O(B+n),'OLD '+n)],[(O(A+n),'NEW '+n)]],D+'cmp-'+n.replace('.jpg','')+'.jpg',1200)
grid([[(O(B+'og.jpg'),'OLD 500px'),(O(A+'og.jpg'),'NEW 500px (thumbnail)')]],D+'cmp-og-thumb.jpg',500)
for g in ['readme-lap','readme-lap.en']:
    ob,n1=frames(B+g+'.gif',[0,18,40]); nw,n2=frames(A+g+'.gif',[0,18,40])
    print(g,n1,n2)
    grid([[(f,'OLD f%d'%i) for f,i in zip(ob,[0,18,40])],[(f,'NEW f%d'%i) for f,i in zip(nw,[0,18,40])]],D+f'cmp-{g}.jpg',560)
