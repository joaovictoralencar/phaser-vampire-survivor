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

        // ── Audio manifest ─────────────────────────────────────
        // Load sounds.json first; once it's ready, load every audio
        // file it describes so they're all in cache before create().
        this.load.json('sounds', 'assets/audio/sounds.json');

        this.load.once('filecomplete-json-sounds', (_key, _type, manifest) => {
            this._loadAudioFromManifest(manifest);
        });
    }

    /* =========================================================
       CREATE
    ========================================================= */

    create() {

        const { width, height } = this.scale;

        this._createFloor();

        const creepyConfig = this.cache.json.get('enemy-creepy');
        this._createEnemyAnimations(creepyConfig);

        this.enemies = this.physics.add.group({ runChildUpdate: true });
        this.physics.add.collider(this.enemies, this.enemies);
        this._spawnEnemies(creepyConfig, 10, width, height);

        this.player = new Player(this, width / 2, height / 2, {
            debug:        false,
            enemiesGroup: this.enemies,
        });

        this.enemies.getChildren().forEach(e => e.setTarget(this.player));

        // ── SoundManager ───────────────────────────────────────
        // Must be created after sounds.json and audio files are loaded.
        // Player and Enemy access it via this.scene.sfx.
        this.sfx = new SoundManager(this, {
            masterVolume: 1,
            bgmVolume:    1,
        });

        // Start BGM — plays the first entry in sounds.json "bgm" array.
        // Pass a key string to choose a specific track: this.sfx.startBgm('bgm-main')
        this.sfx.startBgm();

        // Schedule ambient moans for each enemy
        this.enemies.getChildren().forEach(e => this.sfx.scheduleMoan(e));

        // ── DamageText ──────────────────────────────────────────
        this.damageText = new DamageText(this, {
            fontFamily:      'Roboto, sans-serif',
            baseFontSize:    22,
            strokeThickness: 4,
            floatDistance:   50,
            duration:        950,
        });

        this.events.on('health-damaged', ({ owner, amount }) => {
            if (!owner.active) return;
            const top       = owner.getTopCenter();
            const recipient = owner === this.player ? 'player' : 'enemy';
            this.damageText.show(top.x, top.y, amount, recipient);
        });

        // ── HUD ────────────────────────────────────────────────
        this._createHud(width, height);

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

        this.sfx?.stopBgm();

        if (this._hudHpValue) {
            this._hudHpValue.setText('0');
            this._hudHpValue.setColor('#ff4444');
        }
        if (this._hudHpBar) this._hudHpBar.setScale(0, 1);

        console.log('Player died — game over');
    }

    /* =========================================================
       AUDIO LOADING
    ========================================================= */

    /**
     * Iterates sounds.json and calls this.load.audio() for every
     * bgm and sfx entry. Runs inside a filecomplete callback so
     * the JSON is guaranteed to be parsed before we read it.
     */
    _loadAudioFromManifest(manifest) {

        const entries = [
            ...(manifest.bgm ?? []),
            ...(manifest.sfx ?? []),
        ];

        for (const entry of entries) {
            if (entry.key && entry.path) {
                this.load.audio(entry.key, entry.path);
            }
        }
    }

    /* =========================================================
       HUD  (bottom-left)
    ========================================================= */

    _createHud(width, height) {

        const FONT  = 'Roboto, sans-serif';
        const PAD   = 16;
        const BAR_W = 120;
        const BAR_H = 8;
        const maxHp = this.player.health.maxHp;

        this._hudRes = window.devicePixelRatio || 2;

        const barY  = height - PAD - 26;
        const textY = height - PAD;

        // HP bar track
        this.add.rectangle(PAD, barY, BAR_W, BAR_H, 0x333333)
            .setOrigin(0, 0).setDepth(9999).setScrollFactor(0);

        // HP bar fill
        this._hudHpBar = this.add.rectangle(PAD, barY, BAR_W, BAR_H, 0x44dd44)
            .setOrigin(0, 0).setDepth(10000).setScrollFactor(0);

        // Heart icon
        this._hudHpLabel = this.add.text(PAD, textY, '❤', {
            fontFamily: FONT, fontStyle: 'bold', fontSize: '14px', color: '#ff4444',
        }).setOrigin(0, 1).setDepth(10000).setScrollFactor(0).setResolution(this._hudRes);

        // Current HP
        this._hudHpValue = this.add.text(PAD + 20, textY, `${maxHp}`, {
            fontFamily: FONT, fontStyle: 'bold', fontSize: '14px', color: '#ffffff',
        }).setOrigin(0, 1).setDepth(10000).setScrollFactor(0).setResolution(this._hudRes);

        // Max HP
        this._hudHpMax = this.add.text(0, textY, ` / ${maxHp}`, {
            fontFamily: FONT, fontSize: '12px', color: '#aaaaaa',
        }).setOrigin(0, 1).setDepth(10000).setScrollFactor(0).setResolution(this._hudRes);

        // Control hint
        this._hudHint = this.add.text(width - PAD, height - PAD, 'K  —  Attack', {
            fontFamily: FONT, fontSize: '13px', color: '#cccccc', alpha: 0.70,
        }).setOrigin(1, 1).setDepth(10000).setScrollFactor(0).setResolution(this._hudRes);
    }

    _updateHud() {

        if (!this.player || !this._hudHpValue) return;

        const { hp, maxHp } = this.player.health;

        this._hudHpValue.setText(`${Math.max(0, Math.ceil(hp))}`);
        this._hudHpMax.setX(this._hudHpValue.x + this._hudHpValue.width);

        const ratio    = hp / maxHp;
        const barColor = ratio > 0.5  ? 0x44dd44
            : ratio > 0.25 ? 0xddcc00
                :                0xdd2222;

        this._hudHpBar.setFillStyle(barColor).setScale(Math.max(ratio, 0), 1);
        this._hudHpValue.setColor(ratio <= 0.25 ? '#ff4444' : '#ffffff');
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
                frames:    this.anims.generateFrameNumbers(key, { start: 0, end: data.cols - 1 }),
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
            key: 'grass1', origin: { x: 0, y: 0 }, add: true,
        }).setDepth(0).setTileScale(scale, scale);

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