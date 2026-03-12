// No import/export — Phaser is a global loaded via <script> tag in index.html
// Enemy must be loaded in a <script> tag before this file.

/**
 * Survivor Scene
 *
 * Responsible for:
 *  - Loading assets described in enemy JSON configs
 *  - Creating the map, player, enemies, and input
 *  - Running the update loop (movement, attack, hitbox, debug)
 *
 * Adding a new enemy type only requires:
 *  1. Drop a new JSON in assets/enemies/
 *  2. this.load.json('myEnemy', 'assets/enemies/myEnemy.json') in preload()
 *  3. Call this._loadEnemyAssets() and this._createEnemyAnimations() with that config
 *  4. Spawn enemies with this._spawnEnemies(config, count)
 */

class Survivor extends Phaser.Scene {

    static Direction = {
        UP: 'up',
        DOWN: 'down',
        LEFT: 'left',
        RIGHT: 'right',
    };

    constructor() {
        super('Survivor');
    }

    /* =========================================================
       INIT — reset all state between restarts
    ========================================================= */

    init() {

        this.player = null;
        this.cursors = null;
        this.wasd = null;
        this.attackKey = null;

        this.lastDirection = Survivor.Direction.DOWN;
        this.isAttacking = false;
        this.comboQueued = false;
        this.comboWindowOpen = false;

        this.swordHitbox = null;
        this.enemies = null;

        // Debug
        this.DEBUG_HITBOX = true;
        this.debugGraphics = null;
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
        // Each JSON file drives both spritesheet loading AND animation creation.
        this.load.json('enemy-creepy', 'assets/enemies/creepy.json');

        // Spritesheets are loaded AFTER the JSON is parsed (see create()).
        // We use a callback on the FileComplete event for that.
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
        this._createPlayerAnimations();

        // Build enemy animations from JSON — spritesheets are ready by now
        const creepyConfig = this.cache.json.get('enemy-creepy');
        this._createEnemyAnimations(creepyConfig);

        this._createPlayer(width, height);
        this._createInput();
        this._createSwordHitbox();

        // Spawn enemies and wire up the sword overlap
        this.enemies = this.physics.add.group({ runChildUpdate: true });
        this._spawnEnemies(creepyConfig, 10, width, height);

        this.physics.add.overlap(
            this.swordHitbox,
            this.enemies,
            this._onSwordHitEnemy,
            null,
            this
        );

        if (this.DEBUG_HITBOX) {
            this.debugGraphics = this.add.graphics().setDepth(1000);
            this.physics.world.createDebugGraphic();
        }

        this.physics.world.setBounds(0, 0, width, height);
    }

    /* =========================================================
       UPDATE
    ========================================================= */

    update() {

        this._handleMovement();
        this._handleAttack();
        this._updateHitboxPosition();

        if (this.DEBUG_HITBOX) this._drawDebugHitbox();
    }

    /* =========================================================
       ASSET LOADING HELPERS
    ========================================================= */

    /**
     * Called during the Loader's filecomplete event so the JSON is
     * already parsed when we register the spritesheets.
     *
     * frameWidth = totalWidth / cols  (both values live in the JSON)
     */
    _loadEnemySpritesheets(config) {

        const { spritePath, spritePrefix, frameHeight, animations } = config;

        Object.entries(animations).forEach(([animName, data]) => {

            const key = spritePrefix + animName;
            const frameWidth = data.totalWidth / data.cols;
            const path = `${spritePath}${key}.png`;

            this.load.spritesheet(key, path, { frameWidth, frameHeight });
        });
    }

    /* =========================================================
       ANIMATION CREATION
    ========================================================= */

    _createPlayerAnimations() {

        const row = n => ({ start: n * 6, end: n * 6 + 5 });
        const row5 = n => ({ start: n * 6, end: n * 6 + 4 });

        const add = (key, frames, fps, repeat = -1) =>
            this.anims.create({
                key,
                frames: this.anims.generateFrameNumbers('knight', frames),
                frameRate: fps,
                repeat,
            });

        add('walk-down', row(0), 10);
        add('walk-left', row(1), 10);
        add('walk-right', row(2), 10);
        add('walk-up', row(3), 10);

        add('idle-down', row(4), 6);
        add('idle-left', row(5), 6);
        add('idle-right', row(6), 6);
        add('idle-up', row(7), 6);

        add('attack-down', row(8), 12, 0);
        add('attack-up', row(9), 12, 0);
        add('attack-left', row(10), 12, 0);
        add('attack-right', row(11), 12, 0);

        add('parry-right', row5(12), 10, 0);
        add('parry-left', row5(13), 10, 0);
        add('parry-down', row5(14), 10, 0);
        add('parry-up', row5(15), 10, 0);
    }

    /**
     * Reads the enemy JSON and registers one Phaser animation per entry.
     * Frame count comes directly from data.cols (matches the spritesheet).
     */
    _createEnemyAnimations(config) {

        const { spritePrefix, animations } = config;

        Object.entries(animations).forEach(([animName, data]) => {

            const key = spritePrefix + animName;

            this.anims.create({
                key,
                frames: this.anims.generateFrameNumbers(key, {
                    start: 0,
                    end: data.cols - 1,
                }),
                frameRate: data.fps,
                repeat: data.repeat,
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
       PLAYER
    ========================================================= */

    _createPlayer(width, height) {

        this.player = this.physics.add.sprite(width / 2, height / 2, 'knight', 0);
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(2);
        this.player.setScale(2);
        this.player.setBodySize(20, 24);
        this.player.anims.play('idle-down');
    }

    /* =========================================================
       ENEMY SPAWNING
    ========================================================= */

    /**
     * Creates `count` Enemy instances from a config object and adds them
     * to this.enemies group. All enemies automatically track the player.
     */
    _spawnEnemies(config, count, width, height) {

        const MARGIN = 80;

        for (let i = 0; i < count; i++) {

            const x = Phaser.Math.Between(MARGIN, width - MARGIN);
            const y = Phaser.Math.Between(MARGIN, height - MARGIN);

            const enemy = new Enemy(this, x, y, config);

            // add.existing() and physics.add.existing() are called inside
            // the Enemy constructor — just add to the group here.
            enemy.setDepth(2);
            enemy.setTarget(this.player);

            // Play idle to start
            enemy.play(config.spritePrefix + 'idle');

            this.enemies.add(enemy);
        }
    }

    /* =========================================================
       INPUT
    ========================================================= */

    _createInput() {

        this.cursors = this.input.keyboard.createCursorKeys();

        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        });

        this.attackKey = this.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.K
        );
    }

    /* =========================================================
       SWORD HITBOX
    ========================================================= */

    _createSwordHitbox() {

        this.swordHitbox = this.add.zone(0, 0, 60, 40);
        this.physics.add.existing(this.swordHitbox);
        this.swordHitbox.body.setAllowGravity(false);
        this.swordHitbox.body.enable = false;
    }

    _updateHitboxPosition() {

        if (!this.swordHitbox.body.enable) return;

        const p = this.player;
        const dir = this.lastDirection;
        const OFFSET = 40;

        let x = p.x;
        let y = p.y;

        if (dir === Survivor.Direction.UP) y -= OFFSET;
        if (dir === Survivor.Direction.DOWN) y += OFFSET;
        if (dir === Survivor.Direction.LEFT) x -= OFFSET;
        if (dir === Survivor.Direction.RIGHT) x += OFFSET;

        this.swordHitbox.setPosition(x, y);
    }

    _enableSwordHitbox() {

        this.swordHitbox.body.enable = true;

        this.time.delayedCall(80, () => {
            this.swordHitbox.body.enable = false;
        });
    }

    /* =========================================================
       ATTACK (with combo)
    ========================================================= */

    _handleAttack() {

        if (!Phaser.Input.Keyboard.JustDown(this.attackKey)) return;

        if (this.isAttacking) {
            if (this.comboWindowOpen) this.comboQueued = true;
            return;
        }

        this._startAttack();
    }

    _startAttack() {

        const dir = this.lastDirection;
        const anim = `attack-${dir}`;

        this.isAttacking = true;
        this.comboQueued = false;
        this.comboWindowOpen = false;

        this.player.setVelocity(0, 0);
        this.player.anims.play(anim, true);

        this._enableSwordHitbox();

        const DURATION = 500;

        this.time.delayedCall(DURATION * 0.75, () => {
            this.comboWindowOpen = true;
        });

        this.time.delayedCall(DURATION, () => {

            if (this.comboQueued) {
                this._startAttack();
                return;
            }

            this.isAttacking = false;
            this.comboWindowOpen = false;
            this.player.anims.play(`idle-${dir}`);
        });
    }

    _onSwordHitEnemy(_hitbox, enemy) {
        // Enemy class handles its own hit/death logic
        enemy.takeDamage(25);
    }

    /* =========================================================
       MOVEMENT
    ========================================================= */

    _handleMovement() {

        if (this.isAttacking) {
            this.player.setVelocity(0, 0);
            return;
        }

        const { player, cursors, wasd } = this;
        const SPEED = 160;

        const goLeft = cursors.left.isDown || wasd.left.isDown;
        const goRight = cursors.right.isDown || wasd.right.isDown;
        const goUp = cursors.up.isDown || wasd.up.isDown;
        const goDown = cursors.down.isDown || wasd.down.isDown;

        let vx = 0;
        let vy = 0;

        if (goLeft) vx = -SPEED;
        if (goRight) vx = SPEED;
        if (goUp) vy = -SPEED;
        if (goDown) vy = SPEED;

        // Normalize diagonal speed
        if (vx !== 0 && vy !== 0) {
            const D = SPEED * 0.7071;
            vx = vx > 0 ? D : -D;
            vy = vy > 0 ? D : -D;
        }

        player.setVelocity(vx, vy);

        if (vx === 0 && vy === 0) {
            player.anims.play(`idle-${this.lastDirection}`, true);
            return;
        }

        // Vertical takes priority over horizontal for direction tracking
        if (goDown && !goUp) { this.lastDirection = Survivor.Direction.DOWN; player.anims.play('walk-down', true); }
        else if (goUp && !goDown) { this.lastDirection = Survivor.Direction.UP; player.anims.play('walk-up', true); }
        else if (goLeft) { this.lastDirection = Survivor.Direction.LEFT; player.anims.play('walk-left', true); }
        else if (goRight) { this.lastDirection = Survivor.Direction.RIGHT; player.anims.play('walk-right', true); }
    }

    /* =========================================================
       DEBUG
    ========================================================= */

    _drawDebugHitbox() {

        this.debugGraphics.clear();

        if (!this.swordHitbox.body.enable) return;

        const { x, y, width, height } = this.swordHitbox.body;

        this.debugGraphics
            .lineStyle(2, 0xff0000)
            .strokeRect(x, y, width, height);
    }
}