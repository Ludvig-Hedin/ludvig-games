# Ludvig Games

Experimental games made by Ludvig Hedin: the hub at [games.ludvighedin.com](https://games.ludvighedin.com), its separate game sites, and a Mac app that runs all of them offline and lets people on the same Wi‑Fi play together.

**[Download for Mac](https://github.com/Ludvig-Hedin/ludvig-games/releases/latest/download/Ludvig-Games-mac-arm64.dmg)** (Apple Silicon). The app is not signed with an Apple Developer ID yet: the first time, open **System Settings → Privacy & Security** and click **Open Anyway**.

## What is here

| Folder | What it is |
| --- | --- |
| `ludvig-games/` | The hub: catalog, 52 single-file games (`source-games/`), leaderboards and room service |
| `air-hockey/`, `chess/`, `color-clash/`, `gravity-arena/`, `hangd/`, `hoop-rush/`, `little-links/`, `ludo/`, `mind-games/`, `ox/`, `salvo/`, `table-tennis/` | Games with their own Cloudflare Worker (vinext, React) |
| `ritkaos/` | Drawing party game, a dependency-free Node server |
| `desktop/` | The Mac app (Electron and Miniflare) |

Each folder has its own README with how to run and build it.

## License

Source available under the PolyForm Strict License 1.0.0: read and play for personal, noncommercial use, no copying or redistribution. `chess/` is GPL 3.0. Third-party files keep their own licenses. See `NOTICE.md`.
