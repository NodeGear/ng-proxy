var httpProxy = require('http-proxy')
	, http = require('http')
	, https = require('https')
	, fs = require('fs')
	, async = require('async')
	, config = require('./config')
	, client = null
	, tls = require('tls')
	, fs = require('fs')

var Proxy = function(ng_proxy) {
	var self = this;
	self.ng_proxy = ng_proxy;

	client = ng_proxy.client;
	
	process.nextTick(function() {
		self.server = server = http.createServer(self.httpRequest);
		server.on('upgrade', self.wsRequest);
		server.listen(config.proxyPort);

		console.log("HTTP + ws Proxy listening on :", config.proxyPort);

		fs.exists(__dirname+'/../server.crt', function (exists) {
			if (exists) {
				// Enable HTTPs
				var https_options = {
//					SNICallback: self.SNICallback, // Async SNI Doesn't work yet :(
					cert: fs.readFileSync(__dirname+'/../server.crt'),
					key: fs.readFileSync(__dirname+'/../server.key'),
				};

				self.servers = servers = https.createServer(https_options, self.httpsRequest);
				servers.on('upgrade', self.wssRequest);
				servers.listen(config.proxyPorts);
				
				console.log("HTTPs + wss Proxy listening on :", config.proxyPorts);
			} else {
				console.log("HTTPs NOT Enabled! Missing server.crt and server.key");
			}
		});
	});
	
	this.proxy = httpProxy.createProxyServer();

	// Get dynamic hostname for SSL
	this.SNICallback = function (hostname, cb) {
		console.log(hostname);
		console.log(cb);

		self.getAppByHostname(hostname, function(app) {
			self.getAppProcess(app, function(app_process) {
				console.log(app_process);

				var creds = tls.createSecureContext({
					key: app_process['domain_ssl__key_'+hostname],
					cert: app_process['domain_ssl__crt_'+hostname]
				});

				cb(null, creds.context);
			});
		});
	}
	
	// Websocket request
	this.wsRequest = function (req, socket, head) {
		self.proxyRequest(req, [socket, head], 'ws', false, function () {
			socket.end();
		});
	}

	// Websocket secure request
	this.wssRequest = function (req, socket, head) {
		self.proxyRequest(req, [socket, head], 'ws', true, function () {
			socket.end();
		});
	}

	// HTTP Request
	this.httpRequest = function(req, res) {
		self.proxyRequest(req, [res], 'web', false, function (status) {
			if (status == 404) {
				return self.send404(req, res, false);
			}

			res.writeHead(status);
			res.end();
		});
	}

	// HTTPs Request
	this.httpsRequest = function (req, res) {
		self.proxyRequest(req, [res], 'web', true, function (status) {
			if (status == 404) {
				return self.send404(req, res, false);
			}

			res.writeHead(status);
			res.end();
		});
	}

	// General Proxy handle
	this.proxyRequest = function (req, connection, type, secure, error) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			return error(404);
		}

		async.waterfall([
			function (done) {
				self.getAppByHostname(hostname, function(app) {
					if (!app) {
						return done(404);
					}

					done(null, app);
				});
			},
			function (app, done) {
				self.getAppProcess(app, function(app_process) {
					if (!app_process) {
						return done(410);
					}

					done(null, app, app_process);
				});
			},
			function (app, app_process, done) {
				//console.log("Proxying HTTP to", app_process);
				
				connection.splice(0, 0, req);
				connection.push({
					target: {
						host: app_process.hostname,
						port: app_process.port
					}
				});
				connection.push(function(e) {
					error(410);
				});

				done(null);
			},
			function (done) {
				self.proxy[type].apply(self.proxy, connection);

				done();
			}
		], function (err) {
			if (err)
				error(err);
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