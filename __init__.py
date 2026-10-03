"""kanban-graph: read-only dependency graph of Hermes kanban boards.

The surface is dashboard/plugin_api.py (backend routes) and desktop/plugin.js (desktop page). The
agent half adds no tools or hooks; it only registers the bundled skill, loadable as
skill_view("kanban-graph:board-graph").
"""

from pathlib import Path


def register(ctx) -> None:
    skills = Path(__file__).parent / "skills"
    for child in sorted(skills.iterdir()) if skills.is_dir() else []:
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.exists():
            ctx.register_skill(child.name, skill_md)
