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
		
		var drone = self.getDroneByHostname(hostname);
		if (!drone) {
			// quit the socket
			if (socket && socket.end)
				socket.end();
			
			return;
		}
		
		if (drone.processes.length == 0) {
			// quit the socket
			if (socket && socket.end)
				socket.end();
			
			return;
		}
		
		nextProc = drone.processes[0];
		
		self.proxy.ws(req, socket, head, {
			target: {
				host: '127.0.0.1',
				port: nextProc.port
			}
		});
	}

	this.httpRequest = function(req, res) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			// let it 404
			res.writeHead(404, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
		
			return;
		}
		
		var ip = req.connection.remoteAddress;
		// behind nginx or other proxy
		if (req.headers['x-forwarded-for']) {
			ip = req.headers['x-forwarded-for']
		}
		
		var analytic = new models.Analytic({
			start: Date.now(),
			hostname: hostname,
			url: req.url,
			request: req.method,
			ip: ip
		})
		res.on('finish', function () {
			analytic.end = Date.now()
			analytic.statusCode = res.statusCode
		
			analytic.save(function(err) {
				if (err) throw err;
			})
		})
	
		// Metrics for Incoming
		req.on('data', function(chunk) {
			analytic.reqSize += chunk.length;
		})
	
		// Metrics for Outgoing
		var _write = res.write;
		res.write = function (chunk) {
			analytic.resSize += chunk.length;
			_write.call(res, chunk);
		};
	
		self.getAppByHostname(hostname, function(app) {
			if (!app) {
				res.writeHead(404, { 'Content-Type': 'text/html' });
				fs.createReadStream(__dirname+"/404.html").pipe(res);
			
				return;	
			}

			//analytic.drone = drone._id
			analytic.found = true
			
			self.getAppProcess(app, function(process) {
				if (!process) {
					// let it 404
					res.writeHead(404, { 'Content-Type': 'text/html' });
					fs.createReadStream(__dirname+"/404_no_active_processes.html").pipe(res);
				
					return;
				}

				// We have _id of the process, but we need hostname and port.
				self.getAppProcessDetails(app_process, function(app_process) {
					console.log("Proxying to", app_process);
					
					// proxy it to the drone
					self.proxy.web(req, res, {
						target: {
							host: app_process.hostname,
							port: app_process.port
						}
					});
				});
			})
		});
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
	client.hmget("proxy:domains", hostname, function (err, results) {
		if (results.length == 0) return cb(null);

		cb(results[0]);
	})
}

Proxy.prototype.getAppProcess = function (app, cb) { 
	client.srandmember("proxy:app_"+app, 1, function(err, process) {
		if (process.length == 0) return cb(null);

		cb(process[0]);
	})
}

Proxy.prototype.getAppProcessDetails = function (process_id, cb) {
	client.hgetall("proxy:app_process_"+process_id, function(err, hash) {
		if (hash == null) return cb(null);

		cb(hash);
	})
}

exports.Proxy = Proxy;