"""Import MOBI.E's public connector tariff CSV into the D1 OPC catalogue.

Produces idempotent SQL batches; never inserts incomplete or ambiguous prices.
"""
import argparse
import csv
import hashlib
import io
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = "https://www.mobie.pt/documents/42032/106470/8602.csv/d8679fe8-51c0-00ce-97b7-37f8a930c861?t=1749114000395"
EXPECTED = {"FLAT": "/charge", "ENERGY": "/kWh", "TIME": "/min"}


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, (float, int)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def parse_amount(row):
    raw = row["TARIFA"].strip().replace(",", ".")
    kind = row["TIPO_TARIFA"].strip()
    if kind not in EXPECTED or not raw.endswith(EXPECTED[kind]):
        return None
    try:
        value = float(raw.removesuffix(EXPECTED[kind]).replace("€", "").strip())
    except ValueError:
        return None
    return value if 0 <= value <= 20 else None


def connector_type(raw):
    raw = raw.upper()
    if "COMBO" in raw or "CCS" in raw:
        return "CCS"
    if "CHADEMO" in raw:
        return "CHAdeMO"
    if "MENNEKES" in raw or "TYPE 2" in raw:
        return "Type 2"
    if "SCHUKO" in raw or "DOMESTIC" in raw:
        return "Schuko"
    return raw or "Unknown"


def build(rows):
    groups = defaultdict(lambda: defaultdict(set))
    metadata = {}
    incomplete = set()
    for row in rows:
        site, uid = row["ID"].strip(), row["UID_TOMADA"].strip()
        period = row["TIPO_TARIFARIO"].strip()
        if not site or not uid or period not in ("REGULAR", ""):
            continue
        key = (site, uid, period or "REGULAR")
        kind = row["TIPO_TARIFA"].strip()
        amount = parse_amount(row)
        if kind == "PARKING_TIME" or (kind in EXPECTED and amount is None):
            incomplete.add(key)
            continue
        if amount is None:
            continue
        groups[key][kind].add(amount)
        meta = (row["NIVELTENSAO"].strip(), connector_type(row["TIPO_TOMADA"].strip()), row["POTENCIA_TOMADA"].strip())
        if key in metadata and metadata[key] != meta:
            incomplete.add(key)
        metadata[key] = meta

    output = []
    for key, components in groups.items():
        if key in incomplete or any(len(v) != 1 for v in components.values()):
            continue
        site, uid, period = key
        voltage, kind, raw_power = metadata[key]
        try:
            power = float(raw_power.replace(",", "."))
        except ValueError:
            continue
        if not 0 < power <= 1000 or kind == "Unknown":
            continue
        # The CSV omits components that are not charged (e.g. TIME-only rows).
        id_ = hashlib.sha256("|".join(key).encode()).hexdigest()[:24]
        output.append(("mobie-" + id_, "nap-" + site, uid, voltage, period, kind, power,
                       *[next(iter(components[k])) if components[k] else 0 for k in ("FLAT", "ENERGY", "TIME")]))
    return sorted(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path)
    parser.add_argument("--out", type=Path, default=Path("tmp/d1-tariffs"))
    args = parser.parse_args()
    if args.file:
        content = args.file.read_bytes()
    else:
        with urlopen(Request(SOURCE, headers={"User-Agent": "ChargeVoy tariff catalogue/1.0"}), timeout=90) as response:
            content = response.read(15_000_001)
    if not 200_000 <= len(content) <= 15_000_000:
        raise ValueError("Unexpected MOBI.E tariff CSV size")
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")), delimiter=";")
    expected_columns = {"ID", "UID_TOMADA", "TIPO_TARIFARIO", "TIPO_TARIFA", "TARIFA", "TIPO_TOMADA", "POTENCIA_TOMADA", "NIVELTENSAO"}
    if not expected_columns.issubset(reader.fieldnames or []):
        raise ValueError("MOBI.E tariff CSV schema changed")
    parsed = build(reader)
    sites = len({row[1] for row in parsed})
    if len(parsed) < 8_000 or sites < 5_000:
        raise ValueError(f"Tariff coverage too low: {len(parsed)} connectors across {sites} sites")
    args.out.mkdir(parents=True, exist_ok=True)
    for old in args.out.glob("*.sql"):
        old.unlink()
    updated_at = datetime.now(timezone.utc).isoformat()
    cols = "id,station_id,connector_uid,voltage_level,tariff_period,connector_type,power_kw,activation_fee_eur,energy_price_eur_kwh,time_price_eur_min,updated_at"
    for batch, start in enumerate(range(0, len(parsed), 80), 1):
        values = ["(" + ",".join(quote(v) for v in (*row, updated_at)) + ")" for row in parsed[start:start + 80]]
        sql = f"INSERT INTO official_opc_tariffs ({cols}) VALUES\n" + ",\n".join(values)
        sql += "\nON CONFLICT(id) DO UPDATE SET voltage_level=excluded.voltage_level,connector_type=excluded.connector_type,power_kw=excluded.power_kw,activation_fee_eur=excluded.activation_fee_eur,energy_price_eur_kwh=excluded.energy_price_eur_kwh,time_price_eur_min=excluded.time_price_eur_min,updated_at=excluded.updated_at WHERE voltage_level IS NOT excluded.voltage_level OR connector_type IS NOT excluded.connector_type OR power_kw IS NOT excluded.power_kw OR activation_fee_eur IS NOT excluded.activation_fee_eur OR energy_price_eur_kwh IS NOT excluded.energy_price_eur_kwh OR time_price_eur_min IS NOT excluded.time_price_eur_min OR updated_at < datetime('now','-2 days');\n"
        (args.out / f"{batch:04d}.sql").write_text(sql)
    print(json.dumps({"source": SOURCE, "source_sha256": hashlib.sha256(content).hexdigest(), "connectors": len(parsed), "stations": sites, "sql_batches": batch, "updated_at": updated_at}))


if __name__ == "__main__":
    main()
