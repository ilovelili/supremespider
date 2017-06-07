var casper = require('casper').create(),
    config = require('config.json'),
    format = function (d) {
        var month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    },
    dateservice = {
        get now() {
            return new Date;
        },

        get today() {
            return format(this.now);
        },

        get tomorrow() {
            return format(new Date(this.now.getTime() + 24 * 60 * 60 * 1000));
        }
    },
    fs = require('fs'),
    budgetfile = fs.pathJoin('./budget', dateservice.today + '.txt'),
    budget = getBudget(),
    utils = require('utils'),
    url = 'http://www.supremenewyork.com/shop',
    links = [],
    ordereditems = [];

// step 1: open url
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

casper.then(function () {
    console.log('links are:');
    utils.dump(links);

    links.forEach(function (link) {
        casper.thenOpen('http://www.supremenewyork.com' + link, function () {
            // first, capture snapshot
            this.capture(fs.pathJoin('./snapshots', dateservice.today + link + '.png'));

            // second, order it
            this.waitForSelector(".sold-out",
                function soldOut() {
                    // has been sold out
                    console.log(link + ' has been sold out');
                },
                function order() {
                    // valid product, order it
                    budget = this.evaluate(function (config, budget) {
                        var price = parseInt($('span[itemprop="price"]').text().replace(',', '').replace('¥', '') /*¥42,120 to 42120*/);
                        if (isNaN(price)) {
                            console.error(link + ' has invalid price. Skip');
                            return;
                        }

                        // over budget, do nothing
                        if (price > budget) {
                            console.info('budget exceeded');
                            return;
                        }

                        // select color
                        var coloroption = $('a[data-style-name="' + config.rule.color + '"]');
                        // no that color
                        if (!coloroption || !coloroption.length) {
                            console.error('Color not found! Skip ' + config.rule.color);
                            return;
                        }

                        // select size
                        var sizeoption = $('select[name="size"]');
                        if (!sizeoption || !sizeoption.length) {
                            console.error('Size not found! Skip ' + config.rule.size);
                            return;
                        }

                        $("select[name='size'] option").filter(function () {
                            return $(this).text() == config.rule.size;
                        }).prop('selected', true);

                        // select quantity
                        // OK to have no qunatity
                        var quantityoption = $('select[name="qty"]');
                        if (!quantityoption || !quantityoption.length) {
                            console.info('Qunatity not found. Continue with default quantity ' + config.rule.maxquantity);
                        } else {
                            var qty = parseInt(config.rule.maxquantity);
                            // invalid qty
                            if (isNaN(qty) || qty < 1) {
                                console.error('Invalid quantity ' + qty);
                                return;
                            }

                            // get the max valiable qty
                            quantityoption.val(qty);
                            while (quantityoption.val() != qty) {
                                qty--;
                                quantityoption.val(qty);
                            }
                        }

                        // all set, submit
                        $('input[type="submit"]').click();
                        // adjust the current budget
                        return budget - price;
                    },
                        {
                            config: config,
                            budget: budget,
                        }
                    );
                }, 2000);
        });
    });
});

// entry
casper.run(function () {
    this.exit();
});

/**
 * Get current budget
 */
function getBudget() {
    var configuredBudget = parseInt(config.rule.budget);

    // config budget is wierd.. fallback to safe side
    if (isNaN(configuredBudget)) {
        console.error('budget config is wierd. FIX IT');
        return 0;
    }

    // no budget file => return configured budget
    if (!fs.exists(budgetfile)) {
        return configuredBudget;
    }

    var budget = parseInt(fs.readFileSync(budgetfile));
    // budget storage is wierd.. fallback to safe side
    if (isNaN(budget)) {
        console.error('budget storage is wierd...');
        return 0;
    }

    return budget;
}


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