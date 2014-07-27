var http = require('http')
	, path = require('path')
	, fs = require('fs')
	, util = require('util')
	, events = require('events')
	, config = require('../lib/config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")

if (!process.env.NG_TEST) {
	bugsnag.register(config.credentials.bugsnag_key, {});
}

exports.client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);
if (config.production) {
	exports.client.auth(config.redis_key)
}

exports.Proxy = new (require('../lib/Proxy').Proxy)(exports);