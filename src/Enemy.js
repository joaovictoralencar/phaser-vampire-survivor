/**
 * Enemy
 *
 * Extends Phaser.Physics.Arcade.Sprite so each enemy owns its own
 * physics body, animation state, stats, and AI logic.
 *
 * The constructor calls scene.add.existing() and scene.physics.add.existing()
 * internally — this is the required Phaser pattern so that this.body is
 * populated before _setupPhysics() runs. The scene must NOT call those
 * methods again after construction.
 *
 * Usage:
 *   const enemy = new Enemy(scene, x, y, creepyConfig);
 *   // body, display list, and physics are already wired — just add to group:
 *   this.enemies.add(enemy);
 */

// No import/export — Phaser is a global loaded via <script> tag in index.html
// Enemy.js must be loaded via its own <script> tag BEFORE Survivor.js

const EnemyState = {
    AWAKENING: 'awakening',
    IDLE: 'idle',
    WALK: 'walk',
    ATTACK1: 'attack1',
    ATTACK2: 'attack2',
    HIT: 'hit',
    DIE: 'die',
};

class Enemy extends Phaser.Physics.Arcade.Sprite {

    /* ----------------------------------------------------------
       Constructor
    ---------------------------------------------------------- */

    constructor(scene, x, y, config) {

        // Start on the idle texture so Phaser can size the body immediately
        super(scene, x, y, config.spritePrefix + 'idle', 0);

        this._config = config;
        this._state = EnemyState.IDLE;

        // --- Stats (copied from config so they can change per-instance) ---
        const s = config.stats;
        this.hp = s.hp;
        this.maxHp = s.hp;
        this.damage = s.damage;
        this.speed = s.speed;

        this._detectionRadius = s.detectionRadius;
        this._attackRadius = s.attackRadius;

        // --- Internal flags ---
        this._isHurt = false;
        this._isDead = false;
        this._target = null;  // set from outside (usually the player)

        // Register with the display list and physics world NOW so that
        // this.body is not null when _setupPhysics() runs below.
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this._setupPhysics();
        this._setupAnimEvents();
    }

    /* ----------------------------------------------------------
       Setup
    ---------------------------------------------------------- */

    _setupPhysics() {
        this.setScale(2);
        this.setCollideWorldBounds(true);
        this.body.setAllowGravity(false);

        // Tighter hitbox than the full sprite frame
        this.setBodySize(14, 18);
        this.setOffset(
            (this.width - 14) / 2,
            (this.height - 18) / 2
        );
    }

    _setupAnimEvents() {

        // When a non-looping animation finishes, decide what to do next
        this.on('animationcomplete', (anim) => {

            const p = this._config.spritePrefix;

            if (anim.key === p + EnemyState.DIE) {
                this.destroy();
                return;
            }

            if (anim.key === p + EnemyState.HIT) {
                this._isHurt = false;
                this._transitionToIdle();
                return;
            }

            if (
                anim.key === p + EnemyState.ATTACK1 ||
                anim.key === p + EnemyState.ATTACK2 ||
                anim.key === p + EnemyState.AWAKENING
            ) {
                this._transitionToIdle();
            }
        });
    }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    /** Assign the target the enemy will track (usually the player sprite). */
    setTarget(target) {
        this._target = target;
    }

    /** Apply damage; plays hit / die animation automatically. */
    takeDamage(amount) {

        if (this._isDead) return;

        this.hp -= amount;

        if (this.hp <= 0) {
            this._die();
        } else {
            this._playHit();
        }
    }

    /* ----------------------------------------------------------
       Phaser update hook (called automatically when
       runChildUpdate: true is set on the parent group)
    ---------------------------------------------------------- */

    preUpdate(time, delta) {

        super.preUpdate(time, delta);

        if (this._isDead || this._isHurt) return;

        this._runAI();
    }

    /* ----------------------------------------------------------
       AI logic
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

        if (dist <= this._attackRadius) {
            this._tryAttack();
        } else if (dist <= this._detectionRadius) {
            this._chaseTarget();
        } else {
            this._transitionToIdle();
        }
    }

    _chaseTarget() {

        if (this._state === EnemyState.ATTACK1 ||
            this._state === EnemyState.ATTACK2) return;

        this._setState(EnemyState.WALK);

        this.scene.physics.moveToObject(this, this._target, this.speed);

        // Flip sprite to face the direction of movement
        this.setFlipX(this._target.x < this.x);
    }

    _tryAttack() {

        if (this._state === EnemyState.ATTACK1 ||
            this._state === EnemyState.ATTACK2) return;

        this.setVelocity(0, 0);

        // Alternate between attack1 and attack2 randomly for variety
        const attackKey = Math.random() < 0.6
            ? EnemyState.ATTACK1
            : EnemyState.ATTACK2;

        this._setState(attackKey);
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
        if (this._isDead) return;

        this._state = newState;
        this.play(this._config.spritePrefix + newState, true);
    }

    _playHit() {

        this._isHurt = true;
        this.setTint(0xff4444);
        this.setVelocity(0, 0);
        this._state = EnemyState.HIT;

        this.play(this._config.spritePrefix + EnemyState.HIT, true);

        // Clear tint slightly before the animation ends
        this.scene.time.delayedCall(120, () => {
            if (this.active) this.clearTint();
        });
    }

    _die() {

        this._isDead = true;
        this.setVelocity(0, 0);
        this.setTint(0xff2222);

        // Disable physics body so it no longer blocks / gets hit
        this.body.enable = false;

        this._state = EnemyState.DIE;
        this.play(this._config.spritePrefix + EnemyState.DIE, true);

        // animationcomplete handler above calls destroy() when done
    }
}