// No import/export — Phaser is a global loaded via <script> tag in index.html
// Player.js must be loaded via its own <script> tag BEFORE Survivor.js

/**
 * Player
 *
 * Extends Phaser.Physics.Arcade.Sprite so the player owns its own
 * physics body, animations, input, sword hitbox, and update logic.
 *
 * Usage in a Scene:
 *   const player = new Player(scene, x, y);
 *   // Wire up the sword overlap externally — the enemies group lives in the scene:
 *   scene.physics.add.overlap(player.swordHitbox, enemies, player.onSwordHit, null, player);
 */

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

    constructor(scene, x, y, {debug = false} = {}) {

        super(scene, x, y, 'knight', 0);

        this.DEBUG_HITBOX = debug;

        // State
        this.lastDirection = Player.Direction.DOWN;
        this.isAttacking = false;
        this.comboQueued = false;
        this.comboWindowOpen = false;

        // Register with display list + physics world so this.body exists
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this._setupPhysics();
        this._createAnimations();
        this._createInput();
        this._createSwordHitbox();

        if (this.DEBUG_HITBOX) {
            this._debugGraphics = scene.add.graphics().setDepth(1000);
        }

        this.anims.play('idle-down');

        this.swordHitboxSize = {
            width: 60,
            height: 40
        };
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

        const row = n => ({start: n * 6, end: n * 6 + 5});
        const row5 = n => ({start: n * 6, end: n * 6 + 4});

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

    _createSwordHitbox() {

        this.swordHitbox = this.scene.add.zone(0, 0, 60, 40);
        this.scene.physics.add.existing(this.swordHitbox);
        this.swordHitbox.body.setAllowGravity(false);
        this.swordHitbox.body.enable = false;
    }

    /* ----------------------------------------------------------
       Phaser update hook — called automatically each frame
       because the sprite is on the scene's display list
    ---------------------------------------------------------- */

    preUpdate(time, delta) {

        super.preUpdate(time, delta);

        this._handleMovement();
        this._handleAttack();
        this._updateHitboxPosition();

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

        const {_cursors: cursors, _wasd: wasd} = this;
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

        this.setVelocity(vx, vy);

        if (vx === 0 && vy === 0) {
            this.anims.play(`idle-${this.lastDirection}`, true);
            return;
        }

        // Vertical takes priority over horizontal for direction tracking
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
        const anim = `attack-${dir}`;

        this.isAttacking = true;
        this.comboQueued = false;
        this.comboWindowOpen = false;

        this.setVelocity(0, 0);
        this.anims.play(anim, true);

        this._enableSwordHitbox();

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
       Sword hitbox
    ---------------------------------------------------------- */

    _enableSwordHitbox() {
        const isVertical =
            this.lastDirection === Player.Direction.DOWN ||
            this.lastDirection === Player.Direction.UP;

        const w = isVertical ? this.swordHitboxSize.width : this.swordHitboxSize.height;
        const h = isVertical ? this.swordHitboxSize.height : this.swordHitboxSize.width;

        // This actually resizes the physics body (zone.setSize alone does NOT)
        this.swordHitbox.body.setSize(w, h);

        this.swordHitbox.body.enable = true;

        this.scene.time.delayedCall(80, () => {
            if (this.swordHitbox?.body) this.swordHitbox.body.enable = false;
        });
    }

    _updateHitboxPosition() {

        if (!this.swordHitbox.body.enable) return;

        const dir = this.lastDirection;
        const VERTICAL_OFFSET = 45;
        const SIDE_OFFSET = 40;

        let x = this.x;
        let y = this.y;

        if (dir === Player.Direction.UP) y -= VERTICAL_OFFSET;
        if (dir === Player.Direction.DOWN) y += VERTICAL_OFFSET;
        if (dir === Player.Direction.LEFT) x -= SIDE_OFFSET;
        if (dir === Player.Direction.RIGHT) x += SIDE_OFFSET;

        this.swordHitbox.setPosition(x, y);
    }

    /**
     * Overlap callback — pass as the handler to scene.physics.add.overlap().
     * Bound to `this` via the `callbackContext` arg so `this` is the Player.
     */
    onSwordHit(_hitbox, enemy) {
        enemy.takeDamage(25);
    }

    /* ----------------------------------------------------------
       Debug
    ---------------------------------------------------------- */

    _drawDebugHitbox() {
        this._debugGraphics.clear();

        if (!this.swordHitbox.body.enable) return;

        // body.x/y is TOP-LEFT — this matches Phaser's own purple debug overlay
        const {x, y, width, height} = this.swordHitbox.body;

        this._debugGraphics
            .lineStyle(5, 0xff0000)
            .strokeRect(x, y, width, height);
    }
}