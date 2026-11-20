#!/usr/bin/env python3
"""Reproducible preproduction artwork; not a live animation or product demo.

Run from anywhere: python3 docs/storyboards/source/render_boards.py
Requires Python 3, Pillow and ImageMagick (`magick`). No app dependencies change.
"""
from __future__ import annotations

import hashlib
import html
import json
import math
from pathlib import Path
import random
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parents[1]
W, H = 1800, 1580
PAPER, INK, LIGHT = '#faf6ec', '#3f433f', '#a8aaa0'
GREEN, COPPER, WASH = '#527769', '#ab7549', '#e6ecdf'
FONT = '/usr/share/fonts/TTF/Comic.TTF'
FALLBACK_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
ROUTES = {
    'personal': ('01', 'Personal / A day with more intention', 'Dawn to dusk. Quiet agency. One continuous copper thread.', 'P'),
    'family': ('02', 'Family / The tomorrow we build together', 'A wider horizon, from tonight to the recipes we keep.', 'F'),
    'schools': ('03', 'Schools / Nourish the next generation', 'An optimistic school day. Meals worth looking forward to.', 'S'),
    'care': ('04', 'Care / Bring care to the table', 'Attention, steadiness and adult dignity. People before numbers.', 'C'),
}


def esc(value):
    return html.escape(str(value), quote=True)


def font(size):
    try:
        return ImageFont.truetype(FONT, int(size))
    except OSError:
        return ImageFont.truetype(FALLBACK_FONT, int(size))


def wrapped(value, width, size):
    result, line = [], ''
    face = font(size)
    for word in str(value).split():
        candidate = f'{line} {word}'.strip()
        if face.getlength(candidate) > width and line:
            result.append(line)
            line = word
        else:
            line = candidate
    if line:
        result.append(line)
    return result


class Sketch:
    def __init__(self, name):
        seed = int(hashlib.sha256(name.encode()).hexdigest()[:10], 16)
        self.rng = random.Random(seed)
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">',
                      f'<title id="title">{esc(name)}</title>',
                      '<desc id="desc">DietLedger pencil-style production storyboard. Concept illustrations, not product screenshots. Read the linked gallery for full text descriptions.</desc>',
                      f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
        # Quiet pencil-paper grain, generated deterministically without image assets.
        for _ in range(900):
            x, y = self.rng.uniform(0, W), self.rng.uniform(0, H)
            self.parts.append(f'<path d="M{x:.1f} {y:.1f}l2 .2" stroke="#c4b9a1" opacity=".13" stroke-width=".7"/>')

    def raw(self, value):
        self.parts.append(value)

    def group(self, x=0, y=0, scale=1, opacity=1):
        self.raw(f'<g transform="translate({x} {y}) scale({scale})" opacity="{opacity}">')

    def end(self):
        self.raw('</g>')

    def path(self, d, color=INK, width=2, fill='none', opacity=1):
        self.raw(f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}"/>')

    def line(self, x1, y1, x2, y2, color=INK, width=1.8, opacity=1):
        for stroke in range(2):
            points = []
            for i in range(5):
                t = i / 4
                j = .9 if stroke == 0 else 1.5
                points.append((x1+(x2-x1)*t+self.rng.uniform(-j,j), y1+(y2-y1)*t+self.rng.uniform(-j,j)))
            self.path('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in points),color,width if stroke==0 else .65,opacity=opacity if stroke==0 else opacity*.4)

    def rect(self, x, y, w, h, fill='none', color=INK, width=1.8):
        if fill != 'none':
            self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="{fill}"/>')
        for a,b,c,d in [(x,y,x+w,y),(x+w,y,x+w,y+h),(x+w,y+h,x,y+h),(x,y+h,x,y)]:
            self.line(a,b,c,d,color,width)

    def ellipse(self, x, y, rx, ry, color=INK, fill='none', width=1.8):
        pts=[]
        for i in range(49):
            t=i/48*math.tau
            pts.append((x+rx*math.cos(t)+self.rng.uniform(-.7,.7),y+ry*math.sin(t)+self.rng.uniform(-.7,.7)))
        self.path('M'+'L'.join(f'{a:.1f},{b:.1f}' for a,b in pts)+'Z',color,width,fill)

    def text(self, x, y, value, size=20, color=INK, weight='normal', anchor='start'):
        self.raw(f'<text x="{x}" y="{y}" fill="{color}" font-family="Comic Sans MS, DejaVu Sans, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{esc(value)}</text>')

    def paragraph(self, x, y, value, width, size=20, color=INK, leading=None, limit=None):
        lines=wrapped(value,width,size)
        if limit is not None and len(lines)>limit:
            raise ValueError(f'Text exceeds {limit} lines: {value}')
        for i,line in enumerate(lines):
            self.text(x,y+i*(leading or size*1.45),line,size,color)
        return y+len(lines)*(leading or size*1.45)

    def hatch(self, x, y, w, h, color=LIGHT):
        for i in range(0,int(w+h),12):
            a,b=max(0,i-h),min(w,i)
            self.line(x+a,y+min(h,i),x+b,y+max(0,i-w),color,.65,.45)

    def arrow(self, x1,y1,x2,y2,label=None):
        self.line(x1,y1,x2,y2,COPPER,2)
        angle=math.atan2(y2-y1,x2-x1)
        for delta in [-.45,.45]:
            self.line(x2,y2,x2-12*math.cos(angle+delta),y2-12*math.sin(angle+delta),COPPER,2)
        if label:
            self.text((x1+x2)/2,(y1+y2)/2-9,label,13,COPPER,anchor='middle')

    def logo(self,x,y,size=52):
        source=(ROOT/'public/logo.svg').read_text()
        # Embed the exact existing mark; do not redraw or replace the brand.
        body=source[source.index('>',source.index('<svg'))+1:source.rindex('</svg>')]
        self.raw(f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="0 0 30 30">{body}</svg>')

    def save(self, path):
        self.raw('</svg>')
        path.write_text('\n'.join(self.parts)+'\n')
        ET.parse(path)
        subprocess.run(['magick','-background',PAPER,str(path),'-strip',str(path.with_suffix('.png'))],check=True,capture_output=True)


# All visual primitives below are conceptual story illustrations, not fake app screenshots.
def sun(s,x,y,r=32,phase=1):
    s.ellipse(x,y,r,r,COPPER,'#f4e8c9')
    for i in range(round(4+phase*8)):
        a=i*math.tau/12
        s.line(x+(r+9)*math.cos(a),y+(r+9)*math.sin(a),x+(r+22)*math.cos(a),y+(r+22)*math.sin(a),COPPER,1)


def leaf(s,x,y,scale=1):
    s.group(x,y,scale)
    s.path('M0,18 Q-8,-16 19,-28 Q28,-1 0,18',GREEN,1.6,WASH)
    s.line(0,18,14,-21,GREEN,1.2)
    s.line(4,5,14,0,GREEN,1)
    s.line(7,-5,2,-12,GREEN,1)
    s.end()


def plate(s,x,y,r=39,meal=True):
    s.ellipse(x,y,r,r*.63,INK,'#fffdf7')
    s.ellipse(x,y,r*.77,r*.47,LIGHT,width=1)
    s.line(x-r-13,y-r*.5,x-r-13,y+r*.5)
    for i in [-4,0,4]: s.line(x-r-13+i,y-r*.5,x-r-13+i,y-r*.22,INK,1)
    s.line(x+r+13,y-r*.45,x+r+13,y+r*.5)
    if meal:
        s.ellipse(x-10,y,10,7,COPPER,'#e9d8b8')
        leaf(s,x+10,y+6,.45)
        s.ellipse(x+14,y-9,7,5,GREEN,WASH,1)


def table(s,x=360,y=172,w=440,settings=3):
    s.ellipse(x,y,w/2,70,INK,'#efe5d2')
    s.path(f'M{x-w/2+20},{y+30}L{x-w/2+17},{y+87} M{x+w/2-20},{y+30}L{x+w/2-17},{y+87}',LIGHT,2)
    for i in range(settings):
        px=x+(i-(settings-1)/2)*min(130,w/(settings+.2))
        plate(s,px,y,32)
    s.hatch(x-w/2+20,y+61,w-40,9)


def recipe(s,x,y,w=145,h=186,label='RECIPE',select=False):
    s.rect(x+5,y+6,w,h,'#e8e1d1',LIGHT,1)
    s.rect(x,y,w,h,'#fffdf6',GREEN if select else INK)
    s.rect(x+9,y+11,w-18,22,WASH,GREEN,1)
    s.text(x+w/2,y+27,label,12,GREEN,anchor='middle')
    plate(s,x+w/2,y+70,min(w*.2,28))
    for j,k in enumerate([.8,.6,.76]):
        s.line(x+15,y+110+j*17,x+15+(w-25)*k,y+110+j*17,LIGHT,1)
    if select: s.ellipse(x+w-12,y+7,9,9,COPPER,'#edddbf',1)


def calendar(s,x,y,w=265,h=175,entries=3):
    s.rect(x,y,w,h,'#fffdf6')
    s.line(x,y+34,x+w,y+34)
    for i in range(4):
        xx=x+i*w/3
        if i in (1,2): s.line(xx,y+34,xx,y+h,LIGHT,1)
    for i,day in enumerate(['MON','TUE','WED']):
        s.text(x+(i+.5)*w/3,y+23,day,12,GREEN,anchor='middle')
    s.line(x+12,y-6,x+12,y+7,COPPER,2)
    s.line(x+w-12,y-6,x+w-12,y+7,COPPER,2)
    for i in range(min(entries,6)):
        xx=x+12+(i%3)*w/3
        yy=y+53+(i//3)*49
        s.rect(xx,yy,w/3-24,33,WASH,GREEN,1)
        s.line(xx+7,yy+11,xx+w/3-32,yy+11,LIGHT,.8)
        s.line(xx+7,yy+22,xx+w/3-41,yy+22,LIGHT,.8)


def grocery(s,x,y,w=185,h=208,rows=4):
    s.rect(x+4,y+5,w,h,'#e7dfce',LIGHT,1)
    s.rect(x,y,w,h,'#fffdf6')
    s.text(x+14,y+28,'INGREDIENTS',14,GREEN)
    for i,name in enumerate(['Carrots','Lentils','Rice','Greens'][:rows]):
        yy=y+58+i*33
        s.rect(x+14,yy-9,10,10,'none',LIGHT,1)
        s.text(x+33,yy+1,name,12)
        s.line(x+33,yy+10,x+w-16,yy+10,LIGHT,.7)


def notes(s,x,y,rows=3,known=True):
    s.rect(x,y,164,144,'#fffdf6',LIGHT)
    s.text(x+12,y+25,'NUTRITION',13,GREEN)
    for i in range(rows):
        s.line(x+12,y+48+i*23,x+74,y+48+i*23,LIGHT,1)
        s.line(x+103,y+48+i*23,x+146,y+48+i*23,COPPER,2)
    if known: s.text(x+12,y+130,'Source / missing data',10,LIGHT)


def book(s,x,y,w=260,open_book=True):
    if open_book:
        s.path(f'M{x},{y+12}Q{x+w/4},{y-8} {x+w/2},{y+18}Q{x+w*.75},{y-8} {x+w},{y+12}L{x+w},{y+172}Q{x+w*.75},{y+155} {x+w/2},{y+178}Q{x+w/4},{y+155} {x},{y+172}Z',INK,2,'#f6ecd8')
        s.line(x+w/2,y+18,x+w/2,y+178,LIGHT,2)
        for col in [0,1]:
            for i in range(5): s.line(x+18+col*w/2,y+57+i*19,x+w/2-20+col*w/2,y+57+i*19,LIGHT,1)
        s.text(x+24,y+37,'RECIPES',12,GREEN)
    else:
        s.rect(x,y,w*.7,186,'#dfe6d9',GREEN,2)
        s.line(x+12,y,x+12,y+186,GREEN,1)
        s.logo(x+w*.35-30,y+24,60)
        s.text(x+w*.35,y+117,'OUR RECIPES',15,GREEN,anchor='middle')
        s.hatch(x+3,y+178,w*.7-6,5)


def workspace(s,x,y,w=290,h=180,pilot=False):
    s.group(x,y)
    s.raw(f'<g transform="scale({w/290} {h/180})">')
    s.rect(0,0,290,180,'#fffdf6')
    s.line(0,25,290,25,LIGHT,1)
    for i in range(3): s.ellipse(12+i*10,12,2,2,LIGHT,width=1)
    s.logo(13,39,38)
    s.text(58,61,'PILOT' if pilot else 'YOUR WORKSPACE',14,GREEN)
    for i,label in enumerate(['Recipes','Meal plan','Shopping list']):
        s.rect(15+i*90,82,78,55,WASH,GREEN,1)
        s.text(18+i*90,113,label,9,GREEN)
    s.text(15,165,'Concept only / fictional data' if pilot else 'Your instance / your database',10,LIGHT)
    s.end()
    s.end()


def person(s,x,y,scale=1,older=False):
    s.group(x,y,scale)
    s.ellipse(0,0,16,20,INK,'#f4ead7')
    s.path('M-18,-4 Q-20,-29 8,-24 Q22,-19 16,-3',LIGHT if older else INK,2)
    s.path('M-31,78 L-29,40 Q-16,25 -6,27 L8,27 Q26,29 31,45 L34,78',INK,2,WASH)
    s.path('M-28,48 L-45,69 L-2,76 M30,48 L44,68 L12,76',INK,1.5)
    if older:
        s.line(-12,0,-3,0,LIGHT,1)
        s.line(3,0,12,0,LIGHT,1)
        s.line(-3,0,3,0,LIGHT,.8)
    s.path('M-4,11 Q1,14 6,10',LIGHT,1)
    s.end()


def choices(s,three=True,reveal=1):
    labels=['MYSELF','FAMILY','PEOPLE IN MY CARE'] if three else ['SCHOOL MEALS','CARE FOR OTHERS']
    width=160 if three else 230
    for i,label in enumerate(labels[:max(0,math.ceil(len(labels)*reveal))]):
        x=360+(i-(len(labels)-1)/2)*(width+25)-width/2
        s.rect(x,191,width,53,'#edf0e6',GREEN)
        s.text(x+width/2,223,label,12,GREEN,anchor='middle')


def lerp(a,b,p): return a+(b-a)*p


def draw_scene(s,scene_id,p):
    """One distinct composition per scene; p is a storyboard keyframe, not time."""
    if scene_id=='O1':
        s.logo(330,18,60)
        if p>.15: s.ellipse(360,140,lerp(50,245,p),lerp(10,44,p),COPPER,'#f3e7ce')
        if p>.4:
            for x in [175,360,545]: s.ellipse(x,149,50*p,23*p,COPPER,'#f5eedc',1)
        if p>.85: choices(s,True,1)
        s.text(360,104,'THE NEXT CHAPTER',16,GREEN,anchor='middle')
    elif scene_id=='G1':
        table(s,360,97,160,1)
        if p>.1:
            s.arrow(320,146,190,188)
            s.arrow(400,146,530,188)
        if p>.2:
            s.path('M125,153 L190,119 L255,153 M135,150V179H245V150',LIGHT,1.5)
            s.ellipse(190,146,9,9,LIGHT,width=1)
        if p>.5: person(s,530,124,.6,True)
        if p>.85: choices(s,False,1)
    elif scene_id=='H1':
        if p<.5:
            workspace(s,lerp(220,60,min(p*3,1)),52,250,158)
            if p>.2:
                s.arrow(330,127,390,127)
                for i,label in enumerate(['GUIDE ME','TECHNICAL STEPS']):
                    s.rect(417,55+i*95,233,68,WASH,GREEN)
                    s.text(534,95+i*95,label,16,GREEN,anchor='middle')
        else:
            s.rect(70,39,245,174,'#fffdf6')
            s.text(192,70,'YOUR MACHINE',17,GREEN,anchor='middle')
            for i,label in enumerate(['DIETLEDGER APP','POSTGRESQL DATABASE']):
                s.rect(87,90+i*53,211,39,WASH,GREEN)
                s.text(192,114+i*53,label,12,GREEN,anchor='middle')
            if p>.8:
                s.arrow(328,130,418,130,'open in')
                workspace(s,435,54,217,142)
                s.text(542,38,'YOUR WEB BROWSER',13,GREEN,anchor='middle')
                s.text(542,246,'INSTALL GUIDE / CCL LICENSE',12,COPPER,anchor='middle')
            s.text(192,245,'UPDATES / ACCESS / BACKUPS',12,COPPER,anchor='middle')
    elif scene_id=='P1':
        sun(s,lerp(70,160,p),lerp(160,62,p),29,p)
        s.path('M38,229 Q300,210 675,229',LIGHT,1)
        s.group(opacity=.35)
        s.path(f'M{lerp(35,230,p)},20 l100,0 l150,225 l-100,0 Z',fill='#ead29c',color='none')
        s.end()
        recipe(s,lerp(305,275,p),55,170,190)
        for i in range(3):
            x=lerp([75,514,535][i],485,p)
            y=lerp([116,36,188][i],53+i*64,p)
            s.rect(x,y,105,44,'#f3ebd8',LIGHT,1)
            s.line(x+12,y+15,x+83,y+15,LIGHT,1)
            s.line(x+12,y+28,x+68,y+28,LIGHT,1)
        if p>.6: s.arrow(176,109,257,109,'clarity')
    elif scene_id=='P2':
        for i in [0,2,1]:
            active=i==1 and p>.6
            x=lerp(205+i*80, [90,290,505][i],p)
            y=lerp(50+i*10,19 if i==1 else 75,p)
            recipe(s,x,y,130 if not active else 156,173 if not active else 205,'SELECTED' if active else 'OPTION',active)
        if p>.5:
            s.text(360,255,'OPEN DETAILS / KEEP OTHER POSSIBILITIES',13,COPPER,anchor='middle')
    elif scene_id=='P3':
        recipe(s,lerp(60,280,p),lerp(38,70,p),110,153,'RECIPE')
        calendar(s,255,53,225,175,1+round(p*2))
        if p<.7: s.arrow(183,122,242,122)
        if p>.25:
            grocery(s,lerp(520,535,p),35,153,209,math.ceil(4*p))
            s.arrow(487,143,523,143)
        s.text(355,267,'RECIPE  >  PLAN  >  INGREDIENTS',13,COPPER,anchor='middle')
    elif scene_id=='P4':
        # A neutral day thread, not an improving health-results graph.
        s.path('M60,218 Q130,262 215,220 Q320,174 427,218 Q550,265 659,207',COPPER,2)
        for x in [100,240,380]: s.ellipse(x,223,5,5,COPPER,'#e6d4b1',1)
        if p<.66:
            s.rect(90,38,236,135,'#fffdf6')
            s.text(108,64,'FOOD LOG / ONE DAY',14,GREEN)
            for i,label in enumerate(['Breakfast','Lunch','Dinner'][:max(1,math.ceil(3*(1-p)))]):
                s.text(109,91+i*28,label,13)
                s.line(207,87+i*28,302,87+i*28,LIGHT,1)
            s.logo(442,67,70)
        if .2<p<.5:
            s.path('M86,218 Q335,265 453,158 Q480,134 476,112',COPPER,2)
        if .5<p<.9:
            s.path('M86,218 Q390,270 520,170 Q569,23 464,42 Q398,57 442,151 Q480,214 575,218',COPPER,2)
            s.logo(442,67,70)
        if p>.8:
            workspace(s,240,48,280,168)
            s.text(380,272,'NEXT / SELF-HOSTED SETUP',12,COPPER,anchor='middle')
    elif scene_id=='F1':
        if p<.7: recipe(s,lerp(80,285,p),40,138,182,'FAMILIAR RECIPE')
        if p>.2: table(s,lerp(455,360,p),167,lerp(230,500,p),max(1,math.ceil(p*3)))
        if p>.7:
            sun(s,102,55,24,p)
            s.text(360,269,"TONIGHT IS A PLACE TO START",13,COPPER,anchor='middle')
    elif scene_id=='F2':
        if p<.55:
            table(s,350,147,420,3)
        if p>.15: calendar(s,lerp(475,220,p),lerp(115,40,p),lerp(135,350,p),lerp(100,200,p),max(1,round(6*p)))
        if p>.65:
            s.arrow(119,160,200,160,'widen')
            s.text(400,270,'A WEEK WITH SOMEWHERE TO START',13,COPPER,anchor='middle')
    elif scene_id=='F3':
        calendar(s,60,63,265,175,4)
        grocery(s,490,33,174,215,max(1,round(p*4)))
        for i in range(max(1,math.ceil(3*p))):
            s.arrow(330,97+i*45,lerp(360,475,p),76+i*45)
        if p>.8: s.path('M55,249 Q340,240 681,249',LIGHT,2)
        s.text(345,268,'MEALS SHAPE THE LIST / NO STORE CHECKOUT',12,COPPER,anchor='middle')
    elif scene_id=='F4':
        if p<.15: book(s,120,47,300,True)
        elif p<.5: book(s,260,43,230,False)
        elif p<.85:
            book(s,115,43,230,False)
            s.arrow(300,133,365,133,'frame')
            s.rect(390,45,245,180,'#fffdf6',GREEN)
            s.logo(484,90,60)
        else: workspace(s,220,40,310,195)
        if p<.5:
            s.arrow(482,86,560,86,'close')
            s.text(491,177,'KEEP / PRINT',13,GREEN)
        s.path('M58,254 Q300,230 660,251',COPPER,1.5)
        if p>.85: s.text(380,275,'NEXT / FAMILY SETUP',12,COPPER,anchor='middle')
    elif scene_id=='S1':
        s.line(80,53,650,53,LIGHT,1)
        for x,label in [(125,'MORNING'),(350,'LUNCH'),(590,'AFTERNOON')]:
            s.ellipse(x,53,6,6,COPPER if label=='LUNCH' else LIGHT,'#f2e7d0',1)
            s.text(x,31,label,12,GREEN,anchor='middle')
        if p>.2:
            s.ellipse(350,53,lerp(6,24,p),lerp(6,24,p),COPPER,width=1)
            s.arrow(350,82,350,112)
        if p>.4: table(s,360,183,lerp(200,480,p),max(1,math.ceil(p*3)))
        if p>.85:
            s.path('M60,147L110,117L160,147M74,144V203H146V144',LIGHT,1)
    elif scene_id=='S2':
        for i,(x,y) in enumerate([(82,88),(128,182),(193,55)]):
            leaf(s,lerp(x,277,p),lerp(y,115,p),.7)
        recipe(s,275,38,155,200,'SAMPLE RECIPE',True)
        if p>.15: s.text(290,222,'4 SERVINGS / SAMPLE',10,GREEN)
        if p>.2:
            notes(s,lerp(650,487,p),72,rows=max(1,round(p*3)))
            s.arrow(439,142,475,142)
        s.text(362,267,'REPORTED FACTS / SOURCE / WHAT IS MISSING',12,COPPER,anchor='middle')
    elif scene_id=='S3':
        calendar(s,42,45,230,170,3)
        s.rect(320,197,358,35,'#eae2d3',LIGHT,1)
        if p>.1:
            grocery(s,lerp(365,448,p),24,170,178,max(1,round(4*p)))
            s.arrow(285,117,lerp(320,430,p),117)
        if p>.2: s.text(56,234,'2 SERVINGS / SAMPLE',11,GREEN)
        if p>.6:
            s.ellipse(346,179,27,8,LIGHT,'#f5eddf',1)
            s.line(326,165,360,165,LIGHT,1)
        s.text(360,266,'SAMPLE QUANTITIES / TEAM REVIEW REQUIRED',12,COPPER,anchor='middle')
    elif scene_id=='S4':
        if p<.7: table(s,360,lerp(170,210,p),lerp(510,190,p),3)
        if p>.15: workspace(s,lerp(490,220,p),lerp(24,35,p),lerp(135,300,p),lerp(90,185,p),True)
        if p>.8:
            s.text(360,264,'SMALL PILOT / FICTIONAL DATA / KITCHEN + IT REVIEW',12,COPPER,anchor='middle')
    elif scene_id=='C1':
        # Adults are shown seated at equal visual height, not as passive patients.
        if p>.2: person(s,240,87,.85,True)
        if p>.45: person(s,480,87,.85,False)
        table(s,360,199,390,2)
        if p>.15:
            leaf(s,173,204,.65)
            s.ellipse(550,188,16,7,COPPER,'#ead8b5',1)
        if p>.5:
            s.rect(57,82,105,64,'#f6edda',LIGHT,1)
            s.text(109,110,'FAVORITES',11,GREEN,anchor='middle')
            s.text(109,131,'ROUTINES',11,GREEN,anchor='middle')
        s.text(360,26,'PERSON FIRST / NO DIAGNOSIS OR MEDICAL CHART',12,COPPER,anchor='middle')
    elif scene_id=='C2':
        recipe(s,280,38,157,198,'RECIPE')
        if p>.45: notes(s,lerp(560,478,p),55,rows=max(1,round(3*p)),known=p>.8)
        if p>.15:
            s.rect(60,91,153,103,'#fffdf6',LIGHT)
            s.text(74,115,'INGREDIENTS',12,GREEN)
            for i in range(3): s.line(75,139+i*18,193,139+i*18,LIGHT,1)
            s.arrow(224,143,266,143)
        s.text(360,269,'CONTEXT / NOT CLINICAL CLEARANCE',12,COPPER,anchor='middle')
    elif scene_id=='C3':
        recipe(s,lerp(64,280,p),lerp(40,74,p),108,146)
        calendar(s,243,50,230,180,max(1,round(3*p)))
        grocery(s,535,36,145,202,max(1,round(4*p)))
        if p>.25:
            s.arrow(476,141,520,141)
            s.path('M55,252Q260,230 482,250T680,247',COPPER,1.2)
        s.text(360,276,'REVIEW THE PLAN AS A WHOLE',12,COPPER,anchor='middle')
    elif scene_id=='C4':
        if p<.6:
            table(s,360,170,420,2)
            person(s,250,68,.65,True)
            person(s,465,68,.65)
        if p>.25: workspace(s,lerp(470,215,p),lerp(25,40,p),lerp(155,310,p),lerp(100,190,p),True)
        s.text(360,273,'EVALUATE TOGETHER / BEFORE LIVE CARE USE',12,COPPER,anchor='middle')
    else:
        raise ValueError(f'No illustration for {scene_id}')


def heading(s,kicker,title,subtitle):
    s.text(70,47,'DIETLEDGER  /  ADVENTURE STUDIES',18,GREEN)
    s.text(1730,47,kicker,17,COPPER,anchor='end')
    s.text(70,104,title,36,weight='bold')
    s.paragraph(70,143,subtitle,1640,18,color=INK,limit=2)
    s.line(70,172,1730,172,LIGHT,1)


def panel(s,i,label,scene_id,p,caption,subline=None,cta=None):
    x,y=70+(i%2)*860,200+(i//2)*595
    s.rect(x,y,800,565,'#fffdf7',LIGHT,1)
    s.text(x+22,y+38,label,23,GREEN,weight='bold')
    s.rect(x+28,y+59,744,323,'#f8f4e9',LIGHT,1)
    for k in range(3): s.ellipse(x+41+k*10,y+72,2,2,LIGHT,width=1)
    s.text(x+756,y+77,'CONCEPT SKETCH',10,LIGHT,anchor='end')
    s.group(x+40,y+90)
    draw_scene(s,scene_id,p)
    s.end()
    end=s.paragraph(x+26,y+418,caption,745,21,limit=3)
    if subline:
        s.paragraph(x+26,max(end+11,y+476),subline,745,15,color=INK,limit=2)
    if cta:
        s.text(x+26,y+543,'NEXT  /  '+cta,14,COPPER)


def footer(s,line1,line2):
    s.line(70,1404,1730,1404,LIGHT,1)
    s.paragraph(70,1435,line1,1645,17,color=INK,limit=2)
    s.paragraph(70,1492,line2,1645,17,color=GREEN,limit=2)
    s.text(70,1553,'PREPRODUCTION / NATIVE HTML + SVG + CSS + JAVASCRIPT / NO VIDEO',13,COPPER)
    s.text(1730,1553,'Illustrations are not product screenshots or product proof.',12,INK,anchor='end')


def visible_boundary(scene_id):
    if scene_id=='S4':
        return 'BETA PILOT / Independently check school standards, safety, allergies, quantities and kitchen suitability.'
    if scene_id=='C4':
        return 'BETA / Not clinical. Review diets, allergies, texture, safety, privacy and organizational policy.'
    return None


def generate_boards(items):
    folder=OUT/'boards'
    folder.mkdir(parents=True,exist_ok=True)
    for route,(n,title,mood,prefix) in ROUTES.items():
        s=Sketch(title)
        heading(s,'PATH BOARD '+n,title,mood)
        scenes=[next(v for v in items if v['id']==f'{prefix}{i}') for i in range(1,5)]
        for i,scene in enumerate(scenes):
            progress=2/3 if scene['id']=='F4' else 1
            note=visible_boundary(scene['id']) or f"Motion: {scene['motion_name']} · Demo reference: {scene['demo']}"
            panel(s,i,scene['id']+' / '+scene['title'],scene['id'],progress,scene['headline'],note,scene['cta'])
        footer(s,'READING ORDER: 1 → 2 → 3 → 4. Visitor advances each chapter. Back / Change path / Set up stay available.',
               'Review the linked script for full copy. These are composition studies, not a finished interface or guaranteed outcomes.')
        s.save(folder/f'path-{route}.svg')
    s=Sketch('Shared flow / Invitation to ownership')
    heading(s,'SHARED FLOW','Shared flow / Invitation to ownership','Opening → three doors → care fork when relevant → one self-hosted setup destination.')
    shared=[next(v for v in items if v['id']==ident) for ident in ['O1','G1','H1','H1']]
    for i,scene in enumerate(shared):
        p=0 if i==2 else (1/3 if i==3 else 1)
        title=['O1 / The invitation','G1 / The care fork','H1 / Own workspace or pilot','H1 / Beginner or experienced'][i]
        caption=[scene['headline'],scene['headline'],'Now make it yours. / Begin with a small, thoughtful pilot.','Guide me through it. / Show me the technical steps.'][i]
        panel(s,i,title,scene['id'],p,caption,'Shared navigation / no forced wait / no personal health questionnaire')
    footer(s,'ROUTE MAP: Myself → P1–P4 | Family → F1–F4 | People in my care → Schools S1–S4 or Care C1–C4.',
           'H1 explains self-hosting, not automated deployment. The setup destination must retain beta status, responsibilities and CCL terms.')
    s.save(folder/'path-shared.svg')
    for scene in items:
        ident=scene['id']
        s=Sketch(f"{ident} / {scene['motion_name']}")
        heading(s,'ANIMATION KEYFRAMES',ident+' / '+scene['motion_name'],scene['headline'])
        for i,frame in enumerate(scene['frames']):
            note=visible_boundary(ident) if i==3 else None
            panel(s,i,f"{i+1:02d} / {frame['label']}",ident,i/3,frame['action'],note or f"Normalized progress: {round(i/3*100)}% · Sketch, not running animation")
        footer(s,'MOTION: '+scene['duration']+' / '+scene['implementation'],
               'REDUCED MOTION: '+scene['reduced_motion'])
        s.save(folder/f'animation-{ident.lower()}.svg')


def generate_contact_sheet():
    paths=[OUT/'boards'/f'path-{r}.png' for r in [*ROUTES,'shared']]
    img=Image.new('RGB',(1500,1080),PAPER)
    draw=ImageDraw.Draw(img)
    draw.text((32,20),'DietLedger / storyboard review map',font=font(32),fill=INK)
    for i,path in enumerate(paths):
        x=32+(i%3)*492
        y=82+(i//3)*486
        thumb=Image.open(path).convert('RGB')
        thumb.thumbnail((460,405))
        img.paste(thumb,(x,y))
        draw.text((x,y+413),path.stem.replace('path-','').title(),font=font(21),fill=INK)
    draw.text((1016,630),'4 story paths',font=font(30),fill=GREEN)
    draw.text((1016,685),'+ shared flow',font=font(24),fill=INK)
    draw.text((1016,745),'19 animation studies',font=font(25),fill=GREEN)
    draw.text((1016,800),'76 motion keyframes',font=font(23),fill=INK)
    img.save(OUT/'contact-sheet.png')


def generate_gallery(items):
    def links(stem):
        return f'<a href="boards/{stem}.png">Full-size PNG</a> · <a href="boards/{stem}.svg">Editable SVG</a>'

    def figure(stem,title,description):
        return f'<figure><a href="boards/{stem}.png"><img src="boards/{stem}.png" width="1800" height="1580" loading="lazy" alt="{esc(description)}"></a><figcaption><h3>{esc(title)}</h3>{links(stem)}</figcaption></figure>'

    chunks=['''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>DietLedger / storyboard review</title><style>
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#faf6ec;color:#313b35;font:17px/1.65 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:40px 24px}h1,h2{line-height:1.15}h1{font-size:clamp(30px,5vw,52px)}h2{margin:56px 0 18px;font-size:32px}h3{margin:4px 0 10px}a{color:#315f4e;text-underline-offset:4px}a:focus-visible{outline:3px solid #ab7549;outline-offset:4px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}nav a{padding:8px 13px;border:1px solid #b8b3a2;border-radius:5px}figure{margin:0 0 30px}figure img{display:block;width:100%;height:auto;border:1px solid #c8c1b1;background:#fff}figcaption{padding:14px 2px}.notice{padding:16px 20px;background:#e9ede2;border-left:4px solid #527769}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.scene{padding:25px 0;border-bottom:1px solid #c8c1b1}.notes{display:grid;grid-template-columns:1fr 1fr;gap:24px}summary{cursor:pointer;padding:10px 0;color:#315f4e;font-weight:650}.small{font-size:14px}.back{display:block;margin:20px 0}@media(max-width:760px){.grid,.notes{grid-template-columns:1fr}main{padding:22px 16px}}@media print{nav,.back{display:none}.grid,.notes{display:block}figure,.scene{break-inside:avoid}main{padding:0}}</style></head><body><main id="top">
    <p>DIETLEDGER / PREPRODUCTION / REVIEW EDITION</p><h1>The next chapter starts at your table.</h1>
    <p>Four sketch-style journey boards, a shared-flow board, and a separate four-keyframe board for every planned scene animation. Start with a route, then review its individual motion studies.</p>
    <p class="notice">Static sketches only—not videos or implemented animations. All miniature UI is conceptual, not screenshots or evidence of working features. Full visitor-facing copy lives in the <a href="../ideas/dietledger-adventure-scripts.md">draft scripts</a>. Motion is intended for native HTML, SVG, CSS and small JavaScript controllers.</p>
    <nav aria-label="Storyboard sections"><a href="#shared">Shared flow</a><a href="#personal">Personal</a><a href="#family">Family</a><a href="#schools">Schools</a><a href="#care">Care</a><a href="contact-sheet.png">Contact sheet</a><a href="README.md">Production notes</a></nav>''']
    for route in ['shared',*ROUTES]:
        title='Shared flow / Invitation to ownership' if route=='shared' else ROUTES[route][1]
        chunks.append(f'<section id="{route}"><h2>{esc(title)}</h2>')
        chunks.append(figure('path-'+route,title,'Four illustrated composition frames for '+title+'. Read the scene descriptions below.'))
        scenes=[v for v in items if v['route']==route]
        for scene in scenes:
            stem='animation-'+scene['id'].lower()
            chunks.append(f'<article class="scene" id="{scene["id"].lower()}"><h3>{esc(scene["id"]+" / "+scene["title"])}</h3><p><strong>{esc(scene["headline"])}</strong></p><p>{esc(scene["composition"])}</p>')
            chunks.append(f'<details><summary>Open animation storyboard: {esc(scene["motion_name"])}</summary>')
            chunks.append(figure(stem,scene['motion_name'],'Four keyframes: '+'; '.join(f['label']+': '+f['action'] for f in scene['frames'])))
            chunks.append('</details><div class="notes"><div><strong>Keyframe sequence</strong><ol>')
            for f in scene['frames']:
                chunks.append(f'<li><strong>{esc(f["label"])}:</strong> {esc(f["action"])}</li>')
            chunks.append('</ol></div><div>')
            for label,key in [('Timing / trigger','duration'),('Native technique','implementation'),('Reduced motion','reduced_motion'),('Guardrail','guardrail'),('Demo reference','demo'),('Exit / next','cta')]:
                chunks.append(f'<p class="small"><strong>{label}:</strong> {esc(scene[key])}</p>')
            chunks.append(f'<p>{links(stem)}</p></div></div></article>')
        chunks.append('<a class="back" href="#top">Back to review map ↑</a></section>')
    chunks.append('<footer><p>Browser motion only. No recorded or rendered media is generated by this package. Keep all stories readable without motion; allow Back, Change path and Set up at every chapter.</p></footer></main></body></html>')
    (OUT/'index.html').write_text('\n'.join(chunks)+'\n')


def load_items():
    items=[]
    for name in ['personal-family.json','care-school-shared.json']:
        items.extend(json.loads((OUT/'source'/name).read_text()))
    order=['O1','G1','H1']+[p+str(i) for p in ['P','F','S','C'] for i in range(1,5)]
    assert len(items)==19 and {v['id'] for v in items}==set(order)
    for v in items:
        assert len(v['frames'])==4, v['id']
        assert v['route'] in [*ROUTES,'shared'],v['id']
    return sorted(items,key=lambda v:order.index(v['id']))


def main():
    items=load_items()
    generate_boards(items)
    generate_contact_sheet()
    generate_gallery(items)
    (OUT/'source'/'manifest.json').write_text(json.dumps(items,indent=2,ensure_ascii=False)+'\n')
    print(f'Generated 5 path/shared boards, {len(items)} animation boards (76 keyframes), gallery and contact sheet.')


if __name__=='__main__':
    main()
