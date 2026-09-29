#!/usr/bin/env python3
"""Build the reviewed static BEV catalogue from Gaia EVDB's sourced variants.

Usage: python3 scripts/refresh-vehicle-catalog.py /path/to/evdb
Requires PyYAML. The workflow opens a review PR; it never deploys upstream data.
"""
import glob
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import yaml

site = Path(__file__).resolve().parents[1]
output = site / "assets/vehicle-catalog.json"
source = Path(sys.argv[1]).resolve()
models = {item["id"]: item for path in glob.glob(str(source / "data/vehicle-models/*.yaml"))
          if (item := yaml.safe_load(Path(path).read_text()))}
previous = json.loads(output.read_text())
generic = [row for row in previous["models"] if row.get("data_quality") != "sourced-variant"]

# Avoid markets and model generations whose connector or charging data cannot be
# safely inferred from EVDB's global entries. These remain selectable as models.
excluded_models = {("Tesla", "Model S"), ("Tesla", "Model X"), ("Nissan", "Leaf")}
variants = []
for path in sorted((source / "data/vehicle-variants").glob("*.yaml")):
    variant = yaml.safe_load(path.read_text())
    model = models.get(variant.get("model_id"))
    if not model or variant.get("metadata", {}).get("data_quality") != "verified":
        continue
    make, name = model.get("brand"), model.get("name")
    if (make, name) in excluded_models or not make or not name:
        continue
    year = variant.get("model_year")
    battery = variant.get("battery", {}).get("usable_kwh")
    dc = variant.get("charging", {}).get("dc_max_kw")
    efficiency = variant.get("efficiency", {})
    consumption = efficiency.get("real_world_kwh_per_100km") or efficiency.get("wltp_kwh_per_100km")
    sources = variant.get("metadata", {}).get("sources") or []
    # Require a meaningful product source, not a wiki or the manufacturer's home page.
    valid_sources = [s for s in sources if urlparse(s).scheme == "https" and
                     urlparse(s).netloc and len(urlparse(s).path.strip("/")) >= 9 and
                     "wikipedia.org" not in urlparse(s).netloc]
    if not (isinstance(year, int) and 2023 <= year <= 2027 and
            isinstance(battery, (int, float)) and 15 <= battery <= 125 and
            isinstance(dc, (int, float)) and 30 <= dc <= 400 and
            isinstance(consumption, (int, float)) and 10 <= consumption <= 40 and
            valid_sources):
        continue
    variants.append({
        "id": "gaia-" + variant["id"], "make": make, "model": name,
        "variant": variant["name"], "model_year_start": year,
        "battery_capacity_kwh": battery,
        "consumption_wh_km": round(consumption * 10),
        "max_ac_power_kw": variant.get("charging", {}).get("ac_max_kw"),
        "max_dc_power_kw": dc,
        "wltp_range_km": variant.get("range", {}).get("wltp_km"),
        "connector_types": ["CCS2", "Type 2"],
        "data_quality": "sourced-variant", "source_url": valid_sources[0],
        "consumption_basis": "real-world" if efficiency.get("real_world_kwh_per_100km") else "WLTP",
    })

covered = {(v["make"].casefold(), v["model"].casefold()) for v in variants}
rows = [row for row in generic if (row["make"].casefold(), row["model"].casefold()) not in covered] + variants
rows.sort(key=lambda r: (r["make"].casefold(), r["model"].casefold(), str(r.get("variant", "")).casefold(), r.get("model_year_start", 0)))
if len(variants) < 100 or len(rows) < 150 or len({r["id"] for r in rows}) != len(rows):
    raise SystemExit(f"Catalogue failed quality gate: {len(variants)} sourced, {len(rows)} total")
commit = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
result = {"reviewed_at": previous["reviewed_at"], "source_commit": commit,
          "description": "Versões BEV com especificações atribuídas; restantes modelos permitem ajustar os dados do carro.",
          "attribution": "Gaia EVDB (CC BY-SA 4.0) e seleção editorial ChargeVoy.", "models": rows}
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(f"{len(variants)} sourced variants, {len(rows) - len(variants)} model-only entries; EVDB {commit}")
