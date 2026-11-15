# Rex Sesh

A Raycast extension that manages [Rex](https://www.superlogical.com/rex) sessions, inspired by
[joshmedeski/sesh](https://github.com/joshmedeski/sesh).

One list combines:

- **Rex Sessions**: live sessions from `rex ls`, with the focused pane's directory and program
- **Configured**: `[[session]]` entries from a sesh-compatible `sesh.toml`
- **Zoxide**: your `zoxide query --list` directories, in frecency order

Press **Enter** to switch to a live session. On a directory, Enter creates the session and switches to
it. If a session with that name already exists, it switches to that one instead of making a duplicate.

## Commands

| Command          | What it does                                                    |
| ---------------- | --------------------------------------------------------------- |
| Search Sessions  | The picker described above                                      |
| Create Session   | A form to pick a directory, name, and startup command           |
| Next Session     | Tells the Rex app to show the next session (`session.next`)     |
| Previous Session | Tells the Rex app to show the previous session (`session.previous`) |

## Picker shortcuts

| Key                 | Action                                         |
| ------------------- | ---------------------------------------------- |
| `Enter`             | Switch to the session, or create it            |
| `⌘ ⇧ Enter`         | Create a session with a custom name or command |
| `⌘ E`               | Rename the live session                        |
| `⌃ X`               | Kill the live session (asks first)             |
| `⌘ ⇧ P`             | Show or hide the preview panel                 |
| `⌘ N`               | New session form                               |
| `⌘ ⇧ R`             | Refresh                                        |
| `⌘ O` / `⌘ ⇧ C`     | Show in Finder / copy path                     |
| `⌘ ⇧ ,`             | Open the config file                           |

Use the dropdown in the search bar to show only one source.

### Changing shortcuts

Every shortcut above except Enter can be changed in the **Search Sessions** command's preferences
(Raycast Settings → Extensions → Rex Sesh → Search Sessions). Type the shortcut as text:

- `cmd+shift+p`, `ctrl-x`, `opt+up`, `Cmd Shift Enter`, or symbols like `⌘⇧P`
- Modifiers: `cmd`/`⌘`, `ctrl`/`⌃`, `opt`/`alt`/`⌥`, `shift`/`⇧`
- Keys: letters, digits, punctuation, `enter`, `tab`, `space`, `escape`, `backspace`, `delete`, arrows (`up`, `down`, …),
  `home`, `end`, `pageUp`, `pageDown`
- Leave it empty for the default. Enter `none` to remove the shortcut.

Each shortcut needs at least one modifier. If a value can't be read, or it's one Raycast reserves (such as `cmd+k`), the
default is used. If two actions share a shortcut, the second one loses it. The picker shows a toast explaining any of these.

To open a command with a global hotkey, assign one in Raycast Settings → Extensions → Rex Sesh. Next Session and
Previous Session are meant for this.

The preview shows the focused pane's screen for live sessions. For directories it shows
`preview_command` output, or a plain `ls`.

## Configuration

The extension reads `~/.config/rex-sesh/sesh.toml`, then falls back to `~/.config/sesh/sesh.toml`, so an
existing sesh config works as-is. You can set another path in the extension's preferences.

```toml
blacklist = ["^scratch$"]
sort_order = ["rex", "config", "zoxide"] # "tmux" is accepted as an alias for "rex"
import = ["~/.config/sesh/work.toml"]

[default_session]
startup_command = "nvim"
preview_command = "eza --all --git --icons=always --color=always {}"
windows = []

[[session]]
name = "api"
path = "~/code/api"
startup_command = "nvim"
preview_command = "bat --color=always README.md"
windows = ["server", "git"]
# disable_startup_command = true

[[window]]
name = "server"
startup_script = "npm run dev"

[[window]]
name = "git"
startup_script = "lazygit"
path = "~/code/api" # optional; defaults to the session's path
```

- `{}` in a command is replaced with the shell-quoted session path.
- Startup commands are typed into the new tab's shell, so the shell stays open after the command exits.
- `windows` become extra Rex tabs. The first tab keeps focus.
- Names for directories follow sesh: the Git repository's name, plus the subpath inside the repository
  (`webapp/backend`), or else the folder name.

### Preferences

| Preference                  | Default                                  |
| --------------------------- | ---------------------------------------- |
| Rex CLI Path                | Detected automatically (bundled server CLI, Homebrew, `~/.local/bin`) |
| Config File                 | See above                                |
| Rex Client                  | First connected Rex app                  |
| Show zoxide directories     | On                                       |
| Show preview panel          | On                                       |
| Run default startup command | On                                       |

## Requirements

- The Rex app, running, with **Remote Control** turned on. Switching sessions uses the client action
  `session.select`.
- `zoxide` (optional), `git` (optional, for naming sessions after repositories)

## Development

```sh
npm install
npm run dev     # loads the extension into Raycast with hot reload
npm run lint
npm run build
```

Before publishing to the Raycast Store, set `author` in `package.json` to your Raycast username.
