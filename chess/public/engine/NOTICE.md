# Stockfish engine

This application distributes the **unmodified Stockfish.js 19.0.1 lite,
single-threaded WebAssembly build**, maintained by Nathan Rugg and contributors,
based on the Stockfish chess engine.

- License: GNU General Public License version 3; the full text is in
  [COPYING.txt](./COPYING.txt).
- Exact source release: <https://github.com/nmrugg/stockfish.js/tree/v19.0.1>
- Included corresponding source archive:
  [stockfish-source-v19.0.1.tar.gz](./stockfish-source-v19.0.1.tar.gz)
- Corresponding source archive:
  <https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.1.tar.gz>
- Release and original compiled files:
  <https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1>
- Upstream Stockfish: <https://github.com/official-stockfish/Stockfish>

The source release contains the engine source, JavaScript integration and build
scripts. Follow its build instructions; the lite single-thread build uses
`node build.js --single-threaded --lite -f`. The application communicates with
the separate engine worker using the UCI protocol.

The exact lite neural-network file is included as
[nn-61e7af4bb97d.nnue](./nn-61e7af4bb97d.nnue). To rebuild without downloading
the network, copy it into the extracted source's `src/` directory before running
the build. Its SHA-256 is
`61e7af4bb97d51eeeb25d322916f86513b5cd3a827ce189c98c6e31946f99e5b`.
The original network is available from
<https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue>.

The distributed files were copied from the pinned `stockfish@19.0.1` npm package:

| File | SHA-256 |
| --- | --- |
| stockfish-19-lite-single.js | ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a |
| stockfish-19-lite-single.wasm | ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de |

Both engine files must remain alongside each other at `/engine/`, served as
JavaScript and WebAssembly respectively. This single-thread build does not
require cross-origin-isolation headers or SharedArrayBuffer.

## Difficulty and analysis

Difficulty labels (approximately 400, 700, 1000, 1300, 1600, 1900 and 2200) are
product difficulty indicators, not independently measured FIDE, Chess.com or
Lichess ratings. They must not be used as real player ratings.

All levels use Stockfish's native strength controls. Levels 1300 and above use
`UCI_LimitStrength` and a `UCI_Elo` value clamped to the engine's advertised
supported range. The three lowest levels use `Skill Level`, shallow search
limits and probabilistic selection among **engine-evaluated MultiPV candidates**.
They never select an unchecked random legal move. This extra weakening is
necessary because Stockfish's native Elo range does not reach 400.

The default search budget can be changed in the game setup. Device speed and the
search budget affect practical strength. The displayed rating remains approximate.

Analysis always disables strength limitations. Evaluation is in centipawns from
White's perspective. Move classifications use centipawn loss: up to 15 is
“best”, under 50 “good”, under 100 “inaccuracy”, under 250 “mistake”, and 250 or
more “blunder”. These labels are estimates at the configured search budget.
Positions with forced mate use a large signed score and a separate mate distance.

Protocol references:

- <https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html>
- <https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html>

## Sound

`lib/sound.ts` synthesizes all chess sounds with the Web Audio API. No downloaded
audio samples or third-party sound assets are included.
