from pathlib import Path
import re, json, sys
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/generate-seed.py PATH_TO_HB-AsasdeFerro.txt')
source = Path(sys.argv[1]).read_text(encoding='utf-8')
start_tag = re.compile(r'\{\{location\s*\n### (.+?)\n\}\}', re.MULTILINE)
marks = list(start_tag.finditer(source))
expected = ['Avalon', 'Bolívar', 'Columbia']
entries=[]
for idx,name in enumerate(expected):
    mark=next(m for m in marks if m.group(1)==name)
    end=next(m.start() for m in marks if m.start()>mark.start())
    raw=source[mark.end():end]
    raw='\n'.join(line for line in raw.splitlines() if not line.strip().startswith('![]') and line.strip()!='\\page').strip()
    # Paragraphs only, untouched words/markup; source-specific pagination is removed.
    paras=[p.strip('\n') for p in re.split(r'\n\s*\n',raw) if p.strip()]
    splits={'Avalon':(3,5),'Bolívar':(3,7),'Columbia':(4,7)}
    a,b=splits[name]
    assert len(paras) == {'Avalon':8,'Bolívar':12,'Columbia':12}[name],(name,len(paras))
    def join(batch): return '\n\n'.join(batch)
    parts={'general':join(paras[:a]),'specific':join(paras[a:b]),'professional':join(paras[b:])}
    assert join([parts[k] for k in ['general','specific','professional']]) == join(paras)
    entry={'slug':{'Avalon':'avalon','Bolívar':'bolivar','Columbia':'columbia'}[name], 'title':name, 'category':'Localidades', 'summary':'', 'tags':{'Avalon':['Ilhas Grandes','Espíritos','Natureza'], 'Bolívar':['Ilhas Grandes','Guerra','Política'], 'Columbia':['Ilhas Grandes','Engenharia Elemental','Política']}[name], 'aliases':[], 'publicLevel':0,'content':parts,'updatedAt':'2026-11-08T00:00:00.000Z'}
    entries.append(entry)
    print(name, len(paras), [len(paras[:a]),len(paras[a:b]),len(paras[b:])], 'chars',len(join(paras)))
output='// Original location passages, split by knowledge level.\nexport const initialCodices = '+json.dumps(entries, ensure_ascii=False, indent=2)+';\n'
Path(__file__).resolve().parents[1].joinpath('netlify/functions/seed.mjs').write_text(output,encoding='utf-8')
