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
	bugsnag.register("c0c7568710bb46d4bf14b3dad719dbbe", {

	});
}

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

exports.client = redis.createClient();
if (config.env == 'production') {
	exports.client.auth("ahShii3ahyoo0OhJa1ooG4yoosee8me9EvahW0ae")
}

exports.Proxy = new (require('../lib/Proxy').Proxy)(exports);