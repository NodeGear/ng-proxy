var httpProxy = require('http-proxy')
	, http = require('http')
	, https = require('https')
	, fs = require('fs')
	, async = require('async')
	, config = require('./config')
	, client = null
	, crypto = require('crypto')
	, fs = require('fs')

var Proxy = function(ng_proxy) {
	var self = this;
	self.ng_proxy = ng_proxy;

	client = ng_proxy.client;
	
	process.nextTick(function() {
		var https_options = {
			SNICallback: self.SNICallback,
			cert: fs.readFileSync(__dirname+'/../server.crt'),
			key: fs.readFileSync(__dirname+'/../server.key'),
		};

		self.server = server = http.createServer(self.httpRequest);
		self.servers = servers = https.createServer(https_options, self.httpsRequest);

		server.on('upgrade', self.wsRequest);
		servers.on('upgrade', self.wssRequest);

		server.listen(config.proxyPort);
		servers.listen(config.proxyPorts);
		
		console.log("HTTP + ws Proxy listening on :", config.proxyPort)
		console.log("HTTPs + wss Proxy listening on :", config.proxyPort);
	});
	
	this.proxy = httpProxy.createProxyServer();

	// Get dynamic hostname for SSL
	this.SNICallback = function (hostname, cb) {
		console.log(hostname);
		console.log(cb);

		self.getAppByHostname(hostname, function(app) {
			self.getAppProcess(app, function(app_process) {
				console.log(app_process);

				var creds = crypto.createCredentials({
					key: app_process['domain_ssl__key_'+hostname],
					cert: app_process['domain_ssl__crt_'+hostname]
				});

				cb(null, creds.context);
			});
		});
	}
	
	this.wsRequest = function (req, socket, head) {
		self.proxyRequest(req, [socket, head], 'ws', function () {

		});
	}

	this.httpRequest = function(req, res) {
		self.proxyRequest(req, [res], 'web', function () {

		});
	}

	this.httpsRequest = function (req, res) {
		self.proxyRequest(req, [res], 'web', function () {

		});
	}

	this.proxyRequest = function (req, connection, type, callback) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			return callback(404, req, connection, type);
		}
		
		self.getAppByHostname(hostname, function(app) {
			if (!app) {
				return callback(404, req, connection, type);
			}

			self.getAppProcess(app, function(app_process) {
				if (!app_process) {
					return callback(410, req, connection, type);
				}

				console.log("Proxying HTTP to", app_process);
				
				connection.splice(0, 0, req);
				connection.push({
					target: {
						host: app_process.hostname,
						port: app_process.port
					}
				});
				connection.push(function(e) {
					callback(410, req, connection, type);
				});

				self.proxy[type].apply(self, connection);
			});
		});
	}

	this.send404 = function (req, res, no_processes) {
		if (typeof no_processes === 'undefined') {
			no_processes = false;
		}
		no_processes = !!no_processes;

		var file_404 = '404.html';
		if (no_processes) {
			file_404 = '404_no_active_processes.html';
		}

		res.writeHead(404, {
			'Content-Type': 'text/html'
		});

		fs.createReadStream(__dirname+'/views/'+file_404)
			.pipe(res);
		
		return;
	}
}

Proxy.prototype.getHostname = function (req) {
	var self = this;
	
	// match hostname here
	var hostname = req.headers.host;
	if (!hostname) {
		return null;
	}
	
	var splitHostname = hostname.split(":"); // separates the port
	if (splitHostname.length > 1) {
		hostname = splitHostname[0]
	}
	
	return hostname;
}

Proxy.prototype.getAppByHostname = function (hostname, cb) {
	var self = this;

	client.hmget("proxy:domains", hostname, function (err, results) {
		if (results.length == 0) return cb(null);

		cb(results[0]);
	});
}

Proxy.prototype.getAppProcess = function (app, cb) { 
	var self = this;

	client.srandmember("proxy:app_"+app, function (err, process) {
		if (!process || process.length == 0) return cb(null);

		self.getAppProcessDetails(process, cb);
	});
}

Proxy.prototype.getAppProcessDetails = function (process_id, cb) {
	var self = this;

	client.hgetall("proxy:app_process_"+process_id, function(err, hash) {
		if (hash == null) return cb(null);

		hash._id = process_id;

		cb(hash);
	});
}

exports.Proxy = Proxy;