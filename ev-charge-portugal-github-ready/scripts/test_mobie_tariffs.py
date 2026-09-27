import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

tariffs = SourceFileLoader("tariffs", str(Path(__file__).with_name("import-mobie-tariffs.py"))).load_module()


def row(kind, value, **overrides):
    item = {"ID": "LIS-00001", "UID_TOMADA": "LIS-00001-01-01", "TIPO_TARIFARIO": "REGULAR",
            "TIPO_TARIFA": kind, "TARIFA": value, "NIVELTENSAO": "BTE", "TIPO_TOMADA": "MENNEKES", "POTENCIA_TOMADA": "22"}
    item.update(overrides)
    return item


class TariffTests(unittest.TestCase):
    def test_time_only_tariff_has_zero_unlisted_components(self):
        result = tariffs.build([row("TIME", "€ 0.04 /min")])
        self.assertEqual(result[0][-3:], (0, 0, .04))

    def test_ambiguous_price_or_extra_parking_is_excluded(self):
        self.assertEqual(tariffs.build([row("TIME", "€ 0.04 /min"), row("TIME", "€ 0.08 /min")]), [])
        self.assertEqual(tariffs.build([row("TIME", "€ 0.04 /min"), row("PARKING_TIME", "€ 0.06 /min")]), [])

    def test_ad_hoc_does_not_contaminate_regular_price(self):
        self.assertEqual(tariffs.build([row("TIME", "€ 0.04 /min", TIPO_TARIFARIO="AD_HOC_PAYMENT")]), [])


if __name__ == "__main__":
    unittest.main()
