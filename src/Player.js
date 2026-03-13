// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: HealthComponent.js → AttackComponent.js → Player.js → Survivor.js

class Player extends Phaser.Physics.Arcade.Sprite {

    static Direction = {
        UP: 'up',
        DOWN: 'down',
        LEFT: 'left',
        RIGHT: 'right',
    };

    /* ----------------------------------------------------------
       Constructor
    ---------------------------------------------------------- */

    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y
     * @param {object} config
     * @param {boolean} [config.debug=false]
     * @param {Phaser.GameObjects.Group} config.enemiesGroup
     */
    constructor(scene, x, y, { debug = false, enemiesGroup = null } = {}) {

        super(scene, x, y, 'knight', 0);

        this.DEBUG_HITBOX = debug;

        this.lastDirection = Player.Direction.DOWN;
        this.isAttacking = false;
        this.comboQueued = false;
        this.comboWindowOpen = false;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this._setupPhysics();
        this._createAnimations();
        this._createInput();

        // --- HealthComponent ---
        this.health = new HealthComponent(this, {
            hp: 500,
            iFrames: 600,
            debug: true,

            onHit: (currentHp, maxHp, delta) => {
                this.setTint(0xff4444);
                this.scene.time.delayedCall(200, () => {
                    if (this.active) this.clearTint();
                });
                this.scene.sfx?.play('sfx-player-hit');
            },

            onDie: () => {
                this.isAttacking = false;
                this.attack.cancel();
                this.setVelocity(0, 0);
                this.setTint(0xff2222);
                this.body.enable = false;
                this.scene.events.emit('player-died');
            },
        });

        // --- MeleeAttackComponent ---
        this.attack = new MeleeAttackComponent(this, {
            damage: 25,
            duration: 80,
            hitboxSize: { w: 60, h: 40 },
            targetsGroup: enemiesGroup,
            onHit: (target) => {
                if (target.health) target.health.takeDamage(this.attack.damage);
            },
        });

        if (this.DEBUG_HITBOX) {
            this._debugGraphics = scene.add.graphics().setDepth(1000);
        }

        this.setPushable(false);
        scene.physics.add.overlap(this, enemiesGroup, this._onCollideWithEnemies, null, this);

        this.anims.play('idle-down');
    }

    _onCollideWithEnemies(player, enemy) {
        if (enemy.health?.isDead) return;   // don't punish contact with dying enemies
        if (this.health) {
            this.health.takeDamage(enemy.damage ?? 10);
        }
    }

    /* ----------------------------------------------------------
       Setup
    ---------------------------------------------------------- */

    _setupPhysics() {
        this.setCollideWorldBounds(true);
        this.setDepth(2);
        this.setScale(2);
        this.setBodySize(20, 24);
    }

    _createAnimations() {

        const row = n => ({ start: n * 6, end: n * 6 + 5 });
        const row5 = n => ({ start: n * 6, end: n * 6 + 4 });

        const add = (key, frames, fps, repeat = -1) =>
            this.scene.anims.create({
                key,
                frames: this.scene.anims.generateFrameNumbers('knight', frames),
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

    _createInput() {

        this._cursors = this.scene.input.keyboard.createCursorKeys();

        this._wasd = this.scene.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        });

        this._attackKey = this.scene.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.K
        );
    }

    /* ----------------------------------------------------------
       Phaser update hook
    ---------------------------------------------------------- */

    preUpdate(time, delta) {

        super.preUpdate(time, delta);

        if (this.health.isDead) return;

        this._handleMovement();
        this._handleAttack();

        if (this.DEBUG_HITBOX) this._drawDebugHitbox();
    }

    /* ----------------------------------------------------------
       Movement
    ---------------------------------------------------------- */

    _handleMovement() {

        if (this.isAttacking) {
            this.setVelocity(0, 0);
            return;
        }

        const { _cursors: cursors, _wasd: wasd } = this;
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

        if (vx !== 0 && vy !== 0) {
            const D = SPEED * 0.7071;
            vx = vx > 0 ? D : -D;
            vy = vy > 0 ? D : -D;
        }

        this.setVelocity(vx, vy);

        const isMoving = vx !== 0 || vy !== 0;

        if (!isMoving) {
            this.anims.play(`idle-${this.lastDirection}`, true);
            return;
        }

        // Footstep sound — rate-limited inside SoundManager
        this.scene.sfx?.footstep(this, 'player');

        if (goDown && !goUp) {
            this.lastDirection = Player.Direction.DOWN;
            this.anims.play('walk-down', true);
        } else if (goUp && !goDown) {
            this.lastDirection = Player.Direction.UP;
            this.anims.play('walk-up', true);
        } else if (goLeft) {
            this.lastDirection = Player.Direction.LEFT;
            this.anims.play('walk-left', true);
        } else if (goRight) {
            this.lastDirection = Player.Direction.RIGHT;
            this.anims.play('walk-right', true);
        }
    }

    /* ----------------------------------------------------------
       Attack (with combo)
    ---------------------------------------------------------- */

    _handleAttack() {

        if (!Phaser.Input.Keyboard.JustDown(this._attackKey)) return;

        if (this.isAttacking) {
            if (this.comboWindowOpen) this.comboQueued = true;
            return;
        }

        this._startAttack();
    }

    _startAttack() {

        const dir = this.lastDirection;

        this.isAttacking = true;
        this.comboQueued = false;
        this.comboWindowOpen = false;

        this.setVelocity(0, 0);
        this.anims.play(`attack-${dir}`, true);

        // Play swing sound at the moment the attack fires
        this.scene.sfx?.play('sfx-player-attack');

        this.attack.trigger(dir);

        const DURATION = 500;

        this.scene.time.delayedCall(DURATION * 0.75, () => {
            this.comboWindowOpen = true;
        });

        this.scene.time.delayedCall(DURATION, () => {

            if (this.comboQueued) {
                this._startAttack();
                return;
            }

            this.isAttacking = false;
            this.comboWindowOpen = false;
            this.anims.play(`idle-${dir}`);
        });
    }

    /* ----------------------------------------------------------
       Debug
    ---------------------------------------------------------- */

    _drawDebugHitbox() {

        this._debugGraphics.clear();

        const hb = this.attack._hitbox;
        if (!hb?.body?.enable) return;

        const { x, y, width, height } = hb.body;

        this._debugGraphics
            .lineStyle(5, 0xff0000)
            .strokeRect(x, y, width, height);
    }
}