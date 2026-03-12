// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: AttackComponent.js → Player.js → Survivor.js

/* =============================================================
   AttackComponent  (base)

   Owns the shared attack contract:
     - damage value
     - isAttacking flag
     - trigger(direction) / cancel() lifecycle
     - onHit(target) callback

   Does NOT know how the hit is detected — that's the subclass's job.
============================================================= */

class AttackComponent {

    /**
     * @param {Phaser.GameObjects.GameObject} owner
     * @param {object} config
     * @param {number}   config.damage        Damage dealt per hit
     * @param {function} config.onHit         (target) => void
     */
    constructor(owner, { damage, onHit } = {}) {

        this._owner   = owner;
        this.damage   = damage ?? 10;
        this._onHit   = onHit  ?? null;

        this.isAttacking = false;
    }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    /**
     * Begin an attack in the given direction.
     * Subclasses override _doTrigger() to implement delivery.
     */
    trigger(direction) {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this._doTrigger(direction);
    }

    /**
     * Immediately cancel an in-progress attack.
     * Subclasses override _doCancel() to clean up delivery.
     */
    cancel() {
        if (!this.isAttacking) return;
        this.isAttacking = false;
        this._doCancel();
    }

    /* ----------------------------------------------------------
       Hooks for subclasses
    ---------------------------------------------------------- */

    /** Override in subclass — called when trigger() fires. */
    _doTrigger(direction) {}

    /** Override in subclass — called when cancel() fires. */
    _doCancel() {}

    /* ----------------------------------------------------------
       Internal
    ---------------------------------------------------------- */

    _fireOnHit(target) {
        this._onHit?.(target);
    }
}


/* =============================================================
   MeleeAttackComponent  extends AttackComponent

   Owns a static Zone hitbox that is:
     - Sized differently for horizontal vs vertical swings
     - Positioned at a directional offset from the owner
     - Enabled for `duration` ms then auto-disabled
     - Registered as an overlap against a Phaser Group

   Per-swing hit deduplication:
     The Phaser overlap callback fires every physics step while the
     zone is active (~4-5 times in 80 ms at 60 fps). A _hitTargets
     Set records every target struck during a single swing so each
     enemy can only be hit once per trigger(). The Set is cleared at
     the start of every new swing.
============================================================= */

class MeleeAttackComponent extends AttackComponent {

    /**
     * @param {Phaser.GameObjects.GameObject} owner
     * @param {object} config
     * @param {number}   config.damage
     * @param {number}   config.duration      How long the hitbox stays active (ms)
     * @param {object}   config.hitboxSize    { w, h } for a vertical swing
     *                                        (horizontal swaps w/h automatically)
     * @param {object}   [config.offsets]     Per-direction {x,y} overrides.
     *                                        Falls back to built-in defaults.
     * @param {Phaser.GameObjects.Group} config.targetsGroup
     *                                        Physics group to overlap against
     * @param {function} config.onHit         (target) => void
     */
    constructor(owner, {
        damage,
        duration    = 80,
        hitboxSize  = { w: 60, h: 40 },
        offsets     = {},
        targetsGroup,
        onHit,
    } = {}) {

        super(owner, { damage, onHit });

        this._duration     = duration;
        this._hitboxSize   = hitboxSize;
        this._targetsGroup = targetsGroup ?? null;

        // Tracks targets already hit during the current swing.
        // Cleared at the start of every trigger() so combos can re-hit.
        this._hitTargets = new Set();

        // Merge caller overrides on top of sensible defaults
        this._offsets = Object.assign({
            up:    { x: 0,   y: -45 },
            down:  { x: 0,   y:  45 },
            left:  { x: -40, y:   0 },
            right: { x:  40, y:   0 },
        }, offsets);

        this._hitTimer  = null;
        this._hitbox    = this._createHitbox();
        this._registerOverlap();
    }

    /* ----------------------------------------------------------
       Subclass hooks
    ---------------------------------------------------------- */

    _doTrigger(direction) {

        // Fresh swing — clear targets from any previous attack
        this._hitTargets.clear();

        const { w, h }   = this._hitboxSize;
        const isVertical = direction === 'up' || direction === 'down';
        const bw         = isVertical ? w : h;
        const bh         = isVertical ? h : w;

        // Resize body to match swing orientation
        this._hitbox.body.setSize(bw, bh);

        // Position relative to owner
        const off = this._offsets[direction];
        this._hitbox.setPosition(
            this._owner.x + off.x,
            this._owner.y + off.y
        );

        this._hitbox.body.enable = true;

        // Auto-disable after duration
        this._hitTimer = this._owner.scene.time.delayedCall(
            this._duration,
            () => this._disableHitbox()
        );
    }

    _doCancel() {
        this._hitTimer?.remove(false);
        this._disableHitbox();
    }

    /* ----------------------------------------------------------
       Internal
    ---------------------------------------------------------- */

    _createHitbox() {

        const { w, h } = this._hitboxSize;
        const zone = this._owner.scene.add.zone(0, 0, w, h);

        this._owner.scene.physics.add.existing(zone);
        zone.body.setAllowGravity(false);
        zone.body.enable = false;

        return zone;
    }

    _registerOverlap() {

        if (!this._targetsGroup) return;

        this._owner.scene.physics.add.overlap(
            this._hitbox,
            this._targetsGroup,
            (_hitbox, target) => {

                // Skip if this target was already hit in the current swing
                if (this._hitTargets.has(target)) return;

                this._hitTargets.add(target);
                this._fireOnHit(target);
            },
            null,
            this
        );
    }

    _disableHitbox() {
        if (this._hitbox?.body) this._hitbox.body.enable = false;
        this._hitTargets.clear();
        this.isAttacking = false;
    }
}


/* =============================================================
   RangedAttackComponent  extends AttackComponent  (stub)

   Will own projectile spawning and travel.
   The projectile's collider fires onHit(target) on contact.
   No zone hitbox is used.
============================================================= */

class RangedAttackComponent extends AttackComponent {

    /**
     * @param {Phaser.GameObjects.GameObject} owner
     * @param {object} config
     * @param {number}   config.damage
     * @param {number}   config.speed          Projectile travel speed (px/s)
     * @param {string}   config.projectileKey  Texture key for the projectile sprite
     * @param {Phaser.GameObjects.Group} config.targetsGroup
     * @param {function} config.onHit          (target) => void
     */
    constructor(owner, {
        damage,
        speed          = 300,
        projectileKey  = null,
        targetsGroup,
        onHit,
    } = {}) {

        super(owner, { damage, onHit });

        this._speed          = speed;
        this._projectileKey  = projectileKey;
        this._targetsGroup   = targetsGroup ?? null;
        this._projectile     = null;  // active projectile, if any
    }

    /* ----------------------------------------------------------
       Subclass hooks  (not yet implemented)
    ---------------------------------------------------------- */

    _doTrigger(direction) {
        // TODO: spawn this._projectile, set velocity by direction,
        //       register a one-time overlap → this._fireOnHit(target)
        console.warn('RangedAttackComponent._doTrigger() not yet implemented');
    }

    _doCancel() {
        // TODO: destroy this._projectile if active
        this._projectile?.destroy();
        this._projectile  = null;
        this.isAttacking  = false;
    }
}