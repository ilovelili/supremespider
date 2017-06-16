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
    console.log('links are:');
    utils.dump(links);

    links.forEach(function (link, index, arr) {
        casper.thenOpen('http://www.supremenewyork.com' + link, function () {
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
                            console.log('invalid price. Skip');
                            return budget;
                        }

                        // over budget, do nothing
                        if (price > budget) {
                            console.info('budget exceeded');
                            return budget;
                        }

                        // select color
                        // Black as default
                        if (!config.rule.color) config.rule.color = 'Black';

                        var coloroption = $('a[data-style-name="' + config.rule.color + '"]');
                        // no that color
                        if (!coloroption || !coloroption.length) {
                            console.log('Color not found. Skip');
                        } else {
                            coloroption[0].click();
                        }

                        // select size
                        var sizeoption = $('select[name="size"]');
                        if (!sizeoption || !sizeoption.length) {
                            console.log('Size not found. Skip');
                        } else {
                            // Medium as default
                            if (!config.rule.size) config.rule.size = 'Medium';

                            $("select[name='size'] option").filter(function () {
                                return $(this).text() == config.rule.size;
                            }).prop('selected', true);

                            $("select[name='size']").trigger('change');
                        }

                        // select quantity
                        // OK to have no qunatity
                        var quantityoption = $('select[name="qty"]');
                        if (!quantityoption || !quantityoption.length) {
                            console.info('Qunatity not found. Try with default quantity ' + config.rule.maxquantity);
                        } else {
                            var qty = parseInt(config.rule.maxquantity);
                            // invalid qty
                            if (isNaN(qty) || qty < 1) {
                                console.log('Invalid quantity ' + qty);
                                return budget;
                            }

                            // get the max valiable qty
                            quantityoption.val(qty);
                            while (quantityoption.val() != qty) {
                                qty--;
                                quantityoption.val(qty);
                            }
                        }

                        // add to cart
                        $('input[type="submit"]').click();
                        return budget - price;
                    },
                        {
                            config: config,
                            budget: budget,
                        }
                    );

                    // !! last index => check out
                    if (index == links.length - 1) {
                        // view summary
                        this.then(function () {
                            this.wait(2000, function () {
                                this.evaluate(function summary() {
                                    //  $('.edit')[0] instead of $('.edit') for anchor click
                                    $('.edit')[0].click();
                                });
                            });
                        });

                        // click checkout
                        this.then(function () {
                            this.wait(2000, function () {
                                this.capture(fs.pathJoin('./snapshots', dateservice.today + '/summary.png'));
                                // then checkout
                                this.evaluate(function checkout() {
                                    $('.checkout')[0].click();
                                });
                            });
                        });

                        // go checkout
                        this.then(function () {
                            this.wait(2000, function () {
                                // fill in the checkout form                                
                                this.evaluate(function checkout(config) {
                                    // do not use $("#order_billing_state).val(' ' + config.userinfo.state) in case select change event not triggered
                                    $("#order_billing_state option").filter(function () {
                                        return $(this).text().indexOf(config.userinfo.state) > -1; // there is a space prefix on the site...
                                    }).prop('selected', true);
                                    // trigger change manually
                                    $('#order_billing_state').trigger('change');

                                    $('#credit_card_type option').filter(function () {
                                        return $(this).text() == config.payment;
                                    }).prop('selected', true);
                                    // trigger change manually
                                    $('#credit_card_type').trigger('change');

                                    $('#credit_card_last_name').val(config.userinfo.lastname);
                                    $('#credit_card_first_name').val(config.userinfo.firstname);
                                    $('#order_email').val(config.userinfo.email);
                                    $('#order_tel').val(config.userinfo.tel);
                                    $('#order_billing_state').val(' ' + config.userinfo.state);
                                    $('#order_billing_city').val(config.userinfo.city);
                                    $('#order_billing_address').val(config.userinfo.street);
                                    $('#order_billing_zip').val(config.userinfo.postalcode);

                                    // inject g-recaptcha-response                                    
                                    check = window.setInterval(function () {
                                        if ($('#g-recaptcha-response')) {
                                            $('#g-recaptcha-response').val('03AOPBWq_clHKIYs5n7x2thfEGTEB20dH44M0mewWwP13LZ2DZlJ0NXS14I-LgXhhod82S8WbbuhBFcmYF9mJmhS_pWAmHXBwCeNlDtAECqK_Cp6wLmyUawCT10nqkxOE_T7Jx8wAoEN1-05PHpHAZ4TG_C4ulwRxWiaIzoNI9Py88ZPs_bGPzF4zTO4wVoBQBME394X_eGewLXYmvEGZ6EbYo5ku-WJPVe8OQTSfxYWAXAFbQQ07Tn3avbH-TmZA3_CdWWviJX5eYq9GATXx1CXEP4tZjYAh6VSfLGISAPeHKvQSQw7ORucdosNzB9AXwC09EZCV4iCAftNiIEldPW8o5l6dljZaMlvmBwnwhf_7KcPzWHdDMHFarv9rzA8YjNOr4teYgW-movtSCw11VKKGFgS800P4aWKWUOZHMZMzkNZovOryxXNg')
                                            window.clearInterval(check);
                                        }
                                    }, 400)

                                    // service terms
                                    $('#order_terms')[0].click();

                                    // comment out me to place REAL orders!                                
                                    this.setTimeout(function () {
                                        // Have picture validation.. So can't call submit directly.
                                        // create an AJAX call and post to endpoint directly?
                                        $('form').submit();
                                    }, 1000);
                                },
                                    {
                                        config: config
                                    });
                            });
                        });

                        // after checkout
                        this.then(function () {
                            this.wait(2000, function () {
                                this.capture(fs.pathJoin('./snapshots', dateservice.today + '/checkout-completed.png'));
                            });
                        })

                    } // exit checkout

                    console.log('current budget is ' + budget);

                }, 2000);
        });
    });
});

// entry
casper.run(function () {
    console.log('All done. Exit');
    this.exit();
});

/**
 * Get current budget
 */
function getBudget() {
    var configuredBudget = parseInt(config.rule.budget);

    // config budget is wierd.. fallback to safe side
    if (isNaN(configuredBudget)) {
        console.log('budget config is wierd. FIX IT');
        return 0;
    }

    // no budget file => return configured budget
    if (!fs.exists(budgetfile)) {
        return configuredBudget;
    }

    var budget = parseInt(fs.readFileSync(budgetfile));
    // budget storage is wierd.. fallback to safe side
    if (isNaN(budget)) {
        console.log('budget storage is wierd...');
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