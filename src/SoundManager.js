// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: SoundManager.js → HealthComponent.js → AttackComponent.js → Enemy.js → Player.js → Survivor.js

class SoundManager {

    /**
     * @param {Phaser.Scene} scene
     * @param {object} [config]
     * @param {number} [config.masterVolume=1]
     * @param {number} [config.bgmVolume=1]
     * @param {number} [config.playerStepInterval=320]
     * @param {number} [config.enemyStepInterval=380]
     * @param {number} [config.moanIntervalMin=6000]
     * @param {number} [config.moanIntervalMax=14000]
     */
    constructor(scene, config = {}) {

        this._scene           = scene;
        this._masterVolume    = config.masterVolume      ?? 1;
        this._bgmVolume       = config.bgmVolume         ?? 1;
        this._playerStepMs    = config.playerStepInterval ?? 320;
        this._enemyStepMs     = config.enemyStepInterval  ?? 380;
        this._moanIntervalMin = config.moanIntervalMin    ?? 6000;
        this._moanIntervalMax = config.moanIntervalMax    ?? 14000;

        this._sfxConfig      = {};
        this._bgmConfig      = {};
        this._activeBgm      = null;
        this._stepTimestamps = new WeakMap();

        this._loadFromManifest();
    }

    /* ----------------------------------------------------------
       Manifest loading
    ---------------------------------------------------------- */

    _loadFromManifest() {

        const manifest = this._scene.cache.json.get('sounds');

        if (!manifest) {
            console.warn('[SoundManager] sounds.json not found in cache. Load it in preload() first.');
            return;
        }

        for (const entry of (manifest.sfx ?? [])) {
            this._sfxConfig[entry.key] = {
                volume: entry.volume ?? 0.5,
                detune: entry.detune ?? 60,
            };
        }

        for (const entry of (manifest.bgm ?? [])) {
            this._bgmConfig[entry.key] = {
                volume: entry.volume ?? 0.5,
                loop:   entry.loop   ?? true,
            };
        }
    }

    /* ----------------------------------------------------------
       BGM
    ---------------------------------------------------------- */

    startBgm(key) {

        const resolvedKey = key ?? Object.keys(this._bgmConfig)[0];
        if (!resolvedKey) return;

        if (this._activeBgm) this.stopBgm(0);

        if (!this._scene.cache.audio.exists(resolvedKey)) {
            console.warn(`[SoundManager] BGM key not loaded: "${resolvedKey}"`);
            return;
        }

        const cfg    = this._bgmConfig[resolvedKey] ?? { volume: 0.5, loop: true };
        const volume = cfg.volume * this._masterVolume * this._bgmVolume;

        this._activeBgm = this._scene.sound.add(resolvedKey, { loop: cfg.loop, volume: 0 });
        this._activeBgm.play();
        // Fade in so BGM doesn't punch in abruptly
        this._scene.tweens.add({
            targets:  this._activeBgm,
            volume,
            duration: 1200,
            ease:     'Linear',
        });
    }

    stopBgm(fadeDuration = 800) {

        if (!this._activeBgm) return;

        this._scene.tweens.add({
            targets:  this._activeBgm,
            volume:   0,
            duration: fadeDuration,
            onComplete: () => {
                this._activeBgm?.stop();
                this._activeBgm?.destroy();
                this._activeBgm = null;
            },
        });
    }

    setBgmVolume(value) {
        this._bgmVolume = Phaser.Math.Clamp(value, 0, 1);
        if (this._activeBgm) {
            const cfg = this._bgmConfig[this._activeBgm.key] ?? { volume: 0.5 };
            this._activeBgm.setVolume(cfg.volume * this._masterVolume * this._bgmVolume);
        }
    }

    setMasterVolume(value) {
        this._masterVolume = Phaser.Math.Clamp(value, 0, 1);
        this.setBgmVolume(this._bgmVolume);
    }

    /* ----------------------------------------------------------
       SFX

       Root cause of the volume bug:
         this._scene.sound.play(key, config) is a fire-and-forget
         shorthand in Phaser 3 that doesn't reliably honour the
         volume field in its config argument across all backends
         (WebAudio vs HTML5).

       Fix:
         Use sound.add() → setVolume() → play() explicitly.
         The sound is destroyed automatically when it finishes.
    ---------------------------------------------------------- */

    play(key, overrides = {}) {

        if (!this._scene.cache.audio.exists(key)) return;

        const cfg    = this._sfxConfig[key] ?? { volume: 0.5, detune: 60 };
        const volume = cfg.volume * this._masterVolume;
        const detune = Phaser.Math.Between(-cfg.detune, cfg.detune);

        const sound = this._scene.sound.add(key, { volume, detune, ...overrides });
        sound.once('complete', () => sound.destroy());
        sound.play();
    }

    /* ----------------------------------------------------------
       Footsteps
    ---------------------------------------------------------- */

    footstep(owner, type) {

        const now      = this._scene.time.now;
        const interval = type === 'player' ? this._playerStepMs : this._enemyStepMs;
        const last     = this._stepTimestamps.get(owner) ?? 0;

        if (now - last < interval) return;

        this._stepTimestamps.set(owner, now);
        this.play(type === 'player' ? 'sfx-player-step' : 'sfx-enemy-step');
    }

    /* ----------------------------------------------------------
       Ambient moans
    ---------------------------------------------------------- */

    scheduleMoan(enemy) {

        const delay = Phaser.Math.Between(this._moanIntervalMin, this._moanIntervalMax);

        enemy._moanTimer = this._scene.time.delayedCall(delay, () => {

            if (!enemy.active) return;

            const key = Math.random() < 0.5 ? 'sfx-enemy-moan-1' : 'sfx-enemy-moan-2';
            this.play(key);

            this.scheduleMoan(enemy);
        });
    }
}