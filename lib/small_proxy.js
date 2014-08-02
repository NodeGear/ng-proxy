var net = require('net'), tls = require('tls');
var fs = require('fs');

var https_options = {
	//SNICallback: self.SNICallback, // Async SNI Doesn't work yet :(
	cert: fs.readFileSync(__dirname+'/../server.crt'),
	key: fs.readFileSync(__dirname+'/../server.key'),
};

net.createServer(tcpRequest).listen(8888);
tls.createServer(https_options, tcpRequest).listen(8889);

console.log('http and https on', 8888, 8889);

function tcpRequest (socket) {
	socket.on('close', function () {
		console.log('total in: ', socket.bytesRead);
		console.log('total out: ', socket.bytesWritten);
	});

	socket.write("hello world\n");
	socket.end();
}