var events = require('events'),
	ee = new events.EventEmitter();

ee.on('start', function(req, res) {
	console.log("TEST A recieved 'start' req: %s res: %s", typeof req, typeof res);
	res.writeHead(200, {'Content-Type': 'text/html'})
	res.end("<html><body><h1>Test A</h1></body></html>");
})
module.exports = ee;