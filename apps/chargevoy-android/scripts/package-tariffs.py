"""Bundle the same verified MOBI.E parser used by the site; never access D1."""
import csv,io,json,hashlib,subprocess,argparse,importlib.util,sys
sys.dont_write_bytecode=True
from datetime import datetime,timezone
from pathlib import Path
app=Path(__file__).resolve().parents[1]
source=app.parent.parent/'ev-charge-portugal-github-ready/scripts/import-mobie-tariffs.py'
spec=importlib.util.spec_from_file_location('mobie_tariff_parser',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
parser=argparse.ArgumentParser();parser.add_argument('--file',type=Path);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
content=args.file.read_bytes() if args.file else subprocess.check_output(['curl','--fail','--silent','--show-error','--retry','2','--max-time','60',module.SOURCE])
if not 200000<=len(content)<=15000000:raise ValueError('Unexpected tariff CSV size')
reader=csv.DictReader(io.StringIO(content.decode('utf-8-sig')),delimiter=';')
parsed=module.build(reader)
if len(parsed)<8000 or len({r[1] for r in parsed})<5000:raise ValueError('Incomplete tariff catalogue')
cols='id,station_id,connector_uid,voltage_level,tariff_period,connector_type,power_kw,activation_fee_eur,energy_price_eur_kwh,time_price_eur_min'.split(',')
retrieved=datetime.now(timezone.utc).isoformat()
rows=[dict(zip(cols,r),updated_at=retrieved) for r in parsed]
payload=dict(source_url=module.SOURCE,source_sha256=hashlib.sha256(content).hexdigest(),retrieved_at=retrieved,rows=rows)
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(payload,separators=(',',':')))
print(f'Bundled published tariffs: {len(rows)} connectors, {len({r[1] for r in parsed})} stations; zero D1 reads/writes.')
