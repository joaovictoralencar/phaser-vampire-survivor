// No import/export — Phaser is a global loaded via <script> tag in index.html
// Load order: DamageText.js → HealthComponent.js → AttackComponent.js → Enemy.js → Player.js → Survivor.js
//
// ⚠️  FONT SETUP REQUIRED
//     Add this inside <head> in index.html to enable Roboto (or swap any Google Font):
//
//       <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap" rel="stylesheet">

/* =============================================================
   DamageText

   Spawns juicy floating damage numbers above any game-object
   that takes a hit.

   Usage (in your scene):

     this.damageText = new DamageText(this);

     this.events.on('health-damaged', ({ owner, amount }) => {
         const top       = owner.getTopCenter();
         const recipient = owner === this.player ? 'player' : 'enemy';
         this.damageText.show(top.x, top.y, amount, recipient);
     });

   Constructor config (all optional):
     fontFamily       string   'Roboto, sans-serif'
     baseFontSize     number   22
     strokeThickness  number   4
     floatDistance    number   48
     duration         number   950
============================================================= */

class DamageText {

    /**
     * @param {Phaser.Scene} scene
     * @param {object}  [config]
     * @param {string}  [config.fontFamily='Roboto, sans-serif']
     * @param {number}  [config.baseFontSize=22]
     * @param {number}  [config.strokeThickness=4]
     * @param {number}  [config.floatDistance=48]
     * @param {number}  [config.duration=950]
     */
    constructor(scene, config = {}) {
        this._scene          = scene;
        this.fontFamily      = config.fontFamily      ?? 'Roboto, sans-serif';
        this.baseFontSize    = config.baseFontSize     ?? 22;
        this.strokeThickness = config.strokeThickness ?? 4;
        this.floatDistance   = config.floatDistance   ?? 48;
        this.duration        = config.duration        ?? 950;

        // Render text at native screen DPI so pixelArt mode doesn't blur it
        this._resolution = window.devicePixelRatio || 2;
    }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    /**
     * Spawn a floating damage number at world position (x, y).
     *
     * @param {number}           x
     * @param {number}           y          Top edge of the sprite (getTopCenter().y)
     * @param {number}           amount     Damage dealt
     * @param {'player'|'enemy'} recipient  Drives colour palette
     */
    show(x, y, amount, recipient = 'enemy') {

        const { color, fontSize } = this._resolveStyle(amount, recipient);
        const jitterX = Phaser.Math.Between(-10, 10);

        const text = this._scene.add.text(x + jitterX, y - 4, `-${amount}`, {
            fontFamily:      this.fontFamily,
            fontStyle:       'bold',
            fontSize:        `${fontSize}px`,
            color,
            stroke:          '#000000',
            strokeThickness: this.strokeThickness,
            shadow: {
                offsetX: 1,
                offsetY: 2,
                color:   '#000000',
                blur:    3,
                fill:    true,
            },
        })
            .setOrigin(0.5, 1)
            .setDepth(9999)
            .setResolution(this._resolution)   // ← crisp text even with pixelArt: true
            .setScale(0);

        this._scene.tweens.chain({
            targets: text,
            tweens: [
                {
                    scaleX:   1.4,
                    scaleY:   1.4,
                    duration: 90,
                    ease:     'Back.Out',
                },
                {
                    scaleX:   1,
                    scaleY:   1,
                    y:        text.y - this.floatDistance,
                    alpha:    0,
                    duration: this.duration - 90,
                    ease:     'Cubic.Out',
                    onComplete: () => text.destroy(),
                },
            ],
        });
    }

    /* ----------------------------------------------------------
       Internal
    ---------------------------------------------------------- */

    _resolveStyle(amount, recipient) {

        if (recipient === 'player') {
            const extra    = Math.min(Math.floor(amount / 15) * 2, 12);
            const fontSize = this.baseFontSize + extra;
            const color    = amount >= 40 ? '#ff2222' : '#ff6666';
            return { color, fontSize };
        }

        if (amount >= 60) return { color: '#ff4400', fontSize: this.baseFontSize + 10 };
        if (amount >= 35) return { color: '#ff9900', fontSize: this.baseFontSize + 5  };
        if (amount >= 15) return { color: '#ffdd00', fontSize: this.baseFontSize + 2  };
        return                   { color: '#ffffff', fontSize: this.baseFontSize       };
    }
}