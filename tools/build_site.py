#!/usr/bin/env python3
"""Copies the web games into the site and adds the site menu button to each.

  index.html                  <- ../camp-hollowpine/game.html   (the front page)
  games/lamplight-cove/       <- ../lamplight-cove/game.html
  games/descent/              <- ../ocean-3d (index.html, css, js, vendor, icons)

Run it after rebuilding a game:  python tools/build_site.py
The game folders sit next to this repo on the Desktop; pass --src to point elsewhere.
"""
import argparse, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
        "%3Crect width='32' height='32' rx='8' fill='%232a2c30'/%3E%3Cg fill='%23e9ebee'%3E"
        "%3Crect x='7' y='7' width='7.5' height='7.5' rx='2'/%3E%3Crect x='17.5' y='7' width='7.5' height='7.5' rx='2'/%3E"
        "%3Crect x='7' y='17.5' width='7.5' height='7.5' rx='2'/%3E%3Crect x='17.5' y='17.5' width='7.5' height='7.5' rx='2' fill='%23ffb44f'/%3E"
        "%3C/g%3E%3C/svg%3E")

# Old links such as /?mall=1&tpl=aurora pointed at the pixel-game page, which is now mall.html.
LEGACY = """<script>
(function () {
  var q = location.search;
  if (!/[?&](mall|tpl|home|portfolio)=/.test(q)) return;
  var m = /[?&]tpl=([a-z]+)/i.exec(q);
  location.replace('mall.html' + (m ? '?tpl=' + m[1] : '') + location.hash);
})();
</script>
"""


def page(frag, title, desc, menu_src, head_extra='', dock=''):
    dock_attr = f' data-dock="{dock}"' if dock else ''
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'<meta name="description" content="{desc}">\n'
            f'<meta property="og:title" content="{title}">\n'
            f'<meta property="og:description" content="{desc}">\n'
            f'<link rel="icon" href="{ICON}">\n'
            + head_extra +
            '</head>\n<body>\n' + frag +
            f'<script src="{menu_src}" data-corner="tr"{dock_attr} defer></script>\n'
            '</body>\n</html>\n')


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('wrote', os.path.relpath(path, ROOT), len(text), 'bytes')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.dirname(ROOT), help='folder holding the game projects')
    src = ap.parse_args().src

    camp = open(os.path.join(src, 'camp-hollowpine', 'game.html'), encoding='utf-8').read()
    write(os.path.join(ROOT, 'index.html'), page(
        camp, 'Camp Hollowpine',
        'Camp Hollowpine: a summer-camp adventure game by John Gresh. Earn four badges, then go into the Hollow.',
        'assets/site-menu.js', head_extra=LEGACY, dock='#topright'))

    lamp = open(os.path.join(src, 'lamplight-cove', 'game.html'), encoding='utf-8').read()
    write(os.path.join(ROOT, 'games', 'lamplight-cove', 'index.html'), page(
        lamp, 'Lamplight Cove',
        'Lamplight Cove: a cozy lighthouse-island game by John Gresh.',
        '../../assets/site-menu.js', dock='#topright'))

    ocean = os.path.join(src, 'ocean-3d')
    dst = os.path.join(ROOT, 'games', 'descent')
    for d in ('css', 'js', 'vendor', 'icons'):
        shutil.rmtree(os.path.join(dst, d), ignore_errors=True)
        shutil.copytree(os.path.join(ocean, d), os.path.join(dst, d),
                        ignore=shutil.ignore_patterns('preview.html', '__pycache__'))
    html = open(os.path.join(ocean, 'index.html'), encoding='utf-8').read()
    tag = ('<style>#gui .top-r { right: 76px !important; }</style>\n'
           '<script src="../../assets/site-menu.js" data-corner="tr" defer></script>\n')
    assert '</body>' in html
    write(os.path.join(dst, 'index.html'), html.replace('</body>', tag + '</body>', 1))


if __name__ == '__main__':
    main()
