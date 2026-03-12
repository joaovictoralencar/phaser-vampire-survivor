// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: HealthComponent.js → AttackComponent.js → Enemy.js → Player.js → Survivor.js

class HealthComponent {

    /**
     * @param {Phaser.GameObjects.GameObject} owner
     * @param {object} config
     * @param {number}   config.hp              Starting (and max) HP
     * @param {number}   [config.iFrames=0]     Invincibility window after a hit (ms).
     *                                          During this window takeDamage() is ignored.
     *                                          Set to 0 to disable (enemies usually don't need it).
     * @param {boolean}  [config.debug=false]   Log all damage/heal/state events to console
     * @param {function} [config.onHit]         (currentHp, maxHp, delta) => void
     * @param {function} [config.onDie]         (owner) => void
     * @param {function} [config.onHeal]        (currentHp, maxHp, delta) => void
     * @param {function} [config.onRevive]      (currentHp, maxHp) => void
     */
    constructor(owner, { hp, iFrames = 0, debug = false, onHit, onDie, onHeal, onRevive } = {}) {

        this._owner   = owner;
        this._iFrames = iFrames;
        this._debug   = debug;

        this.maxHp = hp;
        this.hp    = hp;

        this.isDead    = false;
        this.isHurt    = false;
        this._iFrame   = false;   // true while invincible after a hit

        this._onHit    = onHit    ?? null;
        this._onDie    = onDie    ?? null;
        this._onHeal   = onHeal   ?? null;
        this._onRevive = onRevive ?? null;

        this._log(`Initialised — hp: ${this.hp}/${this.maxHp}, iFrames: ${this._iFrames}ms`);
    }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    takeDamage(amount) {

        if (this.isDead) {
            this._log(`takeDamage(${amount}) ignored — already dead`);
            return;
        }

        if (this._iFrame) {
            this._log(`takeDamage(${amount}) ignored — invincible`);
            return;
        }

        const delta = Math.min(amount, this.hp);
        this.hp -= delta;

        this._log(`takeDamage(${amount}) → hp: ${this.hp}/${this.maxHp} (delta: ${delta})`);

        // Broadcast to the scene so any listener (e.g. DamageText, HUD) can react
        // without needing a direct reference to this component.
        //
        //   Payload: { owner, amount, fatal, currentHp, maxHp }
        this._owner.scene?.events.emit('health-damaged', {
            owner:     this._owner,
            amount:    delta,
            fatal:     this.hp <= 0,
            currentHp: this.hp,
            maxHp:     this.maxHp,
        });

        if (this.hp <= 0) {
            this.hp = 0;
            this._triggerDie();
        } else {
            this._triggerHit(delta);
        }
    }

    heal(amount) {

        if (this.isDead) {
            this._log(`heal(${amount}) ignored — dead`);
            return;
        }

        if (amount <= 0) return;

        const delta = Math.min(amount, this.maxHp - this.hp);
        if (delta === 0) return;

        this.hp += delta;
        this._log(`heal(${amount}) → hp: ${this.hp}/${this.maxHp} (delta: ${delta})`);
        this._onHeal?.(this.hp, this.maxHp, delta);
    }

    revive(hp = this.maxHp) {

        if (!this.isDead) return;

        this.hp     = Phaser.Math.Clamp(hp, 1, this.maxHp);
        this.isDead = false;
        this.isHurt = false;
        this._iFrame = false;

        this._log(`revive() → hp: ${this.hp}/${this.maxHp}`);
        this._onRevive?.(this.hp, this.maxHp);
    }

    /** 0–1 normalised, useful for health bars. */
    get ratio() { return this.hp / this.maxHp; }

    /* ----------------------------------------------------------
       Internal
    ---------------------------------------------------------- */

    _triggerHit(delta) {

        this.isHurt = true;

        // Start invincibility window if configured
        if (this._iFrames > 0) {
            this._iFrame = true;
            this._log(`iFrame window started (${this._iFrames}ms)`);

            this._owner.scene.time.delayedCall(this._iFrames, () => {
                this._iFrame = false;
                this._log('iFrame window ended');
            });
        }

        this._onHit?.(this.hp, this.maxHp, delta);
    }

    _triggerDie() {
        this.isDead  = true;
        this.isHurt  = false;
        this._iFrame = false;

        this._log(`died — final hp: ${this.hp}/${this.maxHp}`);
        this._onDie?.(this._owner);
    }

    _log(msg) {
        if (!this._debug) return;
        const name = this._owner.constructor?.name ?? 'Unknown';
        console.log(`[HealthComponent:${name}] ${msg}`);
    }
}