var fs = require('fs')
	, mailer = require('nodemailer')

// Warning: Export NG_TEST to enable test mode.

try {
	var credentials = './credentials';
	if (process.env.NG_TEST) {
		credentials = './credentials-test';

		console.log("-- TEST MODE --")
	}

	var credentials = require(credentials)
} catch (e) {
	console.log("\nNo credentials.js File!\n")
	process.exit(1);
}

exports.credentials = credentials;

// Create SMTP transport method
if (process.env.NG_TEST) {
	exports.transport_enabled = false;
} else {
	exports.transport_enabled = credentials.smtp.user.length > 0;
}
exports.transport = mailer.createTransport("SMTP", {
	service: "Mandrill",
	auth: credentials.smtp
});

exports.version = require('../package.json').version;
exports.hash = '';
exports.env = process.env.NODE_ENV == "production" ? "production" : "development";

exports.redis_key = credentials.redis_key;

exports.db = credentials.db;
exports.networkDb = credentials.networkDb;

exports.db_options = credentials.db_options;
exports.networkDb_options = credentials.networkDb_options;

exports.proxyPort = credentials.proxyPort || 8998;
exports.proxyPorts = credentials.proxyPorts || 8996;