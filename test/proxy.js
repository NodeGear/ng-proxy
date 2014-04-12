var config = require('../lib/config');
var ng_proxy = require('../bin/ng-proxy');
var proxy = ng_proxy.Proxy;
var client = ng_proxy.client;

var should = require('should'),
	models = require('ng-models')

if (!process.env.NG_TEST) {
	console.log("\nNot in TEST environment. Please export NG_TEST variable\n");
}

should(process.env.NG_TEST).be.ok;

describe('will test app stuff', function() {
	var user, app, app_domain, app_process, app_env;

	before(function() {
		user = new models.User({
			username: "matejkramny",
			usernameLowercase: "matejkramny",
			name: "Matej Kramny",
			email: "matej@matej.me",
			email_verified: true,
			uid: 500,
			gid: 501,
			admin: true
		})
		user.save();

		app = new models.App({
			name: "Test Application",
			nameUrl: "test-application",
			user: user._id,
			location: "app/",
			script: "test.js"
		})
		app.save();

		app_domain = new models.AppDomain({
			app: app._id,
			domain: "matej.local",
			tld: "local",
			is_subdomain: false
		});
		app_domain.save();

		app_process = new models.AppProcess({
			app: app._id,
			running: false
		});
		app_process.save();

		app_env = new models.AppEnvironment({
			app: app._id,
			name: "test",
			value: "value"
		});
		app_env.save();

	});


	it('should get app by domain', function(done) {
		client.hmset('proxy:domains', {
			"matej.me": app._id
		}, function() {
			proxy.getAppByHostname("matej.me", function(app) {
				app.should.not.be.null;

				done(null);
			})
		});
	});

	it('should get process by app id', function(done) {
		client.sadd('proxy:app_'+app._id, app_process._id, function(err) {
			if (err) throw err;

			proxy.getAppProcess(app._id, function(process) {
				app_process._id.toString().should.be.equal(process);

				done(null);
			})
		})
	})

	it('should get hostname and port for app process', function (done) {
		client.hmset('proxy:app_process_'+app_process._id, {
			hostname: '127.0.0.1',
			port: 9001
		}, function (err) {
			if (err) throw err;

			proxy.getAppProcessDetails(app_process._id, function(hash) {
				hash.should.be.instanceOf(Object);
				hash.hostname.should.be.equal('127.0.0.1');
				hash.port.should.be.equal(9001);
				
				done(null);
			})
		})
	})
})