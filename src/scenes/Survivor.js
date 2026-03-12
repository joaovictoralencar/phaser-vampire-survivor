// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: HealthComponent.js → AttackComponent.js → Enemy.js → Player.js → Survivor.js

class Survivor extends Phaser.Scene {

    constructor() {
        super('Survivor');
    }

    /* =========================================================
       PRELOAD
    ========================================================= */

    preload() {

        const T = 'assets/GroundTiles/';
        ['grass1', 'grass2', 'grass3',
            'cobblestone1', 'cobblestone2', 'cobblestone3',
            'dirty1', 'dirty2', 'dirty3'].forEach(key => {
            this.load.image(key, `${T}${key.replace(/\d/, '_$&')}.png`);
        });

        this.load.json('map', 'assets/map.json');

        this.load.spritesheet('knight', 'assets/Characters/skull knight-Sheet.png', {
            frameWidth:  64,
            frameHeight: 64,
        });

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

        // Enemies group must exist before Player so it can be passed in
        const creepyConfig = this.cache.json.get('enemy-creepy');
        this._createEnemyAnimations(creepyConfig);

        this.enemies = this.physics.add.group({ runChildUpdate: true });
        this._spawnEnemies(creepyConfig, 10, width, height);

        // Player wires its own overlap against the enemies group internally
        this.player = new Player(this, width / 2, height / 2, {
            debug:        false,
            enemiesGroup: this.enemies,
        });

        // Wire enemies to track the now-created player
        this.enemies.getChildren().forEach(e => e.setTarget(this.player));

        // ── DamageText ──────────────────────────────────────────
        // Swap fontFamily here to change the damage number font globally.
        // Any Google Font loaded in index.html works — Roboto is the default.
        this.damageText = new DamageText(this, {
            fontFamily:     'Roboto, sans-serif',
            baseFontSize:   22,
            strokeThickness: 4,
            floatDistance:  50,
            duration:       950,
        });

        // HealthComponent emits 'health-damaged' on every hit (fatal or not).
        // We resolve who was hit, grab the top-centre of their sprite, and fire.
        this.events.on('health-damaged', ({ owner, amount }) => {

            if (!owner.active) return;

            const top       = owner.getTopCenter();
            const recipient = owner === this.player ? 'player' : 'enemy';

            this.damageText.show(top.x, top.y, amount, recipient);
        });

        // ── HUD ────────────────────────────────────────────────
        this._createHud(width, height);

        // Listen for player death to trigger game over
        this.events.once('player-died', this._onPlayerDied, this);

        if (this.player.DEBUG_HITBOX) {
            this.physics.world.createDebugGraphic();
        }

        this.physics.world.setBounds(0, 0, width, height);
    }

    /* =========================================================
       UPDATE
    ========================================================= */

    update() {
        this._updateHud();
    }

    /* =========================================================
       SCENE EVENTS
    ========================================================= */

    _onPlayerDied() {
        // Update HUD one last time to show 0 HP
        if (this._hudHpValue) {
            this._hudHpValue.setText('0');
            this._hudHpValue.setColor('#ff4444');
        }
        if (this._hudHpBar) this._hudHpBar.setScale(0, 1);

        console.log('Player died — game over');
    }

    /* =========================================================
       HUD
    ========================================================= */

    /**
     * Creates a fixed-screen HUD with:
     *   • Heart icon + current / max HP (top-left)
     *   • "K  Attack" hint (bottom-right)
     *
     * All elements use scrollFactor(0) so they stay put even if
     * the camera ever moves.
     *
     * Font is the same as DamageText — change FONT_FAMILY below
     * to update both at once (or pass them separately if needed).
     */
    _createHud(width, height) {

        const FONT_FAMILY  = 'Roboto, sans-serif';
        const PAD          = 16;          // outer padding from screen edges
        const BAR_W        = 120;         // HP bar width
        const BAR_H        = 10;
        const BAR_Y_OFFSET = 30;          // px below the HP text line

        const maxHp = this.player.health.maxHp;

        // ── HP label ─────────────────────────────────────────
        this._hudHpLabel = this.add.text(PAD, PAD, '❤', {
            fontFamily: FONT_FAMILY,
            fontStyle:  'bold',
            fontSize:   '18px',
            color:      '#ff4444',
        })
            .setDepth(10000)
            .setScrollFactor(0);

        // Current HP value (updates every frame)
        this._hudHpValue = this.add.text(PAD + 26, PAD, `${maxHp}`, {
            fontFamily: FONT_FAMILY,
            fontStyle:  'bold',
            fontSize:   '18px',
            color:      '#ffffff',
        })
            .setDepth(10000)
            .setScrollFactor(0);

        // Max HP
        this._hudHpMax = this.add.text(PAD + 26, PAD, `/ ${maxHp}`, {
            fontFamily: FONT_FAMILY,
            fontSize:   '14px',
            color:      '#aaaaaa',
        })
            .setDepth(10000)
            .setScrollFactor(0);
        // Position the max label to the right of the value once text is set
        // (repositioned in _updateHud on first frame)

        // ── HP bar (thin bar under the numbers) ──────────────
        // Background track
        this.add.rectangle(PAD, PAD + BAR_Y_OFFSET, BAR_W, BAR_H, 0x333333)
            .setOrigin(0, 0)
            .setDepth(9999)
            .setScrollFactor(0);

        // Filled portion — scale X from 0 to 1 to represent ratio
        this._hudHpBar = this.add.rectangle(PAD, PAD + BAR_Y_OFFSET, BAR_W, BAR_H, 0x44dd44)
            .setOrigin(0, 0)
            .setDepth(10000)
            .setScrollFactor(0);

        // ── Control hint (bottom-right) ───────────────────────
        this._hudHint = this.add.text(width - PAD, height - PAD, 'K  —  Attack', {
            fontFamily: FONT_FAMILY,
            fontSize:   '14px',
            color:      '#cccccc',
            alpha:      0.75,
        })
            .setOrigin(1, 1)
            .setDepth(10000)
            .setScrollFactor(0);
    }

    /** Called from update() — keeps HP display in sync each frame. */
    _updateHud() {

        if (!this.player || !this._hudHpValue) return;

        const { hp, maxHp, isDead } = this.player.health;

        // Current HP text
        this._hudHpValue.setText(`${Math.max(0, Math.ceil(hp))}`);

        // Colour shifts: green → yellow → red
        const ratio = hp / maxHp;
        let barColor;
        if (ratio > 0.5)       barColor = 0x44dd44;
        else if (ratio > 0.25) barColor = 0xddcc00;
        else                   barColor = 0xdd2222;

        this._hudHpBar
            .setFillStyle(barColor)
            .setScale(ratio, 1);

        // HP text colour when low
        const textColor = ratio <= 0.25 ? '#ff4444' : '#ffffff';
        this._hudHpValue.setColor(textColor);

        // Position "/ maxHp" just to the right of the dynamic value
        const valueRight = this._hudHpValue.x + this._hudHpValue.width + 4;
        this._hudHpMax.setX(valueRight);
    }

    /* =========================================================
       ASSET LOADING HELPERS
    ========================================================= */

    _loadEnemySpritesheets(config) {

        const { spritePath, spritePrefix, frameHeight, animations } = config;

        Object.entries(animations).forEach(([animName, data]) => {

            const key        = spritePrefix + animName;
            const frameWidth = data.totalWidth / data.cols;
            const path       = `${spritePath}${key}.png`;

            this.load.spritesheet(key, path, { frameWidth, frameHeight });
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
            key:    'grass1',
            origin: { x: 0, y: 0 },
            add:    true,
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

            const x = Phaser.Math.Between(MARGIN, width  - MARGIN);
            const y = Phaser.Math.Between(MARGIN, height - MARGIN);

            const enemy = new Enemy(this, x, y, config);
            enemy.setDepth(2);
            enemy.play(config.spritePrefix + 'idle');

            this.enemies.add(enemy);
        }
    }
}