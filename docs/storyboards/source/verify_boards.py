#!/usr/bin/env python3
"""Validate this static artwork pack without starting the application."""
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET

from PIL import Image

BASE = Path(__file__).resolve().parents[1]
EXPECTED_IDS = {'O1', 'G1', 'H1'} | {p+str(i) for p in 'PFSC' for i in range(1, 5)}
EXPECTED_PATHS = {'path-personal', 'path-family', 'path-schools', 'path-care', 'path-shared'}


class Gallery(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = []
        self.images = []
        self.media = []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if 'id' in attr:
            self.ids.append(attr['id'])
        for key in ['href', 'src']:
            if key in attr:
                self.links.append(attr[key])
        if tag == 'img':
            self.images.append(attr)
        if tag in ['video', 'audio', 'iframe', 'script']:
            self.media.append(tag)


def main():
    items = json.loads((BASE/'source/manifest.json').read_text())
    assert len(items) == 19
    assert {x['id'] for x in items} == EXPECTED_IDS
    expected = EXPECTED_PATHS | {'animation-'+i.lower() for i in EXPECTED_IDS}
    assert {x.stem for x in (BASE/'boards').glob('*.svg')} == expected
    assert {x.stem for x in (BASE/'boards').glob('*.png')} == expected
    required = {'id', 'route', 'title', 'headline', 'composition', 'demo', 'cta',
                'motion_name', 'duration', 'implementation', 'reduced_motion', 'guardrail', 'frames'}
    input_items = []
    for name in ['personal-family.json', 'care-school-shared.json']:
        input_items += json.loads((BASE/'source'/name).read_text())
    assert sorted(input_items, key=lambda x:x['id']) == sorted(items, key=lambda x:x['id'])
    for item in items:
        assert set(item) == required, item['id']
        assert len(item['frames']) == 4
        assert len({f['action'] for f in item['frames']}) == 4
        for frame in item['frames']:
            assert set(frame) == {'label', 'action'}
            assert len(frame['action'].split()) <= 18, (item['id'], frame)
    for name in expected:
        svg = ET.parse(BASE/'boards'/f'{name}.svg').getroot()
        assert svg.attrib['viewBox'] == '0 0 1800 1580'
        assert svg.find('{http://www.w3.org/2000/svg}title') is not None
        with Image.open(BASE/'boards'/f'{name}.png') as im:
            assert im.size == (1800, 1580), name
            im.verify()
    with Image.open(BASE/'contact-sheet.png') as im:
        assert im.size == (1500, 1080)
        im.verify()
    gallery = Gallery()
    gallery.feed((BASE/'index.html').read_text())
    assert len(gallery.ids) == len(set(gallery.ids)), 'Duplicate HTML IDs'
    assert not gallery.media, gallery.media
    assert len(gallery.images) == 24
    assert all(i.get('alt') for i in gallery.images)
    for link in gallery.links:
        ref = urlsplit(link)
        assert not ref.scheme and not ref.netloc, f'Unexpected external resource: {link}'
        if ref.path:
            assert (BASE/unquote(ref.path)).is_file(), f'Missing local reference: {link}'
        elif ref.fragment:
            assert unquote(ref.fragment) in gallery.ids, f'Missing fragment: {link}'
    assert all(i.lower() in gallery.ids for i in EXPECTED_IDS)
    print('PASS: 19 unique scene IDs, 76 described keyframes, all metadata fields and source/manifest parity.')
    print('PASS: 24 SVGs parse; 24 PNGs have expected dimensions; contact sheet image validates.')
    print('PASS: gallery links/fragments resolve; alt text present; no scripts, video/audio, iframes or external resources.')


if __name__ == '__main__':
    main()
