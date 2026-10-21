"""从原始客户端表同步既有站点，保留美术、页面功能及已授权的配置纠正。"""
from pathlib import Path
import argparse,copy,csv,hashlib,json,re,struct,sys
from embedded import extract
from client_text import ClientText
from client_presentation import enrich
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tables',required=True,type=Path);parser.add_argument('--locale',required=True,type=Path)
parser.add_argument('--catalog',required=True);parser.add_argument('--as-of',required=True)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
sys.path.insert(0,r'D:\GodlyLove\_工作目录\角色活动图鉴\libs')
import json5
from opencc import OpenCC
convert=OpenCC('t2s').convert
old=extract((ROOT/'docs/index.html').read_text('utf8'),'DATA');data=copy.deepcopy(old)
def rows(name):
 with (args.tables/(name+'.txt')).open(encoding='utf-8-sig',newline='') as stream:return list(csv.DictReader(stream,delimiter='@',quoting=csv.QUOTE_NONE))
tr=ClientText(args.locale,args.tables,convert)

def configs(row,prefix='DynamicField'):
 out=[]
 for field,raw in row.items():
  if not raw or '#' not in raw or not (field.startswith(prefix) or prefix=='DynamicField' and field.startswith('PassiveProp.DynamicField')):continue
  key,value=raw.split('#',1)
  try:value=json5.loads(value)
  except (ValueError,TypeError):pass
  out.append({'key':key,'value':value,'raw':raw,'field':field})
 return out
roles={r['ID']:r for r in rows('role')};properties=rows('roleproperty')
imprints=rows('roleimprint');ascends=rows('roleascend');skillrows={r['ID']:r for r in rows('skill')}
items={r['ID']:r for r in rows('item')};stat_fields=['HP','Attack','Defence','Speed','CriticalRate','CriticalDamageRate','EffectHitRate','ResistanceRate','PinchRate']
f32=lambda v:struct.unpack('<f',struct.pack('<f',v))[0]
def stage(table,rid):return [{**r,'description':tr(r['Description']),'configs':configs(r,'SkillProp.')} for r in table if r['RoleID']==rid]
for card in data['cards']:
 raw=roles[card['id']];slots=[v.split(':')[0] for v in raw['SkillIDs'].split('~') if v]
 levels=[]
 for base in properties:
  if base['ID']!=raw['RolePropertyID']:continue
  stats={key:float(base[key])*f32(float(raw[key]) if raw.get(key) else 1) for key in stat_fields if base.get(key)};stats['MaxHP']=stats.get('HP',0)
  levels.append({'level':int(base['LV']),'stats':stats,'raw':base})
 item=items.get(card['id'],{})
 name=tr(raw['NAME']) or tr(item.get('Name',''));previous_name=card.get('name') or '卡名缺失';name=name if name and not name.startswith(('T_','UI_')) else previous_name
 card.update(name=name,element=raw['Element'],job=raw['Job'],rarity={'3':'R','4':'SR','5':'SSR'}[raw['RarityLV']],raw=raw,itemRaw=item,configs=configs(raw),skills=slots,skillSlots=slots[:],hiddenSkills=[v.split(':')[0] for v in raw['SkillIDs'].split('~') if ':Hide' in v],levelStats=levels,imprint=stage(imprints,card['id']),ascend=stage(ascends,card['id']),ai=raw['AIs'].split('~') if raw['AIs'] else [])
 if card['rarity']=='R':card['availability']='current_base' if not raw['VersionControl'] and not item.get('VersionControl') and 'NormalR' in item.get('Tags','').split('~') else 'client_config'
 if card['id']=='C02_SSR_006':card['availability']='current_announced'
 if card['id']=='C04_SSR_006':card['availability']='past_announced'
for sid,previous in list(data['skills'].items()):
 raw=skillrows.get(sid)
 if raw is None:raise ValueError('既有技能在新表中消失：'+sid)
 record={'id':sid,'name':tr(raw['NAME']),'description':tr(raw['Description']),'raw':raw,'configs':configs(raw)}
 if not record['name'] or record['name'].startswith(('T_','UI_')):
  old_name=previous.get('name','')
  record['name']=old_name if old_name and not old_name.startswith(('T_','UI_')) else {'T_Skill_NAME_C01_SSR_014S3':'全体攻击'}.get(raw['NAME'],'辅助技能')
 # 仅当原始坏配置逐字段未变时，继续保留用户批准的最小纠正。
 if sid=='C03_SSR_012S1' and raw==previous['raw']:record['configs']=copy.deepcopy(previous['configs'])
 data['skills'][sid]=record
for raw in rows('status'):
 sid=raw['ID']
 if sid in data['statuses']:data['statuses'][sid]={'id':sid,'name':tr(raw['Name']),'description':tr(raw['Description']),'raw':raw,'configs':configs(raw)}
data['autoAI']=rows('aiaction')
for row in data['autoAI']:
 row['conditions']=[json5.loads(row[k]) for k in ['Condition1','Condition2','Condition3'] if row.get(k)]
 row['targets']=[json5.loads(row['TargetSetting'+str(i)]) for i in range(1,6) if row.get('TargetSetting'+str(i))]
data['publicVariables']={r['ID']:float(r['VALUE']) if r['VALUE'] else r['SValue'] for r in rows('publicvariable')}
data.update(roleProperties=properties,skillLevels=rows('skilllevel'),equipmentSets=rows('equipmentset'),catalog=args.catalog,asOf=args.as_of)
enrich(data,tr)
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),'utf8')
print(json.dumps({'cards':len(data['cards']),'skills':len(data['skills']),'catalog':data['catalog'],'builtInResistance':data['publicVariables']['BuildinResistance'],'output':str(args.output)},ensure_ascii=False))
