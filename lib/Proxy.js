var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')
	, models = require('ng-models')
	, async = require('async')
	, usage = require('usage')
	, config = require('./config')
	, client = null;

var Proxy = function(ng_proxy) {
	var self = this;
	self.ng_proxy = ng_proxy;

	client = ng_proxy.client;
	
	process.nextTick(function() {
		self.server = server = http.createServer(self.httpRequest);
		server.on('upgrade', self.wsRequest);
		server.listen(config.proxyPort)
		
		console.log("Proxy listening on "+config.proxyPort)
	})
	
	this.proxy = httpProxy.createProxyServer();
	
	this.wsRequest = function (req, socket, head) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			// quit the socket
			if (socket && socket.end)
				socket.end();
			
			return;
		}
		
		self.getAppByHostname(hostname, function(app) {
			if (!app) {
				// quit the socket
				if (socket && socket.end)
					socket.end();
				
				return;
			}

			self.getAppProcess(app, function(app_process) {
				if (!app_process) {
					// quit the socket
					if (socket && socket.end)
						socket.end();
					
					return;
				}

				console.log("Proxying WS to", app_process);

				self.proxy.ws(req, socket, head, {
					target: {
						host: app_process.hostname,
						port: app_process.port
					}
				});

				var analytic = new models.Analytic({
					start: Date.now(),
					hostname: hostname,
					app: app,
					process: app_process._id,
					found: true,
					websocket: true,

				})
				analytic.ip = req.connection.remoteAddress;
				// behind nginx or other proxy
				if (req.headers['x-forwarded-for']) {
					analytic.ip = req.headers['x-forwarded-for']
				}
				analytic.save();
			})
		});
	}

	this.httpRequest = function(req, res) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			return self.send404(req, res);
		}
		
		var analytic = new models.Analytic({
			start: Date.now(),
			hostname: hostname
		})

		function logRequest () {
			res.removeListener('finish', logRequest);
			res.removeListener('close', logRequest);

			self.logRequest(req, res, analytic);
		}

		res.on('finish', logRequest);
		res.on('close', logRequest);
	
		// Metrics for Outgoing
		var _write = res.write;
		res.write = function (chunk) {
			analytic.resSize += chunk.length;
			_write.apply(res, arguments);
		};
		
		self.getAppByHostname(hostname, function(app) {
			if (!app) {
				return self.send404(req, res);
			}

			analytic.app = app;
			analytic.found = true
			
			self.getAppProcess(app, function(app_process) {
				if (!app_process) {
					return self.send404(req, res, true);
				}

				console.log("Proxying HTTP to", app_process);
				
				analytic.process = app_process._id;
				
				self.proxy.web(req, res, {
					target: {
						host: app_process.hostname,
						port: app_process.port
					}
				}, function(e) {
					analytic.error = true;
					analytic.errorCode = e.code;
					analytic.errno = e.errno;

					self.send404(req, res);
				});
			})
		});
	}

	this.logRequest = function (req, res, analytic) {
		var now = Date.now();
		var ms = now - req._monitor_startTime;
		
		var ip = req.connection.remoteAddress;
		// behind nginx or other proxy
		if (req.headers['x-forwarded-for']) {
			ip = req.headers['x-forwarded-for']
		}

		var len = parseInt(res.getHeader('Content-Length'), 10);
		if (isNaN(len)) {
			len = 0;
		}
		
		var status = res.statusCode;
		var method = req.method;
		
		analytic.statusCode = status;
		analytic.method = method;
		analytic.reqSize = len;
		analytic.delay = ms;
		analytic.ip = ip;

		analytic.save(function(err) {
			if (err) throw err;
		})
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
	})
}

Proxy.prototype.getAppProcess = function (app, cb) { 
	var self = this;

	client.srandmember("proxy:app_"+app, 1, function(err, process) {
		if (process.length == 0) return cb(null);

		self.getAppProcessDetails(process[0], cb);
	})
}

Proxy.prototype.getAppProcessDetails = function (process_id, cb) {
	var self = this;

	client.hgetall("proxy:app_process_"+process_id, function(err, hash) {
		if (hash == null) return cb(null);

		hash._id = process_id;

		cb(hash);
	})
}

exports.Proxy = Proxy;