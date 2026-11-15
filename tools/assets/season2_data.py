"""Organisers' final-teams Excel -> client/src/cup/season2.json (names, players A-D with replacements,
logo file, colour). Ages, phone numbers and the payment table are ignored on purpose.
python season2_data.py <xlsx> <colours.json> <out.json>"""
import json, re, sys
import openpyxl

xlsx, colours_path, out = sys.argv[1:4]
colours = json.load(open(colours_path))
ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
grid = [[(str(c) if c is not None else '') for c in row] for row in ws.iter_rows(values_only=True)]
H, W = len(grid), max(len(r) for r in grid)
cell = lambda r, c: grid[r][c].strip() if 0 <= r < H and c < len(grid[r]) else ''

TITLE = re.compile(r'^Team\s*(\d+)\s*-\s*(.+)$', re.I)
FIX_TEAM = {'THE DROP SHOT DONE': 'THE DROP SHOT DONS', 'SERVE - IVORS': 'SERVE-IVORS'}


def clean_player(v):
    v = re.sub(r'^[A-Da-d][\s ]{3,}', '', v)            # a stray category letter: "C<12 spaces> Mehul Jain"
    v = ' '.join(w for w in v.split() if '�' not in w)  # a word glued to garbage symbols
    v = re.sub(r'[^\x20-\x7EÀ-ɏ]', '', v)          # stray symbols (e.g. before "Mehul Jain")
    v = re.sub(r'\(\s*age[^)]*\)', '', v, flags=re.I)          # "(Age 12)"
    v = re.sub(r'\b\d+\s*yrs?\b', '', v, flags=re.I)           # "12 yrs"
    v = re.sub(r'[\s\-–]+$', '', v.strip())                    # trailing " -"
    v = re.sub(r'\s+', ' ', v).strip()
    words = []
    for w in v.split(' '):
        if len(w) > 2 and (w.islower() or w.isupper()):
            w = w[0].upper() + w[1:].lower()
        elif w.islower():
            w = w.capitalize()
        words.append(w)
    return ' '.join(words)


groups = [[]]
for r in range(H):
    for c in range(W):
        m = TITLE.match(cell(r, c))
        if not m:
            continue
        no, name = int(m.group(1)), re.sub(r'\s+', ' ', m.group(2)).strip()
        name = FIX_TEAM.get(name.upper(), name.upper())
        if groups[-1] and no <= groups[-1][-1]['no']:
            groups.append([])  # numbering restarts: the kids teams
        right = cell(r, c + 1)
        if right and right.lower() != 'replaced':
            # Main layout: players to the right, every other row (age/phone lines in between),
            # replacement in the next column.
            slots = [(r + 2 * k, c + 1, c + 2) for k in range(4)]
        else:
            # Kids layout: players below the title in the same column, replacement beside.
            slots = [(r + 1 + k, c, c + 1) for k in range(4)]
        players, replaced = {}, []
        for slot, (pr, pc, rc) in zip('ABCD', slots):
            original, sub = clean_player(cell(pr, pc)), clean_player(cell(pr, rc))
            if sub and sub.lower() != 'replaced':
                players[slot] = sub
                replaced.append(f'{slot}: {original} -> {sub}')
            else:
                players[slot] = original
        groups[-1].append({'no': no, 'name': name, 'players': players, 'replaced': replaced})

main, kids = groups[0], groups[1] if len(groups) > 1 else []
def finish(teams, prefix):
    out = []
    for t in teams:
        key = f'{prefix}{t["no"]:02d}'
        out.append({'name': t['name'], 'players': t['players'], 'logo': f's:{key}.webp', 'color': colours.get(key)})
    return out
data = {'season': 'ICC Pickleball Season 2', 'main': finish(main, 'm'), 'kids': finish(kids, 'k')}
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(data['main']), 'main teams,', len(data['kids']), 'kids teams')
for t in main + kids:
    print(f"{t['no']:>2} {t['name']:<28} " + ' | '.join(t['players'][s] for s in 'ABCD') + (f"   [replaced: {'; '.join(t['replaced'])}]" if t['replaced'] else ''))
