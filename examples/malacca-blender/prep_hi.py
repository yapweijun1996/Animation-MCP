import numpy as np, tifffile
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
C0, C1, R1 = 259, 2978, 1806          # DEM window at 30 m: cols C0..C1, rows 0..R1
crop = np.load('crop.npy')[0:R1, C0:C1].astype('float32')
land = crop > 0.5
def fblur(a, sig):
    H, W = a.shape; f = np.fft.rfft2(a)
    fy = np.fft.fftfreq(H)[:, None]; fx = np.fft.rfftfreq(W)[None, :]
    return np.fft.irfft2(f*np.exp(-(fx**2+fy**2)*(2*np.pi*sig)**2/2), s=(H, W)).astype('float32')
shalf = fblur(land.astype('float32'), 15.0)
zw = -1.5 - 4.5*(1-np.clip(shalf*2.5, 0, 1))
z = np.where(land, crop, zw).astype('float32')
zhi = fblur(z, 0.8)[::2, ::2]; zhi = np.where(land[::2, ::2], np.maximum(zhi, 0.3), np.minimum(zhi, -0.5))
np.save('zhi.npy', zhi.astype('float32'))
shal = shalf[::2, ::2]; np.save('shalhi.npy', shal.astype('float32'))
print('zhi', zhi.shape, 'shal', shal.shape)
# hillshade at 30 m from lightly smoothed land heights, relief exaggerated
zl = fblur(np.where(land, crop, 0.0).astype('float32'), 1.0) * 3.0
gy, gx = np.gradient(zl, 30.9)
az, alt = np.radians(290), np.radians(35)
slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
hs = np.clip(np.sin(alt)*np.cos(slope) + np.cos(alt)*np.sin(slope)*np.cos(az-aspect), 0, 1).astype('float32')
# WorldCover window (12000 px/deg), aligned with the DEM window
wc = tifffile.imread('dem/wc_N00E102.tif')
r0w = 16800; c0w = int(round(18000 + C0*10/3)); Hh = int(round(R1*10/3)); Ww = int(round((C1-C0)*10/3))
wc = wc[r0w:r0w+Hh, c0w:c0w+Ww]; print('wc', wc.shape)
rng = np.random.default_rng(11)
def mk(s): return rng.standard_normal((Hh//s+3, Ww//s+3)).astype('float32')
G = {1.5: mk(2), 6: mk(6), 30: mk(30)}
def samp(a, ys, xs):
    ys = np.clip(ys, 0, a.shape[0]-1.001); xs = np.clip(xs, 0, a.shape[1]-1.001)
    iy = ys.astype(int); ix = xs.astype(int); fy = (ys-iy)[:, None]; fx = (xs-ix)[None, :]
    a00 = a[iy][:, ix]; a01 = a[iy][:, ix+1]; a10 = a[iy+1][:, ix]; a11 = a[iy+1][:, ix+1]
    return (a00*(1-fx)+a01*fx)*(1-fy) + (a10*(1-fx)+a11*fx)*fy
def vn(g, s, r0, r1):
    ys = np.arange(r0, r1)/s; xs = np.arange(Ww)/s
    iy = ys.astype(int); fy = ys-iy; ix = xs.astype(int); fx = xs-ix
    fy = (fy*fy*(3-2*fy))[:, None]; fx = (fx*fx*(3-2*fx))[None, :]
    a00 = g[iy][:, ix]; a01 = g[iy][:, ix+1]; a10 = g[iy+1][:, ix]; a11 = g[iy+1][:, ix+1]
    return (a00*(1-fx)+a01*fx)*(1-fy) + (a10*(1-fx)+a11*fx)*fy
pal = np.zeros((256, 3), 'float32')
for k, v in {10:(0.05,0.17,0.05), 20:(0.18,0.24,0.10), 30:(0.18,0.30,0.08), 40:(0.26,0.33,0.10), 50:(0.22,0.26,0.17), 60:(0.34,0.27,0.18),
             70:(0.8,0.8,0.8), 80:(0.05,0.15,0.2), 90:(0.15,0.28,0.2), 95:(0.03,0.11,0.08), 100:(0.3,0.3,0.2)}.items(): pal[k] = v
amp = np.zeros((256, 3), 'float32'); amp[:] = (0.15, 0.10, 0.08)
amp[10] = (0.25, 0.15, 0.12); amp[50] = (0.22, 0.12, 0.08); amp[95] = (0.18, 0.12, 0.10)
out = np.zeros((Hh, Ww, 3), 'uint8')
STRIP = 400
for r0 in range(0, Hh, STRIP):
    r1 = min(Hh, r0+STRIP); cls = wc[r0:r1]
    base = pal[cls]; am = amp[cls]
    n = am[..., 0:1]*vn(G[1.5], 2, r0, r1)[..., None] + am[..., 1:2]*vn(G[6], 6, r0, r1)[..., None] + am[..., 2:3]*vn(G[30], 30, r0, r1)[..., None]
    h = samp(hs, np.arange(r0, r1)*0.3, np.arange(Ww)*0.3)
    col = base*(1+n)*(0.45+0.8*h)[..., None]
    lin = np.clip(col, 0, 1)**1.6; lum = lin.mean(axis=2, keepdims=True)
    lin = np.clip(lum + (lin-lum)*1.5, 0, 1)
    out[r0:r1] = (lin**(1/2.2)*255).astype('uint8')
Image.fromarray(out).save('landtex_hi.png', compress_level=3)
Image.fromarray(out[::8, ::8]).save('/Users/admin/workspace/malacca/share/landtex-hi-preview.png')
print('done', out.shape)
