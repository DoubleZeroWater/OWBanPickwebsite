from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import catalog
from scripts.scrape_assets import parse_heroes, parse_maps


class CatalogMappingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assets = {
            "schemaVersion": 1,
            "modes": list(catalog.MODES),
            "maps": {mode: [{"nameEn": f"{mode} Map"}] for mode in catalog.MODES},
            "heroes": [{"nameEn": "Lúcio"}, {"nameEn": "Wrecking Ball"}],
        }
        self.assets["catalogHash"] = catalog.compute_catalog_hash(self.assets)

    def test_template_contains_every_exact_english_key(self) -> None:
        template = catalog.build_translation_template(self.assets)
        self.assertEqual(template["catalogHash"], self.assets["catalogHash"])
        self.assertEqual(list(template["modes"]), catalog.MODES)
        self.assertEqual(set(template["heroes"]), {"Lúcio", "Wrecking Ball"})
        self.assertTrue(all(value == "" for group in ("modes", "maps", "heroes") for value in template[group].values()))

    def test_invalid_translation_reports_missing_extra_blank_and_hash(self) -> None:
        translation = catalog.build_translation_template(self.assets)
        translation["catalogHash"] = "sha256:old"
        translation["heroes"].pop("Lúcio")
        translation["heroes"]["Ana"] = "安娜"
        diagnostics = catalog.validate_translation(self.assets, translation)
        self.assertFalse(diagnostics["valid"])
        self.assertTrue(diagnostics["hashMismatch"])
        self.assertEqual(diagnostics["missing"]["heroes"], ["Lúcio"])
        self.assertEqual(diagnostics["extra"]["heroes"], ["Ana"])
        self.assertIn("Wrecking Ball", diagnostics["blank"]["heroes"])

    def test_runtime_translation_has_precedence_even_when_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundled_assets = root / "assets.json"
            bundled_translation = root / "translation.json"
            runtime = root / "runtime"
            bundled_assets.write_text(json.dumps(self.assets), encoding="utf-8")
            valid = catalog.build_translation_template(self.assets)
            for category in ("modes", "maps", "heroes"):
                valid[category] = {key: f"中-{key}" for key in valid[category]}
            bundled_translation.write_text(json.dumps(valid), encoding="utf-8")
            catalog.save_json_atomic(runtime / "translation.json", {"schemaVersion": 1})

            response = catalog.build_catalog_response(bundled_assets, bundled_translation, runtime)

            self.assertEqual(response["locale"], "en")
            self.assertFalse(response["translation"]["active"])
            self.assertEqual(response["translation"]["heroes"], {})
            self.assertEqual(response["translationStatus"]["source"], "runtime")

    def test_refresh_failure_keeps_previous_complete_runtime_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory) / "catalog"
            current = runtime / "current"
            current.mkdir(parents=True)
            (current / "assets.json").write_text(json.dumps(self.assets), encoding="utf-8")
            (current / "marker.txt").write_text("previous", encoding="utf-8")

            with patch("scripts.scrape_assets.scrape_catalog", side_effect=RuntimeError("network failed")):
                with self.assertRaisesRegex(RuntimeError, "network failed"):
                    catalog.refresh_runtime_catalog(runtime)

            self.assertEqual((current / "marker.txt").read_text(encoding="utf-8"), "previous")
            self.assertEqual(catalog.read_json(current / "assets.json")["catalogHash"], self.assets["catalogHash"])

    def test_runtime_asset_allowlist_contains_only_manifest_files(self) -> None:
        assets = {
            "maps": {"Escort": [{"fileName": "map.jpg"}]},
            "heroes": [{"fileName": "hero.png"}],
            "modeIcons": {"Escort": {"fileName": "mode.png"}},
            "roleIcons": {"Tank": {"fileName": "role.png"}},
        }
        self.assertEqual(
            catalog.allowed_runtime_asset_paths(assets),
            {"maps/map.jpg", "heroes/hero.png", "modes/mode.png", "roles/role.png"},
        )


class FandomParserFixtureTests(unittest.TestCase):
    def test_hero_roster_uses_roles_lazy_images_unicode_and_deduplication(self) -> None:
        html = """
        <h2><span id="Hero_roster">Hero roster</span></h2><table>
          <tr><th><a href="/wiki/Roles#Tank"><img data-src="https://static.wikia.nocookie.net/x/TankIcon.png/revision/latest"/>Tank</a></th>
              <td><a href="/wiki/D.Va" title="D.Va"><img data-image-name="Icon-D.Va.png" data-src="https://static.wikia.nocookie.net/x/Icon-DVa.png/revision/latest"/></a></td></tr>
          <tr><th><a href="/wiki/Roles#Damage"><img src="https://static.wikia.nocookie.net/x/OffenseIcon.png/revision/latest"/>Damage</a></th>
              <td><a href="/wiki/Torbjorn" title="Torbjörn"><img data-image-name="Icon-Torbjörn.png" data-src="https://static.wikia.nocookie.net/x/Icon-Torb.png/revision/latest"/></a></td></tr>
          <tr><th><a href="/wiki/Roles#Support"><img src="https://static.wikia.nocookie.net/x/SupportIcon.png/revision/latest"/>Support</a></th>
              <td><a href="/wiki/Lucio" title="Lúcio"><img data-image-name="Icon-Lúcio.png" data-src="https://static.wikia.nocookie.net/x/Icon-Lucio.png/revision/latest"/></a></td>
              <td><a href="/wiki/Lucio" title="Lúcio"><img data-image-name="Icon-Lúcio.png" data-src="https://static.wikia.nocookie.net/x/Icon-Lucio.png/revision/latest"/></a></td></tr>
        </table>
        """
        heroes, role_icons = parse_heroes(html, "/runtime-assets")
        self.assertEqual([(hero["nameEn"], hero["role"]) for hero in heroes], [("D.Va", "Tank"), ("Torbjörn", "Damage"), ("Lúcio", "Support")])
        self.assertEqual(set(role_icons), {"Tank", "Damage", "Support"})
        self.assertTrue(all(hero["imageUrl"].startswith("/runtime-assets/heroes/") for hero in heroes))

    def test_standard_play_parser_limits_modes_and_handles_nested_flashpoint(self) -> None:
        sections = []
        for mode in catalog.MODES:
            sections.append(
                f'<div><b><a href="/wiki/{mode}" title="{mode}"><img data-image-name="{mode}.png" src="https://static.wikia.nocookie.net/x/{mode}.png/revision/latest"/></a></b></div>'
                f'<div class="fpimagelink-mask"><div class="fpimagelink"><div class="image"><img data-image-name="{mode}.jpg" data-src="https://static.wikia.nocookie.net/x/{mode}.jpg/revision/latest"/></div><div class="text"><a href="/wiki/{mode}_Map" title="{mode} Map">{mode} Map</a></div></div></div>'
            )
        html = '<div class="tabber"><ul><li data-hash="Standard_Play">Standard Play</li></ul><div class="wds-tab__content"><b>Standard Play</b>' + "".join(sections) + '<div><b><a title="Clash">Clash</a></b></div></div></div>'
        maps, icons = parse_maps(html, "/runtime-assets")
        self.assertEqual({mode: len(items) for mode, items in maps.items()}, {mode: 1 for mode in catalog.MODES})
        self.assertEqual(set(icons), set(catalog.MODES))
        self.assertTrue(all(items[0]["imageUrl"].startswith("/runtime-assets/maps/") for items in maps.values()))


if __name__ == "__main__":
    unittest.main()
