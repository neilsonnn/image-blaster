import bpy,bmesh,json,math,hashlib,argparse,sys
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
parser=argparse.ArgumentParser(description='Bounded, reference-reviewed ceramic-wall fairing; geometry only')
parser.add_argument('--input',required=True);parser.add_argument('--output-dir',required=True);parser.add_argument('--iterations',type=int,nargs='+',required=True);parser.add_argument('--surface-class',choices=['smooth-ceramic'],required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
if not 1<=len(args.iterations)<=3 or any(x<1 or x>180 for x in args.iterations): parser.error('Choose one to three iteration counts in 1..180')
source=Path(args.input).resolve();P=Path(args.output_dir).resolve();P.mkdir(parents=True,exist_ok=True)
if any((P/f'fair-{n}').exists() for n in args.iterations): raise RuntimeError('Existing candidate: inspect it; do not overwrite')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=obj
bm=bmesh.new();bm.from_mesh(obj.data);reference=BVHTree.FromBMesh(bm);volume=abs(bm.calc_volume());bm.free()
mod=obj.modifiers.new('QEM 50k','DECIMATE');mod.ratio=49990/len(obj.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name)
base=obj.data.copy();zs=[v.co.z for v in base.vertices];lo=min(zs);hi=max(zs);h=hi-lo
low=[v.co.x for v in base.vertices if v.co.z<lo+.12*h];body_right=max(low);width=max(low)-min(low)
def ramp(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
records=[]
for iterations in args.iterations:
 obj.data=base.copy();group=obj.vertex_groups.get('ceramic-wall') or obj.vertex_groups.new(name='ceramic-wall')
 weights=[]
 for v in obj.data.vertices:
  weight=ramp(lo+.08*h,lo+.2*h,v.co.z)*ramp(hi-.08*h,hi-.2*h,v.co.z)*(1-ramp(body_right-.18*width,body_right+.08*width,v.co.x));weights.append(weight);group.add([v.index],weight,'REPLACE')
 if iterations:
  mod=obj.modifiers.new('Bounded ceramic-wall fairing','LAPLACIANSMOOTH');mod.iterations=iterations;mod.lambda_factor=.3;mod.use_volume_preserve=True;mod.use_normalized=True;mod.vertex_group=group.name;bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in obj.data.polygons:f.use_smooth=True
 bm=bmesh.new();bm.from_mesh(obj.data);dist=[reference.find_nearest(v.co)[3] for v in bm.verts];vol=abs(bm.calc_volume());bounds=[Vector((min(v.co[i] for v in bm.verts),max(v.co[i] for v in bm.verts))) for i in range(3)];diagonal=math.sqrt(sum((x[1]-x[0])**2 for x in bounds))
 rec={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'iterations':iterations,'triangles':len(bm.faces),'vertices':len(bm.verts),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'euler':len(bm.verts)-len(bm.edges)+len(bm.faces),'relative_volume_change':vol/volume-1,'max_vertex_to_raw_distance':max(dist),'max_vertex_to_raw_fraction_diagonal':max(dist)/diagonal,'lambda':.3,'profile':'smooth ceramic wall only; rim/base/handle protected with tapered vertex weights','distance_scope':'one-sided output vertices to raw surface; not Hausdorff or source accuracy'}
 bm.free();out=P/f'fair-{iterations}';out.mkdir(exist_ok=True);bpy.ops.export_scene.gltf(filepath=str(out/'runtime.glb'),export_format='GLB');rec['sha256']=hashlib.sha256((out/'runtime.glb').read_bytes()).hexdigest();rec['numeric_gate']=rec['boundary_edges']==0 and rec['nonmanifold_edges']==0 and rec['euler']==0 and abs(rec['relative_volume_change'])<.02 and rec['max_vertex_to_raw_fraction_diagonal']<.01
 (out/'metrics.json').write_text(json.dumps(rec,indent=2));records.append(rec);print(rec,flush=True)
(P/'candidate-metrics.json').write_text(json.dumps(records,indent=2))
