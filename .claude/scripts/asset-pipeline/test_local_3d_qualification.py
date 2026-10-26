import importlib.util,json,tempfile,hashlib,unittest,sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('gate',Path(__file__).with_name('local-3d-qualification.py'));gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

class QualificationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.file=self.root/'case.json'
  def artifact(name,value):
   p=self.root/name;p.write_text(value if isinstance(value,str) else json.dumps(value));return {'path':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  self.artifact=artifact;asset=artifact('asset.glb','fixture bytes');base=artifact('source.txt','fixture');views=[artifact('front.png','front fixture'),artifact('back.png','back fixture')]
  deps={'reference':[],'weights':[],'latent':['reference','weights'],'decode':['latent','weights'],'extract':['decode'],'candidate':['extract'],'topology':['candidate'],'validator':['candidate'],'budget':['candidate'],'render':['candidate'],'preservation':['candidate'],'visual':['render','topology','validator','budget','preservation'],'geometry':['visual','reference']}
  stages=[{'id':name,'requires':req,'status':'pass','attempts':1,'max_attempts':2,'evidence':[base]} for name,req in deps.items()]
  self.data={'schema_version':2,'subject':{'object_id':'fixture-object','object_class':'fixture-only','source':base},'case_id':'fixture','asset':asset,'stages':stages,'holds':['texturing','delegation'],'loop_history':[]};self.nodes={x['id']:x for x in stages}
  receipt={'asset_sha256':asset['sha256'],'components':1,'boundary_edges':0,'nonmanifold_edges':0,'triangles':49990,'numErrors':0,'numWarnings':0,'max_vertex_to_raw_fraction_diagonal':.001,'relative_volume_change':0,'silhouette_iou':{'0':1}}
  for name in ['topology','validator','budget','preservation']:self.nodes[name]['receipt']=artifact(name+'.json',receipt)
  self.registry=self.root/'registry.json';self.registry.write_text(json.dumps({'schema_version':1,'reference_cases':[]}));identity=self.bind_case()
  self.nodes['render']['evidence']=views;self.nodes['visual']['receipt']=artifact('review.json',{**identity,'decision':'pass','reviewer':'unit-test fixture, not quality evidence','views':views,'criteria':['fixture']})
 def bind_case(self):
  identity={'case_id':self.data['case_id'],'object_id':self.data['subject']['object_id'],'object_class':self.data['subject']['object_class'],'source_sha256':self.data['subject']['source']['sha256'],'asset_sha256':self.data['asset']['sha256']}
  self.data['case_binding']=self.artifact('binding.json',identity);return identity
 def register_reference(self):
  self.file.write_text(json.dumps(self.data));case={**self.bind_case(),'graph':{'path':str(self.file),'sha256':hashlib.sha256(self.file.read_bytes()).hexdigest()}};self.registry.write_text(json.dumps({'schema_version':1,'reference_cases':[case]}))
 def tearDown(self): self.tmp.cleanup()
 def run_gate(self):self.file.write_text(json.dumps(self.data));return gate.evaluate(self.file,self.registry)
 def test_valid_graph(self):self.assertEqual(self.run_gate()['status'],'ACCEPTED_GEOMETRY_ONLY')
 def test_asset_drift(self):
  (self.root/'asset.glb').write_text('changed')
  with self.assertRaisesRegex(ValueError,'drift'):self.run_gate()
 def test_render_drift(self):
  (self.root/'front.png').write_text('changed')
  with self.assertRaisesRegex(ValueError,'drift'):self.run_gate()
 def test_cycle(self):
  self.nodes['reference']['requires']=['geometry']
  with self.assertRaisesRegex(ValueError,'cycle'):self.run_gate()
 def test_bypass(self):
  self.nodes['visual']['requires']=['render']
  with self.assertRaisesRegex(ValueError,'gate|dependency'):self.run_gate()
 def test_stale_review(self):
  review=json.loads((self.root/'review.json').read_text());review['asset_sha256']='0'*64;self.nodes['visual']['receipt']=self.artifact('review.json',review)
  with self.assertRaisesRegex(ValueError,'stale|another object'):self.run_gate()
 def test_topology_failure(self):
  r=json.loads((self.root/'topology.json').read_text());r['boundary_edges']=1;self.nodes['topology']['receipt']=self.artifact('topology.json',r)
  with self.assertRaisesRegex(ValueError,'Topology'):self.run_gate()
 def test_failed_parent(self):
  self.nodes['visual']['status']='fail'
  with self.assertRaisesRegex(ValueError,'blocked prerequisites'):self.run_gate()
 def test_exhausted_loop(self):
  self.nodes['visual']['status']='fail';self.nodes['visual']['attempts']=2;self.nodes['geometry']['status']='pending';self.nodes['geometry']['attempts']=0
  result=self.run_gate();self.assertEqual(result['status'],'NOT_ACCEPTED');self.assertIn('visual',result['exhausted_stages']);self.assertNotIn('geometry',result['ready_stages'])
 def test_preservation_failure(self):
  r=json.loads((self.root/'preservation.json').read_text());r['silhouette_iou']={'0':.8};self.nodes['preservation']['receipt']=self.artifact('preservation.json',r)
  with self.assertRaisesRegex(ValueError,'Preservation'):self.run_gate()
 def test_attempt_overrun(self):
  self.nodes['decode']['attempts']=3
  with self.assertRaisesRegex(ValueError,'Attempt'):self.run_gate()

 def test_renamed_case_cannot_reuse_binding(self):
  self.data['case_id']='other-case'
  with self.assertRaisesRegex(ValueError,'Case binding'):self.run_gate()
 def test_renamed_object_cannot_reuse_binding(self):
  self.data['subject']['object_id']='croissant'
  with self.assertRaisesRegex(ValueError,'Case binding'):self.run_gate()
 def test_new_source_cannot_reuse_binding(self):
  self.data['subject']['source']=self.artifact('other-source.txt','other object')
  with self.assertRaisesRegex(ValueError,'Case binding'):self.run_gate()
 def test_new_binding_cannot_borrow_visual_review(self):
  self.data['case_id']='new-case';self.bind_case()
  with self.assertRaisesRegex(ValueError,'Visual acceptance belongs'):self.run_gate()
 def test_reference_registry_accepts_frozen_graph(self):
  self.register_reference();self.assertTrue(self.run_gate()['retained_reference'])
 def test_registered_asset_cannot_transfer_even_with_relabelled_receipts(self):
  self.register_reference();self.data['case_id']='croissant-case';self.data['subject']['object_id']='croissant';self.data['subject']['source']=self.artifact('croissant.png','new object');self.nodes['reference']['evidence'].append(self.data['subject']['source']);identity=self.bind_case()
  review=json.loads((self.root/'review.json').read_text());review.update(identity);self.nodes['visual']['receipt']=self.artifact('review.json',review)
  with self.assertRaisesRegex(ValueError,'cannot transfer'):self.run_gate()
 def test_reference_graph_change_invalidates_registry(self):
  self.register_reference();self.data['extra']='changed retained graph'
  with self.assertRaisesRegex(ValueError,'graph drift'):self.run_gate()
 def test_duplicate_render_view_is_not_two_views(self):
  review=json.loads((self.root/'review.json').read_text());review['views']=[review['views'][0]]*2;self.nodes['visual']['receipt']=self.artifact('review.json',review)
  with self.assertRaisesRegex(ValueError,'unregistered render'):self.run_gate()

if __name__=='__main__':unittest.main()
