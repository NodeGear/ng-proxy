var http = require('http')
	, path = require('path')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, util = require('util')
	, events = require('events')
	, config = require('../lib/config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")
	, models = require('ng-models').init(mongoose, config)

mongoose.connect(config.db, config.db_options);

if (!process.env.NG_TEST) {
	bugsnag.register(config.credentials.bugsnag_key, {});
}

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

exports.client = redis.createClient();
if (config.production) {
	exports.client.auth(config.redis_key)
}

exports.Proxy = new (require('../lib/Proxy').Proxy)(exports);