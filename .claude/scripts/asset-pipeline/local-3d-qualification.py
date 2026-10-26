"""Verify an evidence-bound local geometry qualification DAG; never submit GPU work."""
import argparse,hashlib,json,re,sys
from graphlib import TopologicalSorter,CycleError
from pathlib import Path

REQUIRED={'reference','weights','latent','decode','extract','candidate','topology','validator','budget','render','visual','geometry','preservation'}

def evaluate(file, registry=None):
 file=Path(file).resolve();data=json.loads(file.read_text(encoding='utf-8-sig'));stages=data['stages'];root=file.parent
 if data.get('schema_version')!=2: raise ValueError('A source-bound schema_version 2 graph is required')
 ids=[s['id'] for s in stages]
 if len(set(ids))!=len(ids) or not REQUIRED.issubset(ids): raise ValueError('Missing or duplicate required stage IDs')
 by_id={s['id']:s for s in stages};graph={s['id']:set(s['requires']) for s in stages}
 if any(p not in by_id for deps in graph.values() for p in deps): raise ValueError('Unknown prerequisite')
 try: order=list(TopologicalSorter(graph).static_order())
 except CycleError as e: raise ValueError('Pipeline graph has a cycle') from e
 def closure(node):
  found=set();todo=[node]
  while todo:
   current=todo.pop()
   for parent in graph[current]-found: found.add(parent);todo.append(parent)
  return found
 if not REQUIRED-{'geometry'} <= closure('geometry'): raise ValueError('Geometry bypasses a required gate')
 for child,parents in {'decode':{'latent','weights'},'extract':{'decode'},'candidate':{'extract'},'topology':{'candidate'},'validator':{'candidate'},'budget':{'candidate'},'render':{'candidate'},'preservation':{'candidate'},'visual':{'render','topology','validator','budget','preservation'},'geometry':{'visual','reference'}}.items():
  if not parents<=closure(child): raise ValueError(f'Missing required dependency edges: {child}')
 cached={}
 def check(item):
  expected=item['sha256'];path=Path(item['path']);path=path if path.is_absolute() else root/path
  if not re.fullmatch('[0-9a-f]{64}',expected): raise ValueError('Invalid evidence hash')
  key=str(path.resolve())
  if key not in cached:
   with path.open('rb') as stream: cached[key]=hashlib.file_digest(stream,'sha256').hexdigest()
  if cached[key]!=expected: raise ValueError(f'Evidence drift: {path}')
  return path
 asset=data['asset'];asset_path=check(asset);asset_hash=asset['sha256']
 subject=data['subject'];source=subject['source'];check(source)
 identity={'case_id':data['case_id'],'object_id':subject['object_id'],'object_class':subject['object_class'],'source_sha256':source['sha256'],'asset_sha256':asset_hash}
 if any(not value for value in identity.values()): raise ValueError('Incomplete case identity')
 binding=json.loads(check(data['case_binding']).read_text())
 if any(binding.get(k)!=v for k,v in identity.items()): raise ValueError('Case binding does not match this object/source/asset')
 if source['sha256'] not in {e['sha256'] for e in by_id['reference']['evidence']}: raise ValueError('Subject source is absent from reference-stage evidence')
 registry_path=Path(registry) if registry else Path(__file__).with_name('local-3d-reference-cases.json')
 catalog=json.loads(registry_path.read_text(encoding='utf-8-sig'))
 if catalog.get('schema_version')!=1: raise ValueError('Invalid reference registry schema')
 retained=False
 for case in catalog['reference_cases']:
  if case['case_id']==identity['case_id'] or case['asset_sha256']==asset_hash:
   if any(case.get(k)!=v for k,v in identity.items()): raise ValueError('Reference acceptance cannot transfer to another object/source/case')
   if hashlib.sha256(file.read_bytes()).hexdigest()!=case['graph']['sha256']: raise ValueError('Retained reference graph drift; use a new graph and independent review for a new case')
   retained=True
 for name in order:
  stage=by_id[name]
  if stage['status'] not in {'pass','fail','pending','hold'}: raise ValueError('Invalid stage status')
  if not 0<=stage['attempts']<=stage['max_attempts']<=3: raise ValueError('Attempt bound exceeded')
  if stage['status']=='pass':
   if any(by_id[p]['status']!='pass' for p in graph[name]): raise ValueError(f'Passed stage has blocked prerequisites: {name}')
   if not stage['evidence']: raise ValueError(f'Passed stage lacks evidence: {name}')
  for item in stage.get('evidence',[]): check(item)
 for name in ['topology','validator','budget','preservation']:
  stage=by_id[name]
  if stage['status']!='pass': continue
  receipt=json.loads(check(stage['receipt']).read_text())
  if receipt['asset_sha256']!=asset_hash: raise ValueError(f'{name} receipt bound to another asset')
  if name=='topology' and (receipt['components']!=1 or receipt['boundary_edges'] or receipt['nonmanifold_edges']): raise ValueError('Topology gate failed')
  if name=='validator' and (receipt['numErrors'] or receipt['numWarnings']): raise ValueError('Validator gate failed')
  if name=='budget' and (receipt['triangles']>100000 or receipt['triangles']<=0 or asset_path.stat().st_size>10*1024**2): raise ValueError('Runtime budget exceeded')
  if name=='preservation' and (receipt['max_vertex_to_raw_fraction_diagonal']>=.01 or abs(receipt['relative_volume_change'])>=.02 or min(receipt['silhouette_iou'].values())<.98): raise ValueError('Preservation gate failed')
 visual=by_id['visual']
 if visual['status']=='pass':
  review=json.loads(check(visual['receipt']).read_text())
  if any(review.get(k)!=v for k,v in identity.items()): raise ValueError('Visual acceptance belongs to another object/source/case')
  if review['asset_sha256']!=asset_hash or review['decision']!='pass' or not review['reviewer'] or len(review['views'])<2 or not review['criteria']: raise ValueError('Missing or stale visual acceptance')
  for view in review['views']: check(view)
  rendered={item['sha256'] for item in by_id['render']['evidence']}
  if len(set(v['sha256'] for v in review['views']))<2 or not set(v['sha256'] for v in review['views'])<=rendered: raise ValueError('Visual review uses unregistered render views')
 loops=data.get('loop_history',[])
 if len(loops)>3 or any(not x['hypothesis'] or not x['changed_factor'] or x['decision'] not in {'accept','reject'} for x in loops): raise ValueError('Unbounded or undocumented feedback loop')
 ready=[n for n in order if by_id[n]['status']=='pending' and by_id[n]['attempts']<by_id[n]['max_attempts'] and all(by_id[p]['status']=='pass' for p in graph[n])]
 accepted=by_id['geometry']['status']=='pass'
 return {'status':'ACCEPTED_GEOMETRY_ONLY' if accepted else 'NOT_ACCEPTED','case_id':data['case_id'],'object_id':subject['object_id'],'source_sha256':source['sha256'],'retained_reference':retained,'asset_sha256':asset_hash,'verified_files':len(cached),'order':order,'ready_stages':ready,'failed_stages':[n for n in order if by_id[n]['status']=='fail'],'exhausted_stages':[n for n in order if by_id[n]['status']=='fail' and by_id[n]['attempts']>=by_id[n]['max_attempts']],'holds':data['holds'],'scope':'Evidence and agent visual acceptance; not an independent human or texture acceptance'}

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--manifest',required=True);args=parser.parse_args()
 try: result=evaluate(args.manifest)
 except (ValueError,KeyError,OSError,TypeError) as e: print(json.dumps({'status':'INVALID_EVIDENCE','error':str(e)}));return 2
 print(json.dumps(result,indent=2));return 0 if result['status']=='ACCEPTED_GEOMETRY_ONLY' else 1

if __name__=='__main__':sys.exit(main())
