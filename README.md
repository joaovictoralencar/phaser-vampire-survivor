# Overlord Rising

Overlord Rising is a prototype top‑down action game built with **Phaser 3**.  
The player controls a knight in an arena populated by configurable enemies; the codebase is organised to make experimentation with Phaser’s animation, physics, and component systems easy.

---

## Repository layout

```
BackToPhaser/
├── assets/                   # images, JSON configurations, tile graphics
│   ├── enemies/              # enemy definition files (e.g. creepy.json)
│   ├── GroundTiles/          # floor tile images
│   ├── Characters/           # player and enemy spritesheets
│   └── map.json              # simple map metadata used by Survivor scene
├── phaser.js                 # Phaser 3 runtime library (v3.88.2)
├── project.config            # metadata for the Phaser Editor
├── README.md                 # this document
└── src/                      # game source code
    ├── AttackComponent.js    # reusable attack logic & hit‑box management
    ├── HealthComponent.js    # HP, damage, i‑frames, and callbacks
    ├── Enemy.js              # enemy class, AI, damage cone, state machine
    ├── Player.js             # player sprite, movement, combos, health
    ├── main.js               # Phaser configuration / game instantiation
    └── scenes/
        └── Survivor.js       # primary scene handling loading, updates, input
```

Assets are referenced via relative paths; serve the project root when running the game.

---

## Dependencies

- **Phaser 3** — bundled as `phaser.js` or installable via npm (`npm install phaser`).
- Any simple static HTTP server (`serve`, `http-server`, Python’s `http.server`, etc.). Browsers block `file://` requests.

---

## Running the game

1. Clone/extract the repository.
2. Make sure `phaser.js` is present or install Phaser if using a build system.
3. Launch a static server from the project root:
   ```sh
   npx serve .            # or similar command
   ```

4. Open the URL shown by the server (e.g. `http://localhost:5000`) in a browser.
5. Use the controls below to play.

---

## Controls

- **Movement:** arrow keys or WASD
- **Attack:** `K`  
  - tap repeatedly to chain a two‑hit combo; timing opens a combo window.
- **Debug hitboxes:** enabled by default in the `Survivor` scene; disable by setting `Survivor.DEBUG_HITBOX = false` or passing `debug: false` to the Player constructor.
- **(Future)** placeholder animations for parry are available (`L` could be wired later).

---

## Core classes and methods

### `src/AttackComponent.js`

Defines a component hierarchy used by both player and enemies:

- **`AttackComponent`** – base class managing `damage`, `isAttacking` flag and a generic `trigger(direction)`/`cancel()` lifecycle.  
- **`MeleeAttackComponent`** – subclass that creates a directional `Zone` hitbox, sizes/positions it according to swing direction, enables it for a short `duration` and overlaps against a physics group.  
  - Configurable defaults for offsets, hitbox size and targets group.
  - Fires an `onHit(target)` callback when an overlap occurs.

This decouples hit‑detection from the actor and allows easy extension (e.g. ranged attacks) later.

### `src/HealthComponent.js`

Reusable component tracking HP, invincibility frames (`iFrames`), and death state.

- Provides `takeDamage(amount)`, `heal(amount)`, `revive(hp?)`, and a read‑only `ratio` (0–1).
- Callback hooks: `onHit`, `onDie`, `onHeal`, `onRevive`.
- Optional debug logging.
- Automatically manages a temporary invincibility window after a hit.

Both `Player` and `Enemy` instantiate this component with game‑specific behaviour.

### `src/Player.js`

`Player` extends `Phaser.Physics.Arcade.Sprite` and composes health and attack components.

Key responsibilities:

- Movement with diagonal normalization and four‑direction animations.
- Combo‑chain attacks: pressing the attack key during a short “combo window” queues a second swing.
- Cancelable `MeleeAttackComponent` that overlaps against the enemies group.
- Health: 500 HP, 600 ms invincibility after hits, tint effects on damage, and an event when the player dies.
- Debug graphics for the active hitbox when `DEBUG_HITBOX` is true.
- Animations include walking, idling, directional attacks, and placeholder parry frames.

Public API is mostly internal; scene code wires up the player and listens for `'player-died'`.

### `src/Enemy.js`

`Enemy` extends `Phaser.Physics.Arcade.Sprite` and uses both components as well.

- **State machine:** `AWAKENING`, `IDLE`, `WALK`, `ATTACK1`, `ATTACK2`, `HIT`, `DIE`.
- **AI:** detection and attack radii from config.  
  - Chase the player when within detection radius.
  - Pick between two attack animations when in range.
- **Damage timing:** schedules a delayed hit at the visual midpoint of the attack, using a directional cone check (cos‑dot) so only targets roughly in front are damaged.
- Health component handles hurt tint and death animation, and disables the body when dead.
- On animation complete the enemy automatically transitions back to `IDLE` (or destroys itself on death).
- Flips sprite to face the player when chasing.

Enemy configurations live in JSON files under `assets/enemies` and are loaded by `Survivor`.

### `src/scenes/Survivor.js`

The primary scene orchestrating asset loading, floor drawing, player/enemy spawning and input.

- `preload()` loads tile images, the knight spritesheet, and enemy JSON configs.  
  - After parsing a config the `_loadEnemySpritesheets()` helper registers the required sheets.
- `create()` builds the floor, spawns enemies, instantiates the player (passing the enemies group for hit detection), and hooks up death events.
- `_spawnEnemies(config, count, …)` creates enemy instances at random locations.
- Floor drawing uses `assets/map.json`; optional detail tiles are placed according to the data.
- Additional helpers simplify loading and animation creation for enemies.

---

## Gameplay mechanics

- **Movement:** arcade physics velocities with diagonal normalization; last direction determines idle/attack animation.
- **Attacking:** triggers a short‑lived hitbox zone; enemies take fixed damage and play hit/ death animations. Combos are possible by timing subsequent key presses.
- **Health:** player and enemies use `HealthComponent`. The player has i‑frames, tint effects, and emits a game‑over event on death.
- **Enemies:** two attack styles, directional cone damage (prevents hitting targets behind), simple chase/idle behaviour. Damage is applied with a delay matching the animation.
- **New systems:** reusable `HealthComponent` and `AttackComponent` promote code reuse and make adding new actors easier.

---

## Extending the project

To add a new enemy type:

1. Create a JSON config under `assets/enemies/` describing sprite paths, animation frames, stats, and radii.
2. Load the JSON in `Survivor.preload()` and let `_loadEnemySpritesheets()` register its spritesheets.
3. Call `_createEnemyAnimations(config)` in `create()` to register animations.
4. Spawn the desired number of enemies with `_spawnEnemies(config, count, ...)`. New instances will automatically use the provided config.

To add player abilities (e.g. a ranged attack or parry):

- Extend `AttackComponent` or subclass `MeleeAttackComponent`.
- Hook custom logic into `Player` (look at `_startAttack` and `_handleAttack` for combo management).

The component architecture makes behaviours modular.

---

## Configuration

Project metadata (title, dimensions) are kept in `project.config` for Phaser Editor; game logic values are hard‑coded in `src/main.js` and the various component constructors.

---

## License

See the `LICENSE` file for terms. This project is not intended for commercial use; redistribution or sale of the code or assets requires explicit permission from the author.

