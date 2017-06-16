var casper = require('casper').create(),
    config = require('config.json'),
    url = 'http://www.supremenewyork.com/shop',
    links = [];

// step 1: open url
casper.userAgent(config.useragent);
casper.start(url);

casper.then(function () {
    var categoriesInConfig = config.rule.categories,
        categories = categoriesInConfig.split(',');

    for (var index in categories) {
        var linksinonecategory = this.evaluate(
            function (cat) {
                console.log('hit. cat is ' + cat);
                var hrefs = [];
                var lis = $('.' + cat);
                for (var i in lis) {
                    var li = $(lis[i]),
                        a = $($(li).find('a')[0]),
                        href = a.attr('href');

                    if (href && href.indexOf('/shop/' + cat) > -1) {
                        hrefs.push(href);
                    }
                }

                return hrefs;
            },
            {
                cat: categories[index],
            }
        );

        for (var i in linksinonecategory) {
            if (linksinonecategory[i].length > 0 && !links.includes(linksinonecategory[i])) {
                links.push(linksinonecategory[i]);
            }
        }
    }
});

// place orders
casper.then(function () {
    links.forEach(function (link, index, arr) {
        casper.thenOpen('http://www.supremenewyork.com' + link, function () {
            // second, order it
            this.waitForSelector(".sold-out",
                function soldOut() {
                    // do nothing                    
                },
                function valid() {
                    this.evaluate(function (config, link) {
                        if ($('[itemprop="name"]').text().indexOf(config.rule.title) > -1) {
                            // valid product, record it
                            console.info('http://www.supremenewyork.com/' + link);
                        }
                    }, { config: config, link: link });
                }, 500);
        });
    });
});

// entry
casper.run(function () {
    console.log('All done. Exit');
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

/**
 * Polyfill (https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Array/includes)
 */
if (!Array.prototype.includes) {
    Object.defineProperty(Array.prototype, 'includes', {
        value: function (searchElement, fromIndex) {
            if (this == null) {
                throw new TypeError('"this" is null or not defined');
            }

            var o = Object(this);
            var len = o.length >>> 0;
            if (len === 0) {
                return false;
            }

            var n = fromIndex | 0;
            var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

            function sameValueZero(x, y) {
                return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));
            }

            while (k < len) {
                if (sameValueZero(o[k], searchElement)) {
                    return true;
                }
                k++;
            }

            // 8. Return false
            return false;
        }
    });
}