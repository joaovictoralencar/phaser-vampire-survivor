export class Start extends Phaser.Scene {

    constructor() {
        super('Start');

        this.player = null;
        this.platforms = null;
        this.cursors = null;
        this.stars = null;
        this.bombs = null;
        this.score = 0;
        this.scoreText = null;
        this.gameOver = false;
    }

    preload() {

        this.load.image('sky', 'assets/sky.png');
        this.load.image('ground', 'assets/platform.png');
        this.load.image('star', 'assets/star.png')
        this.load.image('bomb', 'assets/bomb.png')
        this.load.spritesheet('dude',
            'assets/dude.png',
            { frameWidth: 32, frameHeight: 48 }
        );
    }

    create() {

        this.createWorld();
        this.createPlayer();
        this.createInput();
        this.createAnimations();
        this.createStars();
        this.createBombs();
        this.createCollisions();
        this.createScoreText();
    }

    update() {
        this.updatePlayer();
    }

    createWorld() {

        this.add.image(400, 300, 'sky');

        this.platforms = this.physics.add.staticGroup();

        this.platforms.create(400, 568, 'ground').setScale(2).refreshBody();
        this.platforms.create(600, 400, 'ground');
        this.platforms.create(50, 250, 'ground');
        this.platforms.create(750, 220, 'ground');
    }

    createPlayer() {

        this.player = this.physics.add.sprite(275, 450, 'dude');

        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);
    }

    createInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    createAnimations() {

        this.anims.create({
            key: 'left',
            frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'turn',
            frames: [{ key: 'dude', frame: 4 }],
            frameRate: 20
        });

        this.anims.create({
            key: 'right',
            frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
            frameRate: 10,
            repeat: -1
        });
    }

    createCollisions() {
        this.physics.add.collider(this.player, this.platforms);
        this.physics.add.collider(this.stars, this.platforms);

        //Overlaps
        this.physics.add.overlap(this.player, this.stars, this.collectStar, null, this);
        this.physics.add.collider(this.player, this.bombs, this.hitBomb, null, this);
    }

    createStars() {
        this.stars = this.physics.add.group({
            key: 'star',
            repeat: 2,
            setXY: { x: 12, y: 0, stepX: 70 }
        });

        this.stars.children.iterate(function (child) {
            child.setBounce(Phaser.Math.FloatBetween(0.4, 0.8));
        });
    }

    createBombs() {
        this.bombs = this.physics.add.group();
        this.physics.add.collider(this.bombs, this.platforms);
    }

    //-------------------------------------------- Update
    updatePlayer() {

        const player = this.player;
        const cursors = this.cursors;

        if (cursors.left.isDown) {

            player.setVelocityX(-160);
            player.anims.play('left', true);

        } else if (cursors.right.isDown) {

            player.setVelocityX(160);
            player.anims.play('right', true);

        } else {

            player.setVelocityX(0);
            player.anims.play('turn');
        }

        if (cursors.up.isDown && player.body.touching.down) {
            player.setVelocityY(-330);
        }
    }

    collectStar(player, star) {
        star.disableBody(true, true);
        this.score += 10;
        this.scoreText.setText('Score: ' + this.score);

        if (this.stars.countActive(true) === 0) {
            this.stars.children.iterate(function (child) {

                child.enableBody(true, child.x, 0, true, true);
            });

            var x = (this.player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);

            var bomb = this.bombs.create(x, 16, 'bomb');
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);

        }
    }

    createScoreText() {
        this.scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', fill: '#000' });
    }

    hitBomb() {
        this.physics.pause();
        this.player.setTint(0xff0000);
        this.player.anims.play('turn');
        this.gameOver = true;
    }
}