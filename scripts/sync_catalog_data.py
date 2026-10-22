"""把本轮客户端原表、最新官方活动公告同步到图鉴数据，保留既有原画。"""
from pathlib import Path
import argparse,base64,csv,hashlib,io,json,re,struct,sys
from embedded import extract
from client_text import ClientText
from catalog_labels import apply_labels
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
for key in ['tables','locale','calculator-data','news','output']:p.add_argument('--'+key,required=True,type=Path)
p.add_argument('--banner',type=Path,help='有新公告原图时传入；省略则保留当前已嵌入横幅')
p.add_argument('--catalog',required=True);p.add_argument('--as-of',required=True);args=p.parse_args()
sys.path.insert(0,r'D:\GodlyLove\_工作目录\角色活动图鉴\libs')
from opencc import OpenCC
from PIL import Image
sc=OpenCC('t2s').convert
page=(ROOT/'docs/catalog.html').read_text('utf8');data=extract(page,'DATA');assets=extract(page,'ASSETS');client=json.loads(args.calculator_data.read_text('utf8'));cards={c['id']:c for c in client['cards']}
client_assets=extract((ROOT/'docs/index.html').read_text('utf8'),'ASSETS')
for icon in list(client['elementIcons'].values())+list(client['jobIcons'].values()):
 assets.setdefault(icon,client_assets[icon])
def rows(name):
 with (args.tables/(name+'.txt')).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f,delimiter='@',quoting=csv.QUOTE_NONE))
tr=ClientText(args.locale,args.tables,sc)

def stats(row):
 d=dict(row['stats'])
 for k in ['HP','MaxHP','Attack','Defence','Speed']:
  v=struct.unpack('f',struct.pack('f',d[k]))[0];d[k]=round(v) if k in ['HP','MaxHP','Speed'] else int(v)
 return {'level':str(row['level']),**d}
def collect(v,out):
 if isinstance(v,dict):
  for k in ['FID','CheckID']:
   if v.get(k) in client['statuses']:out.add(v[k])
  out.update(s for s in v.get('FIDs',[]) if s in client['statuses'])
  for x in v.values():collect(x,out)
 elif isinstance(v,list):
  for x in v:collect(x,out)
items={r['ID']:r for r in rows('item')}
element_names={'None':'无属性','Fire':'红璇','Ice':'蓝澈','Earth':'绿琉','Ground':'黄曜','Light':'光','Dark':'暗'}
job_names={'Defender':'守护','Warrior':'戒律','Medic':'祈祷','Vanguard':'审判'}
def shown_configs(configs):return [{'field':x['field'],'value':x['value'] if x['key']=='Fun' else {x['key']:x['value']}} for x in configs]
def stage_rows(stages):return [{**x,'text':x['description'],'patches':[z['value'] if z['key']=='Fun' else {z['key']:z['value']} for z in x['configs']],'displayPatches':[z['value'] if z['key']=='Fun' else {z['key']:z['value']} for z in x.get('displayConfigs',x['configs'])]} for x in stages]
for c in data['cards']:
 src=cards[c['id']];raw=src['raw'];wanted={int(x['level']) for x in c['stats']};statuses=set();skilldata=[]
 for sid in src['skills']:
  sk=client['skills'].get(sid)
  if sk is None:continue
  collect(sk['configs'],statuses)
  skilldata.append({'id':sid,'name':sk['name'],'description':sk['description'],'damageTarget':sk['damageTarget'],'hidden':sid in src['hiddenSkills'],'passive':sk['raw']['SkillType']=='Passive','row':sk['raw'],'configs':shown_configs(sk['configs']),'displayConfigs':shown_configs(sk.get('displayConfigs',sk['configs']))})
 c.update(name=src['name'],rarity=src['rarity'],element=element_names[src['element']],job=job_names[src['job']],elementIcon=client['elementIcons'][src['element']],jobIcon=client['jobIcons'][src['job']],skills=skilldata,stats=[stats(x) for x in src['levelStats'] if x['level'] in wanted],statusIds=src['glossaryIds'],represents=raw['Represents'],imprint=stage_rows(src['imprint']),ascend=stage_rows(src['ascend']))
 item=items[c['id']];c['item_tags']=item['Tags'].split('~');c['version_gate']=raw['VersionControl'] or item['VersionControl']
 if c['rarity']=='R':c['availability']=src['availability'];c['availability_evidence']='角色与道具配置、常驻池标签已按当前资源目录核对。'
data['glossary']=client['glossary']
data['values'].update(Gt='大于或等于',Gtn='严格大于',Lt='小于或等于',Ltn='严格小于',Between='闭区间',CheckSkillNoUse='指定技能处于冷却中')
data['items']={r['ID']:tr(r['Name']) or r['ID'] for r in items.values()}
commodity_rows=rows('commodity');scene_rows=rows('scene');quest_rows=rows('quest');store_rows=rows('store');sign_rows=rows('signinreward');pass_rows=rows('battlepass');drop_rows=rows('drop')
def belongs(row,identifier):return identifier in (row.get('ActivityID','')+'~'+row.get('ActivityIDs','')).split('~')
data['dropLabels']={r['ShowRateName']:tr(r['ShowRateName']) for r in drop_rows if r.get('ShowRateName') and tr(r['ShowRateName'])}
data['drops']={identifier:[r for r in drop_rows if r['DropID']==identifier] for identifier in dict.fromkeys(r['DropID'] for r in drop_rows)}
for event in data['events']:
 # 同卡心选/签到与纪事分属不同活动；以Scene.Chapter直接归属关卡。
 event['scenes']=[{'id':raw['ID'],'chapter':raw['Chapter'],'name':tr(raw['Name']) or ('剧情关卡' if not any(raw.get(k) for k in ['WaveInfoJsonString','WaveInfo2JsonString','WaveInfo3JsonString']) else '战斗关卡'),'energy':raw['Energy'],'level':raw['RecommendedLevel'],'first_drop':raw['FirstDrop'],'reward':raw['RewardItems']} for raw in scene_rows if raw['Chapter']==event['id']]
 event_quests=[r for r in quest_rows if belongs(r,event['id'])]
 event_stores=[r for r in store_rows if belongs(r,event['id'])]
 event.update(quest_count=len(event_quests),questIds=[r['ID'] for r in event_quests],quest_names=[tr(r['Name']) for r in event_quests if tr(r['Name'])],storeIds=[r['ID'] for r in event_stores],stores=[tr(r['Name']) or r['ID'] for r in event_stores],sign_in_rows=[r for r in sign_rows if r['ActivityID']==event['id']],pass_rewards=[r for r in pass_rows if r['ActivityID']==event['id']])
 event['pass_ranks']=len(event['pass_rewards'])
 event['commodities']=[]
 for raw in commodity_rows:
  if belongs(raw,event['id']) and raw['OutList']!='TRUE':
   event['commodities'].append({**raw,'displayName':tr(raw['Name']) or data['items'].get(raw.get('ItemID',''),'') or raw['ID']})
news=json.loads(args.news.read_text('utf8'))['data']['news'];notice=next(n for n in news if n['newsId']==3617)
notice_id='news_3617'
news_records=[{'id':'news_'+str(n['newsId']),'name':sc(n['name']).strip(),'text':sc(n['intro']).replace('·','').replace('・',''),'url':'https://game.ero-labs.services/api/v2/announcement/news?lang=zh&nowPage=1&count=50&hgameId=242&labelId=0'} for n in news]
fresh_ids={n['id'] for n in news_records}
data['notices']=[x for x in data['notices'] if x['id'] not in fresh_ids]+news_records
if args.banner:
 im=Image.open(args.banner).convert('RGB');buf=io.BytesIO();im.save(buf,'WEBP',quality=96,method=4);blob=buf.getvalue();key=hashlib.sha256(blob).hexdigest()[:16];assets[key]='data:image/webp;base64,'+base64.b64encode(blob).decode()
else:
 key=next(e.get('art') for e in data['events'] if e['id']=='BranchC02_SSR_006')
 if not key or key not in assets:raise ValueError('当前横幅缺失，请用--banner提供公告原图')
for e in data['events']:
 if e['card']=='C02_SSR_006' and e['type'] in ['SideStory','SignIn','SummonPickUp']:
  e.update(officialId=notice_id,art=key,thumb=key)
  e['summary']={'SideStory':['琴键之间，听见彼此同频的悸动。','完成纪事关卡获得心弦节拍器，可兑换本期心选券、专属个人称号和养成道具。','纪事增益按活动羁绊的升星阶段提供全队能力与代币加成。'], 'SignIn':['活动期间累计签到七天，可获得共奏心音专用心选券及养成道具。'], 'SummonPickUp':['共奏心音限定心选开放，SSR基础概率1%，获得SSR时有50%概率为本期限定羁绊。','最多第70次获得SSR，每10次获得SR或更高稀有度羁绊。','活动结束后，本期限定羁绊暂时没有其他获取途径。']}[e['type']]
for c in data['cards']:
 if c['id']=='C02_SSR_006':c.update(availability='current_announced',status='当前限定纪事',availability_evidence='官方10月20日共奏心音活动公告明确开放，档期至11月3日14:00（UTC+8）。',limited_kind='纪事限定')
 if c['id']=='C04_SSR_006':c.update(availability='past_announced',status='往期限定纪事',availability_evidence='官方公告的活动结束时间为2026年10月20日14:00（UTC+8）。',limited_kind='往期纪事限定')
data.update(asof=args.as_of,catalog=args.catalog,featuredCard='C02_SSR_006',featuredDescription='琴键之间，听见彼此同频的悸动。')
data['eventDates']={'C04_SSR_006':'2026.10.06 活动开启后 — 10.20 14:00（已结束）','C01_SR_005':'2026.10.06 活动开启后 — 11.03 14:00','C03_SSR_001':'2026.10.13 活动开启后 — 10.27 05:00','C02_SSR_006':'2026.10.20 活动开启后 — 11.03 14:00'}
data['currentEventIds']=['BranchC02_SSR_006','ActivitySummonC02_SSR_006','ActivitySignInC02_SSR_006','BattlePassC01_SR_005','ActivitySummonC03_SSR_001']
apply_labels(data)
args.output.write_text(json.dumps({'data':data,'assets':assets},ensure_ascii=False,separators=(',',':')),'utf8')
print('catalog synchronized',len(data['cards']),'cards',len(data['events']),'events')
