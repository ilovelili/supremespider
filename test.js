var casper = require('casper').create();


casper.start('http://www.supremenewyork.com/shop/skate/b8zaenc15').waitForSelector(".sold-out", function () {
    this.echo('Found the answer.');
}, function () {
    this.echo('Not found');
}, 3000);


// entry
casper.run(function () {
    this.exit();
});

/**
 * Event listening
 */
casper.on("remote.message", function (msg) {
    this.echo("remote: " + msg);
});

casper.on("error", function (err) {
    this.echo("error: " + err);
});