"""String checks on the built desktop/plugin.js for behaviour that is CSS or markup, not layout."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

BUNDLE = (Path(__file__).resolve().parent.parent / "desktop" / "plugin.js").read_text(encoding="utf-8")


def rule(selector: str) -> str:
    m = re.search(re.escape(selector) + r"\{([^}]*)\}", BUNDLE)
    if not m:
        raise AssertionError(f"no CSS rule for {selector}")
    return m.group(1)


def has(pattern: str) -> bool:
    return re.search(pattern, BUNDLE) is not None


class CardTitleTest(unittest.TestCase):
    def test_title_wraps_to_two_lines_with_ellipsis(self) -> None:
        css = rule(".kg-node .kg-tt")
        self.assertIn("-webkit-line-clamp:2", css)
        self.assertIn("overflow:hidden", css)
        self.assertNotIn("nowrap", rule(".kg-node .kg-t"))

    def test_full_title_stays_in_the_tooltip(self) -> None:
        self.assertTrue(has(r"title: t\.t,\s+role: \"button\""))


class PriorityBadgeTest(unittest.TestCase):
    def test_badge_shows_only_above_zero_and_names_the_value(self) -> None:
        self.assertTrue(has(r"t\.p > 0 \? h\d*\(\"span\", \{ className: \"kg-pri\", title: `Priority \$\{t\.p\}` \}, `P\$\{t\.p\}`"))

    def test_card_accessible_name_carries_priority(self) -> None:
        self.assertTrue(has(r"\"aria-label\": `\$\{t\.t\}, \$\{t\.s\}\$\{t\.p > 0 \? `, priority \$\{t\.p\}` : \"\"\}`"))


class ResetToolbarTest(unittest.TestCase):
    def test_reset_forgets_every_remembered_key(self) -> None:
        remembered = set(re.findall(r"storage\.set\(\"(\w+)\"", BUNDLE))
        forgotten = set(re.findall(r"storage\.remove\(\"(\w+)\"", BUNDLE))
        self.assertEqual(remembered, forgotten)
        self.assertTrue({"mode", "board", "arrange"} <= forgotten)

    def test_reset_control_is_labelled(self) -> None:
        self.assertTrue(has(r"onClick: resetToolbar, \"aria-label\": \"Reset toolbar to defaults\""))


if __name__ == "__main__":
    unittest.main()
