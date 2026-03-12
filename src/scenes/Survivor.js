// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: Enemy.js → Player.js → Survivor.js

/**
 * Survivor Scene
 *
 * Responsible for:
 *  - Loading assets described in enemy JSON configs
 *  - Creating the map, player, enemies, and wiring overlaps
 *
 * Player movement, input, attack, and hitbox logic all live in Player.js.
 * Enemy AI lives in Enemy.js.
 *
 * Adding a new enemy type only requires:
 *  1. Drop a new JSON in assets/enemies/
 *  2. this.load.json('myEnemy', 'assets/enemies/myEnemy.json') in preload()
 *  3. Call this._loadEnemySpritesheets() + this._createEnemyAnimations() with that config
 *  4. Spawn enemies with this._spawnEnemies(config, count)
 */

class Survivor extends Phaser.Scene {

    constructor() {
        super('Survivor');
    }

    /* =========================================================
       PRELOAD
    ========================================================= */

    preload() {

        // --- Tiles ---
        const T = 'assets/GroundTiles/';
        ['grass1', 'grass2', 'grass3',
            'cobblestone1', 'cobblestone2', 'cobblestone3',
            'dirty1', 'dirty2', 'dirty3'].forEach(key => {
            this.load.image(key, `${T}${key.replace(/\d/, '_$&')}.png`);
        });

        this.load.json('map', 'assets/map.json');

        // --- Player ---
        this.load.spritesheet('knight', 'assets/Characters/skull knight-Sheet.png', {
            frameWidth: 64,
            frameHeight: 64,
        });

        // --- Enemy configs ---
        this.load.json('enemy-creepy', 'assets/enemies/creepy.json');

        this.load.once('filecomplete-json-enemy-creepy', (_key, _type, config) => {
            this._loadEnemySpritesheets(config);
        });
    }

    /* =========================================================
       CREATE
    ========================================================= */

    create() {

        const { width, height } = this.scale;

        this._createFloor();

        // Player — animations, input, hitbox, and preUpdate all self-contained
        this.player = new Player(this, width / 2, height / 2, {
            debug: true,
        });

        // Enemies
        const creepyConfig = this.cache.json.get('enemy-creepy');
        this._createEnemyAnimations(creepyConfig);

        this.enemies = this.physics.add.group({ runChildUpdate: true });
        this._spawnEnemies(creepyConfig, 10, width, height);

        // Wire sword → enemy overlap (enemies group lives here, not in Player)
        this.physics.add.overlap(
            this.player.swordHitbox,
            this.enemies,
            this.player.onSwordHit,
            null,
            this.player   // callbackContext → keeps `this` = player inside handler
        );

        if (this.player.DEBUG_HITBOX) {
            this.physics.world.createDebugGraphic();
        }

        this.physics.world.setBounds(0, 0, width, height);
    }

    /* =========================================================
       UPDATE
       (Player.preUpdate and Enemy.preUpdate run automatically.)
    ========================================================= */

    // update() intentionally omitted — nothing scene-level to do each frame.

    /* =========================================================
       ASSET LOADING HELPERS
    ========================================================= */

    _loadEnemySpritesheets(config) {

        const { spritePath, spritePrefix, frameHeight, animations } = config;

        Object.entries(animations).forEach(([animName, data]) => {

            const key        = spritePrefix + animName;
            const frameWidth = data.totalWidth / data.cols;
            const path       = `${spritePath}${key}.png`;

            this.load.spritesheet(key, path, {frameWidth, frameHeight });
        });
    }

    _createEnemyAnimations(config) {

        const { spritePrefix, animations } = config;

        Object.entries(animations).forEach(([animName, data]) => {

            const key = spritePrefix + animName;

            this.anims.create({
                key,
                frames: this.anims.generateFrameNumbers(key, {
                    start: 0,
                    end:   data.cols - 1,
                }),
                frameRate: data.fps,
                repeat:    data.repeat,
            });
        });
    }

    /* =========================================================
       FLOOR
    ========================================================= */

    _createFloor() {

        const { width, height } = this.scale;
        const mapData = this.cache.json.get('map');
        const { cols, tileSize, tileset, detail } = mapData;
        const scale = tileSize / 1024;

        this.make.tileSprite({
            x: 0, y: 0, width, height,
            key: 'grass1',
            origin: { x: 0, y: 0 },
            add: true,
        })
            .setDepth(0)
            .setTileScale(scale, scale);

        if (!detail) return;

        detail.forEach((id, i) => {
            if (id === 0) return;
            const col = i % cols;
            const row = Math.floor(i / cols);
            this.add
                .image(col * tileSize + tileSize / 2, row * tileSize + tileSize / 2, tileset[id])
                .setDepth(1)
                .setDisplaySize(tileSize, tileSize);
        });
    }

    /* =========================================================
       ENEMY SPAWNING
    ========================================================= */

    _spawnEnemies(config, count, width, height) {

        const MARGIN = 80;

        for (let i = 0; i < count; i++) {

            const x = Phaser.Math.Between(MARGIN, width - MARGIN);
            const y = Phaser.Math.Between(MARGIN, height - MARGIN);

            const enemy = new Enemy(this, x, y, config);

            enemy.setDepth(2);
            enemy.setTarget(this.player);
            enemy.play(config.spritePrefix + 'idle');

            this.enemies.add(enemy);
        }
    }
}