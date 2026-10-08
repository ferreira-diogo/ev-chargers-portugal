"""Apply reviewed silhouette masks; verify original RGB and retain attribution."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parents[3]
source=root/'ev-charge-portugal-github-ready/assets/vehicle-images'
out=root/'apps/chargevoy-android/vehicle-images'
polygons=json.loads((out/'manual-masks.json').read_text())
credits=json.loads((source/'credits.json').read_text());report=[]
for row in credits:
 if row.get('background_removed'):continue
 path=source/Path(row['image']).name;im=Image.open(path).convert('RGB');target=out/(path.stem+'-segmented.webp')
 if path.name in polygons:
  # Coordinates on a 600x400 review canvas. Antialias alpha only.
  mask=Image.new('L',(im.width*2,im.height*2));ImageDraw.Draw(mask).polygon([(x/600*im.width*2,y/400*im.height*2) for x,y in polygons[path.name]],fill=255)
  alpha=mask.resize(im.size,Image.Resampling.LANCZOS)
  rgba=im.convert('RGBA');rgba.putalpha(alpha);temp=target.with_suffix('.temporary.webp');rgba.save(temp,'WEBP',lossless=True,exact=True,method=6);temp.replace(target)
 cut=Image.open(target).convert('RGBA')
 assert cut.size==im.size
 assert np.array_equal(np.asarray(cut.convert('RGB')),np.asarray(im)),path.name
 assert cut.getchannel('A').getextrema()[0]==0,path.name
 row['original_image']=row.get('original_image') or row['image']
 row['image']='./assets/vehicle-images/'+target.name
 row['background_removed']=True;row['android_segmented']=True
 row['changes']=(row.get('changes','')+' Fundo removido por máscara de transparência; píxeis RGB e enquadramento originais preservados.').strip()
 report.append({'source':path.name,'output':target.name,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'size':list(im.size),'approved':True,'method':'reviewed silhouette' if path.name in polygons else 'reviewed segmentation'})
(out/'credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2))
(out/'segmentation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
for start in range(0,len(report),16):
 sheet=Image.new('RGB',(1200,1000),'#193249');draw=ImageDraw.Draw(sheet)
 for i,r in enumerate(report[start:start+16]):
  im=Image.open(out/r['output']);im.thumbnail((290,210));x=i%4*300;y=i//4*250
  sheet.paste(im,(x+(300-im.width)//2,y),im.getchannel('A'));draw.text((x+5,y+215),str(start+i)+': '+r['source'],fill='white')
 sheet.save(out/('review-'+str(start//16)+'.jpg'))
print('Verified',len(report),'lossless cutouts; shared catalogue untouched.')
