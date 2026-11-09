"""String checks on the built desktop/plugin.js for behaviour that is CSS or markup, not layout."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

BUNDLE = (Path(__file__).resolve().parent.parent / "desktop" / "plugin.js").read_text(encoding="utf-8")


def rule(selector: str) -> str:
    m = re.search(re.escape(selector) + r"\{([^}]*)\}", BUNDLE)
    assert m, f"no CSS rule for {selector}"
    return m.group(1)


class CardTitleTest(unittest.TestCase):
    def test_title_wraps_to_two_lines_with_ellipsis(self) -> None:
        css = rule(".kg-node .kg-tt")
        self.assertIn("-webkit-line-clamp:2", css)
        self.assertIn("overflow:hidden", css)
        self.assertNotIn("nowrap", rule(".kg-node .kg-t"))

    def test_full_title_stays_in_the_tooltip(self) -> None:
        self.assertRegex(BUNDLE, r"title: t\.t,\n\s+role: \"button\"")


if __name__ == "__main__":
    unittest.main()
