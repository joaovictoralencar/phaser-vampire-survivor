# Overlord Rising

Overlord Rising is a prototype top‑down action game built with Phaser 3. The player controls a knight in an arena populated by enemies configured via external JSON files. The codebase is organized for rapid iteration and experimentation with Phaser's animation and physics systems.

---

## Repository layout

```
BackToPhaser/
├── assets/                   # images, JSON configurations, tile graphics
│   ├── enemies/              # enemy definition files (e.g. creepy.json)
│   ├── GroundTiles/          # floor tile images
│   ├── Characters/           # player and enemy spritesheets
│   └── map.json              # simple map metadata used by Survivor scene
├── phaser.js                 # Phaser 3 runtime library (v3.88.2)
├── project.config            # metadata for the Phaser Editor
├── README.md                 # this document
└── src/                      # game source code
    ├── Enemy.js              # enemy class, state machine, AI logic
    ├── main.js               # Phaser configuration and game instantiation
    └── scenes/
        └── Survivor.js       # primary scene handling loading, updates, input
```

All assets are referenced via relative paths; the server's working directory must be the project root when running the game.

---

## Dependencies

- **Phaser 3** — included in the repo as `phaser.js` or installable via npm (`npm install phaser`).
- A local HTTP server to serve static files; any simple server (e.g. `serve`, `http-server`, Python's `http.server`) is sufficient. Browsers enforce security restrictions on `file://` loads.

---

## Running the game

1. Clone or extract the repository.
2. Ensure `phaser.js` is present, or install Phaser if using a build system.
3. Launch a static server from the project root:
   ```sh
   npx serve .            # or similar command
   ```
4. Open the URL shown by the server (e.g. `http://localhost:5000`) in a browser.
5. Use the keyboard controls described below to play.

---

## Controls

- **Movement:** arrow keys or WASD
- **Attack:** `K` (press repeatedly to queue simple combos)
- **Debug hitboxes:** enabled by default in the `Survivor` scene; disable by setting `Survivor.DEBUG_HITBOX = false`.

---

## Core classes and methods

### `src/main.js`

Defines the Phaser configuration object (`config`) including canvas size, physics settings, and initial scene list. Instantiates the game with `new Phaser.Game(config)`.

### `src/Enemy.js`

Contains the `Enemy` class that extends `Phaser.Physics.Arcade.Sprite`. Key responsibilities:

- State machine with states such as `IDLE`, `WALK`, `ATTACK1`, `HIT`, `DIE`.
- AI: detection radius, chasing, attacking, and taking damage.
- Public API: `setTarget(target)`, `takeDamage(amount)`.
- Physics and animation setup performed during construction.

Enemies are added to a physics group with `runChildUpdate: true`; their `preUpdate` method drives AI each frame.

### `src/scenes/Survivor.js`

The main gameplay scene. Important sections include:

- `preload()`: loads tile images, player spritesheet, and enemy JSON configurations. Sprite sheets for enemies are registered via `_loadEnemySpritesheets` once the JSON is parsed.
- `create()`: builds the floor, initializes player sprite and animations, creates input handlers, spawns enemies, and sets up physics overlaps.
- `_spawnEnemies(config, count)`: instantiates `Enemy` objects at random locations and assigns the player as their target.
- `update()`: handles player movement, attacking, and hitbox positioning each frame.

Auxiliary methods handle animation creation (`_createPlayerAnimations`, `_createEnemyAnimations`), input (`_createInput`), and debug rendering.

---

## Gameplay mechanics

- **Movement** uses arcade physics velocity with diagonal normalization. Direction is tracked to choose the correct animation.
- **Attacking** triggers a hitbox zone for a short duration; enemies take fixed damage and play hit/death animations.
- **Enemies** perform simple AI: if the player is within detection radius they chase, within attack radius they perform one of two attack animations, and otherwise they idle.
- Tile floor is drawn from `assets/map.json`; additional detail tiles are placed using image keys and coordinates.

---

## Extending the project

To add a new enemy type:

1. Create a JSON config under `assets/enemies/` describing sprite paths, animation frames, stats, and radii.
2. Load the JSON in `Survivor.preload()` and use `_loadEnemySpritesheets` in the filecomplete callback.
3. After loading, call `_createEnemyAnimations(config)` in `create()`.
4. Spawn the desired number of enemies with `_spawnEnemies(config, count)`; the new instances will automatically use the provided config.

Modifications to `Enemy.js` can introduce new behaviors or states as needed.

---

## Configuration

Metadata such as project title and default dimensions are stored in `project.config` for the Phaser Editor; the game code itself refers only to values hardcoded in `src/main.js`.

---

## License

See the `LICENSE` file for terms. This project is not intended for commercial use; redistribution or sale of the code or assets requires explicit permission from the author.

