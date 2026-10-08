"""Create Android-only candidate masks without changing source RGB pixels.
Requires rembg[cpu]==2.0.85; model sam (quantized). Review candidates before approval.
"""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from rembg import remove, new_session
root=Path(__file__).resolve().parents[3]
source=root/'ev-charge-portugal-github-ready/assets/vehicle-images'
output=root/'apps/chargevoy-android/vehicle-images'
output.mkdir(exist_ok=True)
credits=json.loads((source/'credits.json').read_text())
prior_session=new_session('u2netp',intra_op_num_threads=2,inter_op_num_threads=1)
session=new_session('sam',sam_quant=True,intra_op_num_threads=4,inter_op_num_threads=1)
# SAM returns alternative masks. Keep the predicted best mask rather than unioning
# all alternatives, which can merge nearby vehicles with the selected car.
import inspect,textwrap,types
import rembg.sessions.sam as sam_module
code=textwrap.dedent(inspect.getsource(sam_module.SamSession.predict))
code=code.replace('masks, _, _ = self.decoder.run(None, decoder_inputs)', 'masks, scores, _ = self.decoder.run(None, decoder_inputs)')
code=code.replace('for m in masks[0, :, :, :]:\n        mask[m > 0.0] = [255, 255, 255]', 'candidates = masks[0] > 0\n    m = candidates[int(np.argmax(scores[0]))]\n    mask[m] = [255, 255, 255]')
scope=sam_module.__dict__.copy();exec(code,scope)
session.predict=types.MethodType(scope['predict'],session)
boxes={
 'renault-5-e-tech.jpg':(.06,.04,.96,.91),
 'kia-niro-ev.jpg':(.02,.1,.98,.98),
 'abarth-500e-thumb.jpg':(.12,.22,.9,.75),
 'audi-e-tron-gt-thumb.jpg':(.09,.16,.79,.96),
 'citroen-e-c3-aircross-thumb.jpg':(.02,.13,.99,.99),
 'genesis-electrified-g80-thumb.jpg':(.03,.14,.98,.95),
 'maserati-grecale-folgore-thumb.jpg':(.17,.12,.78,.9),
 'mazda-mx-30-thumb.jpg':(.04,.03,.98,.98),
 'mercedes-benz-eqe-suv-thumb.jpg':(.03,.1,.91,.95),
 'polestar-3-thumb.jpg':(.04,.25,.88,.96),
 'renault-scenic-e-tech-thumb.jpg':(.23,.2,.83,.8),
 'renault-scenic-e-tech-electric-thumb.jpg':(.23,.2,.83,.8),
 'vinfast-vf9-thumb.jpg':(.03,.05,.96,.98),
 'tesla-model-x-thumb.jpg':(.34,.43,.66,.86),
 'toyota-bz4x-thumb.jpg':(.04,.17,.95,.98),
 'smart-1-thumb.jpg':(.04,.03,.99,.98),
 'byd-seal-thumb.jpg':(.15,.23,.84,.81),
}
report=[]
import os
limit=int(os.environ.get('CHARGEVOY_PHOTO_LIMIT','1000'))
for row in credits:
 if len(report)>=limit:break
 if row.get('background_removed'):continue
 if os.environ.get('CHARGEVOY_PHOTO_FILTER') and Path(row['image']).name not in os.environ['CHARGEVOY_PHOTO_FILTER'].split(','):continue
 path=source/Path(row['image']).name
 im=Image.open(path).convert('RGB')
 box=boxes.get(path.name,(.02,.02,.98,.98));coords=[box[0]*im.width,box[1]*im.height,box[2]*im.width,box[3]*im.height]
 prior=remove(im,session=prior_session,only_mask=True).convert('L')
 mask=remove(im,session=session,only_mask=True,prior_mask=prior,sam_prompt=[{'type':'point','label':1,'data':[im.width*.5,im.height*.6]}]).convert('L')
 alpha=np.asarray(mask).copy()
 a=alpha>128;b=np.asarray(prior)>128
 iou=float((a&b).sum())/max(1,float((a|b).sum()))
 if iou<.05:alpha=np.asarray(prior).copy()
 # Exclude disconnected surroundings outside the reviewed vehicle rectangle.
 if path.name in boxes:
  x0,y0,x1,y1=map(int,coords)
  alpha[:y0]=0;alpha[y1:]=0;alpha[:,:x0]=0;alpha[:,x1:]=0
 labels,n=ndimage.label(alpha>128)
 if not n:continue
 sizes=np.bincount(labels.ravel());sizes[0]=0
 keep=ndimage.binary_dilation(labels==sizes.argmax(),iterations=2)
 alpha[~keep]=0
 rgba=im.convert('RGBA');rgba.putalpha(Image.fromarray(alpha))
 target=output/(path.stem+'-segmented.webp')
 temp=target.with_suffix('.temporary.webp')
 rgba.save(temp,'WEBP',lossless=True,exact=True,method=6)
 temp.replace(target)
 assert np.array_equal(np.asarray(Image.open(target).convert('RGB')),np.asarray(im))
 report.append({'make':row['make'],'model':row['model'],'source':path.name,'output':target.name,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':list(im.size),'foreground_fraction':float((alpha>128).mean()),'approved':False})
 print('Segmented',len(report),path.name,flush=True)
(output/'segmentation-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
for start in range(0,len(report),16):
 batch=report[start:start+16];sheet=Image.new('RGB',(1200,1000),'#193249');draw=ImageDraw.Draw(sheet)
 for i,r in enumerate(batch):
  im=Image.open(output/r['output']);im.thumbnail((290,210))
  x=(i%4)*300;y=(i//4)*250
  sheet.paste(im,(x+(300-im.width)//2,y),im.getchannel('A'))
  draw.text((x+5,y+215),str(start+i)+': '+r['make']+' '+r['model'],fill='white')
 sheet.save(output/('review-'+str(start//16)+'.jpg'))
