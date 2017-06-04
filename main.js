var casper = require('casper')
    .create({
        verbose: true,
        logLevel: 'debug',
        pageSettings: {
            loadImages: false,
            loadPlugins: false
        },
        // clientScripts: ["includes/jquery-3.2.1.min.js"]
    }),
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
    budgetfile = fs.pathJoin('./budget', dateservice.today + '.csv'),
    utils = require('utils'),
    url = 'http://www.supremenewyork.com/shop',
    links = [];

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
            this.capture(fs.pathJoin('./snapshots', dateservice.today + link + '.png'));
        });
    });
});

// entry
casper.run(function () {
    this.exit();
});

/**
 * Over budget or not? 
 */
function overBudget(price) {
    // no budget file => not over budget
    if (!fs.exists(path)) return false;

    var budget = parseInt(fs.readFileSync(budgetfile));
    // budget storage is wierd.. fallback to safe side
    if (isNaN(budget)) {
        console.error('budget storage is wierd...');
        return yes;
    }

    // config budget is wierd.. fallback to safe side
    if (isNaN(parseInt(config.rule.budget))) {
        console.error('budget config is wierd. FIX IT');
        return yes;
    }

    return budget + price >= parseInt(config.rule.budget)
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