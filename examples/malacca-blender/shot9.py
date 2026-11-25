import bpy, numpy as np, math, time, sys, random, os
args = sys.argv[sys.argv.index('--')+1:]
mode = args[0]; val = int(args[1]); W = int(args[2]); H = int(args[3]); SAMP = int(args[4])
FRAMES = int(os.environ.get('FRAMES','72'))
SHIP_SCALE = 0.006
crop = np.load('crop3.npy')
rows, cols = crop.shape
KM_X, KM_Y = 1.1*111.2, 0.7*111.2
EXAG = 2.0
zs = np.load('zhi.npy'); h = np.maximum(zs, 0)/1000.0*EXAG
rows, cols = zs.shape
xs = (259 + 2*np.arange(cols))*0.030889; ys = KM_Y - 2*np.arange(rows)*0.030889
X, Y = np.meshgrid(xs, ys)
Z = zs/1000.0*EXAG
verts = np.stack([X, Y, Z], -1).reshape(-1, 3).astype('float32')
idx = np.arange(rows*cols).reshape(rows, cols)
quads = np.stack([idx[:-1,:-1], idx[:-1,1:], idx[1:,1:], idx[1:,:-1]], -1).reshape(-1, 4)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.eevee.taa_render_samples = SAMP
sc.frame_start, sc.frame_end = 1, FRAMES
sc.render.fps = 24
mesh = bpy.data.meshes.new('terrain')
mesh.vertices.add(len(verts)); mesh.vertices.foreach_set('co', verts.ravel())
mesh.loops.add(quads.size); mesh.loops.foreach_set('vertex_index', quads.ravel())
mesh.polygons.add(len(quads))
mesh.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype='int32'))
mesh.polygons.foreach_set('loop_total', np.full(len(quads), 4, dtype='int32'))
mesh.update(); mesh.validate()
uvl = mesh.uv_layers.new(name='UVMap')
li = quads.ravel()
uvl.data.foreach_set('uv', np.stack([(X.ravel()[li]-X.min())/(X.max()-X.min()), (Y.ravel()[li]-Y.min())/(Y.max()-Y.min())], -1).astype('float32').ravel())
lm = np.clip(h.ravel()/(0.2*EXAG), 0, 1)
land = np.array([0.05,0.16,0.04]); hill = np.array([0.22,0.2,0.1])
col = land[None,:]*(1-lm[:,None]) + hill[None,:]*lm[:,None]
rng = np.random.default_rng(3)
def fnoise(sig):
    n = rng.standard_normal((rows, cols)); f = np.fft.fft2(n)
    fy = np.fft.fftfreq(rows)[:,None]; fx = np.fft.fftfreq(cols)[None,:]
    g = np.exp(-(fx**2+fy**2)*(2*np.pi*sig)**2/2); r = np.real(np.fft.ifft2(f*g))
    return ((r-r.mean())/r.std()).ravel()
n1 = fnoise(6); n2 = fnoise(1.5)
forest = np.array([0.03,0.11,0.035]); field = np.array([0.20,0.28,0.07]); sand = np.array([0.55,0.48,0.30])
fm = np.clip(0.5+0.35*n1+0.12*n2, 0, 1)
col = forest[None,:]*(1-fm[:,None]) + field[None,:]*fm[:,None]
col = col*(1-lm[:,None]) + hill[None,:]*lm[:,None]*(0.8+0.2*n2[:,None])
beach = np.clip(1 - h.ravel()/0.004, 0, 1)**2
col = col*(1-beach[:,None]) + sand[None,:]*beach[:,None]
sh = np.clip(np.load('shalhi.npy').ravel()*2.6, 0, 1)
deep = np.array([0.004,0.03,0.07]); shal = np.array([0.04,0.30,0.34])
sea = deep[None,:]*(1-sh[:,None]) + shal[None,:]*sh[:,None]
wmask = zs.ravel() <= 0.0
col[wmask] = sea[wmask]
rgba = np.concatenate([col, (~wmask).astype('float32')[:,None]], 1).astype('float32')
ca = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
ca.data.foreach_set('color', rgba.ravel())
ob = bpy.data.objects.new('terrain', mesh); sc.collection.objects.link(ob)
for p in mesh.polygons: p.use_smooth = True
m = bpy.data.materials.new('land'); m.use_nodes = True
nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'Col'
nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 60
mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.15
im = bpy.data.images.load('/Users/admin/workspace/blender-test/landtex_hi.png'); im.colorspace_settings.name = 'sRGB'
tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im; tx.interpolation = 'Linear'; tx.extension = 'EXTEND'
uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
nt.links.new(uvn.outputs['UV'], tx.inputs['Vector'])
ml = nt.nodes.new('ShaderNodeMixRGB'); ml.blend_type = 'MIX'
nt.links.new(a.outputs['Alpha'], ml.inputs['Fac'])
nt.links.new(a.outputs['Color'], ml.inputs['Color1']); nt.links.new(tx.outputs['Color'], ml.inputs['Color2'])
nt.links.new(ml.outputs['Color'], mix.inputs[6]); nt.links.new(nz.outputs['Color'], mix.inputs[7])
nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.95
ob.data.materials.append(m)
rows, cols = crop.shape
bpy.ops.mesh.primitive_plane_add(size=1, location=(KM_X/2, KM_Y/2, 0))
w = bpy.context.object; w.scale = (KM_X*1.6, KM_Y*1.6, 1)
wm = bpy.data.materials.new('water'); wm.use_nodes = True
wt = wm.node_tree; b = wt.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.01,0.07,0.12,1); b.inputs['Roughness'].default_value = 0.08
n1 = wt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 90; n1.inputs['Detail'].default_value = 6
bump = wt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.002
wt.links.new(n1.outputs['Fac'], bump.inputs['Height']); wt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
tr = wt.nodes.new('ShaderNodeBsdfTransparent'); mx = wt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.8
wo = [n for n in wt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
wt.links.new(tr.outputs['BSDF'], mx.inputs[1]); wt.links.new(b.outputs['BSDF'], mx.inputs[2]); wt.links.new(mx.outputs['Shader'], wo.inputs['Surface'])
try: wm.surface_render_method = 'BLENDED'
except Exception as e: print('blend fail', e)
w.data.materials.append(wm)
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
wn = sc.world.node_tree; wn.nodes.clear()
sky = wn.nodes.new('ShaderNodeTexSky')
try: sky.sky_type = 'SINGLE_SCATTERING'
except Exception: sky.sky_type = 'NISHITA'
sky.sun_elevation = math.radians(14); sky.sun_rotation = math.radians(250); sky.altitude = 0
bgn = wn.nodes.new('ShaderNodeBackground'); bgn.inputs['Strength'].default_value = 0.65
out = wn.nodes.new('ShaderNodeOutputWorld')
vol = wn.nodes.new('ShaderNodeVolumeScatter'); vol.inputs['Density'].default_value = 0.012; vol.inputs['Anisotropy'].default_value = 0.5
wn.links.new(sky.outputs['Color'], bgn.inputs['Color']); wn.links.new(bgn.outputs['Background'], out.inputs['Surface'])
import os
if os.environ.get('VOL') == '1': wn.links.new(vol.outputs['Volume'], out.inputs['Volume'])
try: sc.world.sun_threshold = 8.0
except Exception as e: print('no sun_threshold', e)
def water_at(x, y):
    c = int(x/KM_X*(cols-1)); r = int((KM_Y-y)/KM_Y*(rows-1))
    return crop[r, c] <= 0.5
def north_coast(x):
    c = int(x/KM_X*(cols-1)); col = crop[:, c] <= 0.5
    r = int((KM_Y-36.0)/KM_Y*(rows-1))
    if not col[r]:
        for d in range(1, 600):
            if r-d >= 0 and col[r-d]: r = r-d; break
            if r+d < rows and col[r+d]: r = r+d; break
    while r > 0 and col[r-1]: r -= 1
    return KM_Y - r/(rows-1)*KM_Y
XS = np.arange(18, 75, 1.0)
CN = np.array([north_coast(x) for x in XS])
CNs = np.convolve(np.pad(CN, 4, mode='edge'), np.ones(9)/9, mode='valid')
def cn(x): return float(np.interp(x, XS, CNs))
random.seed(7)
shipmat = []
for nm, c in (('hullA',(0.35,0.04,0.03,1)),('hullB',(0.04,0.1,0.25,1)),('hullC',(0.05,0.05,0.05,1)),('boxR',(0.7,0.15,0.08,1)),('boxB',(0.1,0.3,0.6,1)),('boxW',(0.8,0.8,0.78,1)),('boxY',(0.75,0.6,0.1,1))):
    mt = bpy.data.materials.new(nm); mt.use_nodes = True
    mt.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = c
    mt.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
    shipmat.append(mt)
def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.name = name
    o.scale = (size[0]/2, size[1]/2, size[2]/2); o.data.materials.append(mat); return o
ships = []
lanes = [(-1.2, 1), (-2.2, -1)]
tries = 0
while len(ships) < 14 and tries < 400:
    tries += 1
    off, d = random.choice(lanes); sx = random.uniform(26, 62); sy = cn(sx) + off + random.uniform(-0.05, 0.05)
    if not all(water_at(sx+dx, sy+dy) for dx in (-0.3,0,0.3) for dy in (-0.2,0,0.2)): continue
    if any(abs(sx-s[0])<1.2 and abs(sy-s[1])<0.5 for s in ships): continue
    ships.append((sx, sy, d))
GLBP = '/Users/admin/Documents/GitHub/Blender-3D-Gallery/models/%s/exports/%s.glb'
names = ['container-ship-feeder', 'oil-tanker-aframax', 'bulk-carrier-handymax', 'harbour-tug']
src = {}
for nm in names:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLBP % (nm, nm))
    newo = [o for o in bpy.data.objects if o not in before]
    col = bpy.data.collections.new('src_' + nm)
    for o in newo:
        for c in list(o.users_collection): c.objects.unlink(o)
        col.objects.link(o)
    src[nm] = col
    print('IMPORTED', nm, len(newo))
for i, (sx, sy, d) in enumerate(ships):
    nm = random.choices(names, [4, 3, 3, 1])[0]
    inst = bpy.data.objects.new('ship%d' % i, None)
    inst.instance_type = 'COLLECTION'; inst.instance_collection = src[nm]
    sc.collection.objects.link(inst)
    inst.scale = (SHIP_SCALE, SHIP_SCALE, SHIP_SCALE)
    if d < 0: inst.rotation_euler = (0, 0, math.pi)
    for f, off in ((1, 0), (FRAMES, d*0.9)):
        inst.location = (sx+off, sy, 0); inst.keyframe_insert('location', frame=f)

wk = bpy.data.materials.new('wake'); wk.use_nodes = True; wn2 = wk.node_tree; wn2.nodes.clear()
tcn = wn2.nodes.new('ShaderNodeTexCoord'); sepn = wn2.nodes.new('ShaderNodeSeparateXYZ')
pw = wn2.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.6
nzn = wn2.nodes.new('ShaderNodeTexNoise'); nzn.inputs['Scale'].default_value = 40; nzn.inputs['Detail'].default_value = 4
mul = wn2.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
cl = wn2.nodes.new('ShaderNodeMath'); cl.operation = 'MULTIPLY'; cl.inputs[1].default_value = 1.8
e1 = wn2.nodes.new('ShaderNodeMath'); e1.operation = 'MULTIPLY'; e1.inputs[1].default_value = 2.0
e2 = wn2.nodes.new('ShaderNodeMath'); e2.operation = 'SUBTRACT'; e2.inputs[1].default_value = 1.0
e3 = wn2.nodes.new('ShaderNodeMath'); e3.operation = 'ABSOLUTE'
e4 = wn2.nodes.new('ShaderNodeMath'); e4.operation = 'SUBTRACT'; e4.inputs[0].default_value = 1.0
e5 = wn2.nodes.new('ShaderNodeMath'); e5.operation = 'MULTIPLY'

trn = wn2.nodes.new('ShaderNodeBsdfTransparent'); emn = wn2.nodes.new('ShaderNodeEmission')
emn.inputs['Color'].default_value = (0.9, 0.97, 1.0, 1); emn.inputs['Strength'].default_value = 1.4
mxn = wn2.nodes.new('ShaderNodeMixShader'); outn = wn2.nodes.new('ShaderNodeOutputMaterial')
L = wn2.links.new
L(tcn.outputs['Generated'], sepn.inputs['Vector']); L(sepn.outputs['X'], pw.inputs[0])
L(nzn.outputs['Fac'], mul.inputs[0]); L(pw.outputs['Value'], mul.inputs[1]); L(mul.outputs['Value'], cl.inputs[0])
L(sepn.outputs['Y'], e1.inputs[0]); L(e1.outputs['Value'], e2.inputs[0]); L(e2.outputs['Value'], e3.inputs[0]); L(e3.outputs['Value'], e4.inputs[1]); L(e4.outputs['Value'], e5.inputs[0]); L(cl.outputs['Value'], e5.inputs[1])
L(e5.outputs['Value'], mxn.inputs['Fac']); L(trn.outputs['BSDF'], mxn.inputs[1]); L(emn.outputs['Emission'], mxn.inputs[2]); L(mxn.outputs['Shader'], outn.inputs['Surface'])
try: wk.surface_render_method = 'BLENDED'
except Exception as e: print('wake blend fail', e)
for i, (sx, sy, d) in enumerate(ships):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(sx - d*1.0, sy, 0.004))
    wo = bpy.context.object; wo.name = 'wake%d' % i; wo.scale = (2.0, 0.16, 1)
    if d < 0: wo.rotation_euler = (0, 0, math.pi)
    wo.data.materials.append(wk)
    for f, off in ((1, 0), (FRAMES, d*0.9)):
        wo.location = (sx - d*1.0 + off, sy, 0.004); wo.keyframe_insert('location', frame=f)
bpy.ops.object.camera_add(location=(24, 33, 2.5)); cam = bpy.context.object
cam.data.lens = 35; sc.camera = cam
cam.data.dof.use_dof = False
for f in range(1, FRAMES+1, 6):
    t = (f-1)/(FRAMES-1); x = 30 + 28*t
    cam.location = (x, cn(x) - 3.2, 1.5 - 0.3*t)
    cam.rotation_euler = (math.radians(60 + 4*t), 0, math.radians(-30 - 22*t))
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = -0.5
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.render.film_transparent = False
t1 = time.time()
if mode == 'still':
    sc.frame_set(val); sc.render.filepath = f'/Users/admin/workspace/blender-test/shot9_still_{val}.png'
    bpy.ops.render.render(write_still=True)
    print('SHIPS', len(ships), 'RENDER_SECONDS', round(time.time()-t1,1))
else:
    sc.frame_start = int(os.environ.get('F0', 1)); sc.frame_end = int(os.environ.get('F1', FRAMES))
    sc.render.filepath = '/Users/admin/workspace/blender-test/' + os.environ.get('OUT', 'frames8') + '/'
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(animation=True)
    print('ANIM_SECONDS', round(time.time()-t1,1))
