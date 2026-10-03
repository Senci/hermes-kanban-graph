# Snapshot CLI

```
python3 snapshot/kanban_graph.py [options]
```

Renders boards to one self-contained HTML file. Python 3.11+, standard library only, read-only.

| Option | Default | Meaning |
|---|---|---|
| `--board SLUG` | all boards | Board to include; repeat for several |
| `--hide-status STATUS` | none | Drop tasks in this status; repeat for several |
| `--focus-status STATUS` | none | Keep tasks in this status plus their lineage; repeat for several |
| `--archived` | off | Include archived tasks |
| `--archived-boards` | off | Include boards marked archived |
| `--out PATH` | `$HERMES_HOME/cache/kanban-graph/<name>.html` | Output file; `<name>` is the board slug or `all-boards`, plus `-<status>` for each focus status |
| `--list` | | Print `slug<TAB>name<TAB>db path` per board and exit |

Environment:

| Variable | Default | Meaning |
|---|---|---|
| `HERMES_KANBAN_HOME` | unset | Hermes root to read boards from; wins over `HERMES_HOME` |
| `HERMES_HOME` | `~/.hermes` | Hermes root; boards are read from `$HERMES_HOME/kanban/boards/`. A profile home (`<root>/profiles/<name>`) resolves to `<root>`, because boards are shared across profiles |

Output on success, one line on stdout:

```
<path>  boards=<n> tasks=<n> links=<n>
```

Exit codes: `0` success, `1` no boards under `$HERMES_HOME`, `2` unknown `--board` or bad
arguments. A missing plugin file next to the script also exits `1` with a message.

The file embeds the graph data, the layout code shared with the desktop page, and the Tabler icons
it uses. It loads nothing from the network.
