var should = require('should');

var config = require('../lib/config')
	, ng_proxy = require('../bin/ng-proxy')
	, proxy = ng_proxy.Proxy
	, client = ng_proxy.client
	, fs = require('fs')
	, async = require('async');

var request = require('supertest');

if (!process.env.NG_TEST) {
	console.log("\nNot in TEST environment. Please export NG_TEST variable\n");
}

should(process.env.NG_TEST).be.ok;

describe('will test app stuff', function() {
	var app_id = 'test_domain';
	var process_id = app_id+'-proc';

	it('should get app by domain', function(done) {
		client.hmset('proxy:domains', {
			"nodegear.dev": app_id
		}, function() {
			proxy.getAppByHostname("nodegear.dev", function(app) {
				app.should.be.equal(app_id);

				done(null);
			});
		});
	});

	it('should get process by app id', function(done) {
		async.waterfall([
			function (done) {
				client.sadd('proxy:app_'+app_id, process_id, done);
			},
			function (added, done) {
				client.hmset('proxy:app_process_'+process_id, {
					hostname: '127.0.0.1',
					port: 9001,
					ssl: 1,
					ssl_only: 0
				}, done);
			},
			function (added, done) {
				proxy.getAppProcess(app_id, function(process) {
					done(null, process);
				});
			},
			function (process, done) {
				process.should.be.instanceOf(Object);
				process_id.should.be.equal(process._id);
				process.hostname.should.be.equal('127.0.0.1');
				process.port.should.be.equal('9001');
				process.ssl.should.be.equal('1');
				process.ssl_only.should.be.equal('0');

				done();
			}
		], done);
	});

	it('should test a request, 404 return', function (done) {
		request('http://127.0.0.1:8888')
			.get('/')
			.expect(404, done);
	});

	it('should terminate with 410 because the app doesnt run', function (done) {
		async.waterfall([
			function (done) {
				client.hmset('proxy:domains', {
					"localhost": 'localhost'
				}, done);
			},
			function (added, done) {
				client.sadd('proxy:app_localhost', 'localhost1', done);
			},
			function (added, done) {
				client.hmset('proxy:app_process_localhost1', {
					hostname: '127.0.0.1',
					port: 6060,
					ssl: 1,
					ssl_only: 0
				}, done);
			},
			function (added, done) {
				proxy.getAppProcess(app_id, function(process) {
					done(null, process);
				});
			},
			function (process, done) {
				request('http://localhost:8888')
					.get('/')
					.expect(410, done);
			}
		], done);
	});

	/*
	it('should add SSL cert and test that SNI Callback returns it', function(done) {
		this.timeout(0);
		async.waterfall([
			function (done) {
				fs.readFile(__dirname+'/../test_files/test_ssl.crt', done);
			},
			function (crt, done) {
				fs.readFile(__dirname+'/../test_files/test_ssl.key', function (err, key) {
					done(err, crt, key);
				});
			},
			function (crt, key, done) {
				client.hmset('proxy:app_process_'+process_id, {
					'domain_ssl__crt_matej.me': crt,
					'domain_ssl__key_matej.me': key
				}, done);
			},
			function (added, done) {
				proxy.SNICallback('nodegear.dev', function(err, context) {
					should(err).be.null;
					should(context).be.instanceOf(Object);

					done();
				})	
			}
		], done);
	});
	*/
});