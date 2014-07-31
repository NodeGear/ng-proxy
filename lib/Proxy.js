var httpProxy = require('http-proxy')
	, http = require('http')
	, https = require('https')
	, fs = require('fs')
	, async = require('async')
	, config = require('./config')
	, client = null
	, tls = require('tls')
	, fs = require('fs')

var net = require('net');

var Proxy = function(ng_proxy) {
	var self = this;
	self.ng_proxy = ng_proxy;

	client = ng_proxy.client;
	
	process.nextTick(function() {
		var https_options = {
			//SNICallback: self.SNICallback, // Async SNI Doesn't work yet :(
			cert: fs.readFileSync(__dirname+'/../server.crt'),
			key: fs.readFileSync(__dirname+'/../server.key'),
		};

		self.server = server = net.createServer(self.tcpRequest).listen(config.proxyPort);
		self.servers = servers = tls.createServer(https_options, self.tcpRequest).listen(config.proxyPorts);
		console.log('tcp on', config.proxyPort, config.proxyPorts);
		return;

		//.createServer(self.httpRequest);
		server.on('upgrade', self.wsRequest);
		server.listen(config.proxyPort);

		console.log("HTTP + ws Proxy listening on :", config.proxyPort);

		fs.exists(__dirname+'/../server.crt', function (exists) {
			if (exists) {
				// Enable HTTPs
				var https_options = {
					//SNICallback: self.SNICallback, // Async SNI Doesn't work yet :(
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

	var hasHostRegex = /host:.*\r\n/i;
	this.tcpRequest = function (socket) {
		var hasIdentified = false;
		var self = this;
		var to;

		var buff = "";
		var connected = false;

		socket.on('data', function (data) {
			if (!hasIdentified) {
				var header = data.toString();
				var pos = header.search(hasHostRegex);

				if (pos > -1) {
					// find the end of the line
					header = header.substring(pos+5);
					var endPos = header.search("\r\n");
					if (endPos > -1) {
						var host = header.substring(0, endPos);

						if (host.length > 0) {
							host = host.trim();

							var hasPort = host.search(':');
							if (hasPort > -1) {
								var portParts = host.split(':');
								portParts.splice(portParts.length-1, 1);
								var host = portParts.join('');
							}

							console.log('hostname',host);
							hasIdentified = true;
						} else {
							socket.end();
						}
					} else {
						socket.end();
					}
				} else {
					socket.end();
				}
			}

			if (hasIdentified) {
				if (!to) {
					to = net.createConnection(8000);
					to.on('connect', function() {
						connected = true;
						to.write(buff);
						to.pipe(socket);
					});
				}

				if (connected) {
					to.write(data);
				} else {
					buff += data.toString();
				}
			}
		});
		socket.on('end', function () {
			console.log('total in: ', socket.bytesRead);
			console.log('total out: ', socket.bytesWritten);
		});
	}

	var regex = /^(?:[a-z0-9-]+\.)*[a-z]+$/i;
	this.tcpRequests = function (socket) {
		var hasIdentified = false;
		var self = this;
		var to = null;

		var connected = false;
		var hostname = null;

		socket.on('data', function (data) {
			if (hasIdentified == false) {
				for (var b = 0, prev, start, end, str; b < data.length; b++) {
					if (prev === 0 && data[b] === 0) {
						start = b + 2;
						end = start + data[b + 1];

						if (start < end && end < data.length) {
							str = data.toString("utf8", start, end);
							if (regex.test(str)) {
								hostname = str;
								continue;
							}
						}
					}
					prev = data[b];
				}

				if (hostname != null) {
					hasIdentified = true;
					console.log(hostname);
				} else {
					socket.end();
				}
			}

			if (hasIdentified) {
				if (connected) {
					to.write(data);
				}

				if (!to) {
					to = net.createConnection(8001);
					to.on('connect', function() {
						connected = true;

						to.write(data);
						to.pipe(socket);
					});
					
					to.on('end', function() {
						console.log('client disconnected');
					});
				}
			}
		});
		socket.on('end', function () {
		});
	}

	this.tcpError = function (socket) {
		var res = '<!DOCTYPE html>'+
'<html lang="en">'+
'<head>'+
'	<title>NodeGear 404</title>'+
'	<link href="//netdna.bootstrapcdn.com/bootstrap/3.1.1/css/bootstrap.min.css" rel="stylesheet">'+
'	<link href="//netdna.bootstrapcdn.com/bootstrap/3.1.1/css/bootstrap-theme.min.css" rel="stylesheet">'+
'</head>'+
'<body>'+
''+
'<br />'+
'<div class="jumbotron">'+
'	<div class="container">'+
'		<h1>That looks like a <code>404</code></h1>'+
'		<p>It means there is nothing here, and thats all we know :(</p>'+
'		<p><a href="https://nodegear.io/">NodeGear</a></p>'+
'	</div>'+
'</div>'+
''+
'<div class="text-center">'+
'	<a class="text-muted" href="http://nodegear.com">Powered by NodeGear</a>'+
'</div>'+
''+
'</body>'+
'</html>';

		socket.write("HTTP/1.1 404 Not Found\n" +
"Server: nginx/1.4.6 (Ubuntu)\n"+
"Date: Wed, 30 Jul 2014 20:21:08 GMT\n"+
"Content-Type: text/html; charset=utf-8\n"+
"Content-Length: "+res.length+"\n"+
"Connection: keep-alive\n\r\n"
			);
		socket.write(res);
		socket.end();
	}

	// Get dynamic hostname for SSL
	this.SNICallback = function (hostname, cb) {
		console.log(hostname);
		console.log(cb);

		self.getAppByHostname(hostname, function(app) {
			self.getAppProcess(app, function(app_process) {
				console.log(app_process);
				
				//TODO check exists etc

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
		self.proxyRequest({
			req: req,
			stack: [socket, head],
			type: 'ws',
			handle: self.proxy.web
		});
	}

	// Websocket secure request
	this.wssRequest = function (req, socket, head) {
		self.proxyRequest({
			req: req,
			stack: [socket, head],
			type: 'ws',
			handle: self.proxy.web,
			secure: true
		});
	}

	// HTTP Request
	this.httpRequest = function(req, res) {
		self.proxyRequest({
			req: req,
			stack: [res],
			type: 'web',
			handle: self.proxy.web
		});
	}

	// HTTPs Request
	this.httpsRequest = function (req, res) {
		self.proxyRequest({
			req: req,
			stack: [res],
			type: 'web',
			handle: self.proxy.web,
			secure: true
		});
	}

	this.logRequest = function (options) {

	}

	// General Proxy handle
	this.proxyRequest = function (options) {
		var hostname = self.getHostname(options.req);
		var error = options.error;

		if (!error) {
			error = self.genericError;
		}

		if (!hostname) {
			return error(options, 404);
		}

		options.request_start = Date.now();

		var logRequest = function () {
			options.stack[0].removeListener('finish', logRequest);
			options.stack[0].removeListener('close', logRequest);

			self.logRequest(options);
		}

		if (options.type == 'web') {
			options.stack[0].on('finish', logRequest);
			options.stack[0].on('close', logRequest);
			console.log('ondata')
			options.req.on('data', function () {
				console.log('args-',arguments);
			});
		}

		async.waterfall([
			function (done) {
				self.getAppByHostname(hostname, function(app) {
					if (!app) {
						return done(404);
					}

					options.app = app;

					done(null, app);
				});
			},
			function (app, done) {
				self.getAppProcess(app, function(app_process) {
					if (!app_process) {
						return done(410);
					}

					options.app_process = app_process._id;

					done(null, app, app_process);
				});
			},
			function (app, app_process, done) {
				//console.log("Proxying HTTP to", app_process);

				if (options.type == 'web') {
					if (app_process.ssl === '0' && options.secure) {
						// Downgrade to a non-ssl page
						options.stack[0].writeHead(302, {
							Location: 'http://'+req.headers.host+req.url
						});
						
						return done(302);
					}

					if (app_process.ssl === '1' && app_process.ssl_only === '1' && !options.secure) {
						// Upgrade to an ssl page
						options.stack[0].writeHead(302, {
							Location: 'https://'+req.headers.host+req.url
						});
						
						return done(302);
					}
				}

				options.stack.splice(0, 0, req);
				options.stack.push({
					target: {
						host: app_process.hostname,
						port: app_process.port
					}
				});
				options.stack.push(function(e) {
					error(410);
				});

				done(null);
			},
			function (done) {
				options.handle.apply(self.proxy, options.stack);

				done();
			}
		], function (err) {
			if (err == 302) {
				return options.stack[0].end();
			}

			if (err) {
				error(options, err);
			}
		});
	}

	this.genericError = function (options, status) {
		var file_404 = '404.html';
		/*if (no_processes) {
			file_404 = '404_no_active_processes.html';
		}*/

		options.stack[0].writeHead(404, {
			'Content-Type': 'text/html'
		});

		fs.createReadStream(__dirname+'/views/'+file_404)
			.pipe(options.stack[0]);
		
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