// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: HealthComponent.js → AttackComponent.js → Enemy.js → Player.js → Survivor.js

const EnemyState = {
    AWAKENING: 'awakening',
    IDLE:      'idle',
    WALK:      'walk',
    ATTACK1:   'attack1',
    ATTACK2:   'attack2',
    HIT:       'hit',
    DIE:       'die',
};

class Enemy extends Phaser.Physics.Arcade.Sprite {

    /* ----------------------------------------------------------
       Constructor
    ---------------------------------------------------------- */

    constructor(scene, x, y, config) {

        super(scene, x, y, config.spritePrefix + 'idle', 0);

        this._config = config;
        this._state  = EnemyState.IDLE;

        const s = config.stats;
        this.damage = s.damage;
        this.speed  = s.speed;

        this._detectionRadius = s.detectionRadius;
        this._attackRadius    = s.attackRadius;
        this._target          = null;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this._setupPhysics();
        this._setupAnimEvents();

        this.health = new HealthComponent(this, {
            hp: s.hp,

            onHit: () => {
                this.health.isHurt = true;
                this._state = EnemyState.HIT;
                this.setTint(0xff4444);
                this.setVelocity(0, 0);
                this.play(this._config.spritePrefix + EnemyState.HIT, true);

                this.scene.time.delayedCall(120, () => {
                    if (this.active) this.clearTint();
                });
            },

            onDie: () => {
                this._state = EnemyState.DIE;
                this.setVelocity(0, 0);
                this.setTint(0xff2222);
                this.body.enable = false;
                this.play(this._config.spritePrefix + EnemyState.DIE, true);
            },
        });
    }

    /* ----------------------------------------------------------
       Setup
    ---------------------------------------------------------- */

    _setupPhysics() {
        this.setScale(2);
        this.setOrigin(0.5, 1);
        this.setCollideWorldBounds(true);
        this.body.setAllowGravity(false);

        this._bodyW = 14;
        this._bodyH = 18;
        this.setBodySize(this._bodyW, this._bodyH);
        this._refreshBodyOffset();
    }

    _refreshBodyOffset() {
        const offsetX = (this.frame.realWidth  - this._bodyW) / 2;
        const offsetY =  this.frame.realHeight - this._bodyH;
        this.setOffset(offsetX, offsetY);
    }

    _setupAnimEvents() {

        this.on('animationcomplete', (anim) => {

            const p = this._config.spritePrefix;

            if (anim.key === p + EnemyState.DIE) {
                this.destroy();
                return;
            }

            if (anim.key === p + EnemyState.HIT) {
                this.health.isHurt = false;
                this._transitionToIdle();
                return;
            }

            if (
                anim.key === p + EnemyState.ATTACK1  ||
                anim.key === p + EnemyState.ATTACK2  ||
                anim.key === p + EnemyState.AWAKENING
            ) {
                this._transitionToIdle();
            }
        });
    }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    setTarget(target) {
        this._target = target;
    }

    /* ----------------------------------------------------------
       Phaser update hook
    ---------------------------------------------------------- */

    preUpdate(time, delta) {

        super.preUpdate(time, delta);

        if (this.health.isDead || this.health.isHurt) return;

        this._refreshBodyOffset();
        this._runAI();
    }

    /* ----------------------------------------------------------
       AI
    ---------------------------------------------------------- */

    _runAI() {

        if (!this._target || !this._target.active) {
            this._transitionToIdle();
            return;
        }

        const dist = Phaser.Math.Distance.Between(
            this.x, this.y,
            this._target.x, this._target.y
        );

        if (dist <= this._attackRadius)         this._tryAttack();
        else if (dist <= this._detectionRadius) this._chaseTarget();
        else                                    this._transitionToIdle();
    }

    _chaseTarget() {

        if (this._state === EnemyState.ATTACK1 ||
            this._state === EnemyState.ATTACK2) return;

        this._setState(EnemyState.WALK);
        this.scene.physics.moveToObject(this, this._target, this.speed);
        this.setFlipX(this._target.x < this.x);
    }

    _tryAttack() {

        if (this._state === EnemyState.ATTACK1 ||
            this._state === EnemyState.ATTACK2) return;

        this.setVelocity(0, 0);

        const attackKey = Math.random() < 0.6
            ? EnemyState.ATTACK1
            : EnemyState.ATTACK2;

        this._setState(attackKey);
        this._scheduleDamageHit();
    }

    /**
     * Deals damage at the visual mid-point of the attack animation.
     *
     * Uses a directional cone check instead of a plain radius so the
     * hit only lands when the target is roughly in front of the enemy —
     * matching the visible swing direction.
     *
     *   dot product of (enemy→target) · (enemy facing) > threshold
     *   means the target is within ~45° of the facing direction.
     */
    _scheduleDamageHit() {

        const HIT_DELAY   = 200;   // ms — adjust to match the swing frame
        const DOT_MIN     = 0.5;   // cos(60°) — target must be within 60° of facing

        this.scene.time.delayedCall(HIT_DELAY, () => {

            if (this.health.isDead)                        return;
            if (!this._target || !this._target.active)     return;
            if (this._target.health?.isDead)               return;

            const dx   = this._target.x - this.x;
            const dy   = this._target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > this._attackRadius) return;

            // Facing direction: sprite is flipped when target is to the left
            // Use the raw dx to derive a normalised facing vector
            const facingX = this.flipX ? -1 : 1;

            // Normalise enemy→target vector and dot against facing
            const dot = (dx / dist) * facingX;

            // Additionally bias downward hits: if target is mostly below,
            // relax the horizontal dot threshold so the attack still lands
            const targetBelow = dy > 0 && Math.abs(dy) > Math.abs(dx);
            const passes      = targetBelow || dot >= DOT_MIN;

            if (!passes) return;

            this._target.health?.takeDamage(this.damage);
        });
    }

    _transitionToIdle() {
        if (this._state === EnemyState.DIE) return;
        this.setVelocity(0, 0);
        this._setState(EnemyState.IDLE);
    }

    /* ----------------------------------------------------------
       State machine
    ---------------------------------------------------------- */

    _setState(newState) {
        if (this._state === newState) return;
        if (this.health.isDead)       return;

        this._state = newState;
        this.play(this._config.spritePrefix + newState, true);
    }
}