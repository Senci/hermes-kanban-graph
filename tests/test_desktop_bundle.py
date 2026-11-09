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


def block(pattern: str) -> str:
    m = re.search(pattern, BUNDLE, re.S)
    if not m:
        raise AssertionError(f"no match for {pattern}")
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
        self.assertTrue(has(r'"aria-label": `\$\{t\.t\}, \$\{t\.s\}\$\{t\.p > 0 \? `, priority \$\{t\.p\}` : ""\}'))


class ResetToolbarTest(unittest.TestCase):
    def test_reset_covers_every_remembered_key(self) -> None:
        keys = set(re.findall(r"(\w+): \$\w+", block(r"var PREFS = \{([^}]*)\}")))
        self.assertEqual(keys, set(re.findall(r"(\w+):", block(r"var DEFAULTS = \{([^}]*)\}"))))
        written = set(re.findall(r"storage\.set\(\"(\w+)\"", BUNDLE)) | set(re.findall(r"setPref\(\"(\w+)\"", BUNDLE))
        self.assertTrue(written <= keys, written - keys)
        self.assertTrue({"mode", "board", "arrange", "density"} <= keys)

    def test_reset_control_is_labelled(self) -> None:
        self.assertTrue(has(r"onClick: resetToolbar, \"aria-label\": \"Reset toolbar to defaults\""))


class CardViewTest(unittest.TestCase):
    def test_compact_density_drops_the_subtitle_only(self) -> None:
        self.assertTrue(has(r'view\.density === "compact" \|\| !\(run \|\| sub\) \? null : h\d*\(\s*"div",\s*\{ className: "kg-s"'))

    def test_card_view_trigger_is_labelled(self) -> None:
        self.assertTrue(has(r"\"aria-label\": \"Card view\""))


class SubtitleFieldsTest(unittest.TestCase):
    def test_default_is_the_old_subtitle(self) -> None:
        self.assertTrue(has(r"fields: \[\"id\", \"assignee\", \"model\"\]"))

    def test_each_field_is_gated_and_each_switch_is_labelled(self) -> None:
        for field in ("id", "assignee", "model"):
            self.assertTrue(has(r"show\(\"%s\"\)" % field), field)
        self.assertTrue(has(r"\"aria-label\": `Show \$\{f\.label\.toLowerCase\(\)\} in the subtitle`"))


class StripeColorTest(unittest.TestCase):
    def test_stripe_follows_the_color_choice_and_defaults_to_status(self) -> None:
        self.assertTrue(has(r"color: \"status\""))
        self.assertTrue(has(r"background: stripeTone\(t, view\.color, view\.maxP\)"))


if __name__ == "__main__":
    unittest.main()
