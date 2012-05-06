#!/usr/bin/env node

var ts = require('commander'),
	colors = require('colors'),
	qs = require('querystring'),
	request = require('request'),
	session = require('sesh').session,
	http = require('http'),
	path = require('path'),
	url = require('url'),
	fs = require('fs'),
	_ = require('underscore');

var prefix = 'tm info'.yellow + ': '.white,
	errPrefix = 'tm error'.red + ': '.white;

ts.version('0.0.1')	
	.option('-p, --port <PORT>', 'Set the port to run taskmanager on.')
	.option('-a, --address <IP ADDRESS>', 'Set the IP Address to run server on.')
	.option('-s, --secret <PASS PHRASE>', 'Set a secret pass-phrase for connecting to server.')
	.option('-f, --file <FILENAME>', 'Set file to run as a slave')
	.option('-i, --id <UNIQUE IDENTIFIER>', 'Specify a unique identifier for a process.')

ts.command('start [type]')
	.description('Start a specified <TYPE> of process. ie: "Master" or "Slave".')
	.option('-i, --id <ID>', 'ID of process to Start')
	.action(function (type, options) {
		
		type = type || 'master'; // default = 'master'
		console.log(prefix + 'Running action <start> on <%s> process <%s>', type, options.parent.id);

		var typeHandlers = {
			"master": function (options) {

				// console.log(prefix + "Start Master with options: ", options);
				console.log(prefix + "Checking for local config.json...");
				var configFile = path.resolve(__dirname + "/config.json"),
					configFileFound = path.existsSync(configFile);

				console.log(prefix + configFile);
				console.log(prefix + "Config file found: %s>", configFileFound);


				if (configFileFound) options = taskmanager.processConfigFile(configFile, options);


				// Defaults
				// if (typeof options === 'undefined') var options = {};
				var id = options.id || 'default';
				var secret = ts.secret = options.secret || 'beepboop';

				console.log(prefix + 'Starting Master server process "%s"', options.id);
				var validate = (function(options) {
					return (
						  (typeof options === 'undefined') 			? 'No Address or Port provided for Master to run at.'
						: (typeof options.address === 'undefined') 	? 'No Address provided for Master to run at.'
						: (typeof options.port === 'undefined') 	? 'No Port provided for Master to run at.'
						: false
						);
				})(options);

				if (validate) {
					console.log(errPrefix + validate);
					process.exit()
				}


				http.createServer(function (req, res) {
					taskmanager.resp(req,res)
				}).listen(options.port);
				console.log(prefix + "Taskmanager Master <%s> running at %s:%s --secret=%s", id, options.address, options.port, secret)
			},
			"slave": function (options) {

				var id = options.id = options.id || 'default';
				var secret = options.secret = options.secret || 'beepboop';
				var file = path.normalize(__dirname + "/" + options.file);

				var validate = (function(options) {
					return (
						  (typeof options === 'undefined') 					? 'No options provided for Slave to run.'
						: (typeof options.id === 'undefined') 				? 'No Id provided for Slave to run as.'
						: (typeof options.file === 'undefined') 			? 'No File provided for Slave to run.'
						: (typeof options.port === 'undefined')				? 'No IP address provided for Slave to find Master process on.'
						: (!path.existsSync(file)) 	? 'File <' + __dirname +"\\"+ options.file + '> doesn\'t exist'
						: false
						);
				})(options);

				console.log(prefix + "Dir: %s", file)
				if (validate) {
					console.log(errPrefix + validate);
					process.exit()
				}

				console.log(prefix + "Starting Slave process <%s>", options.id)

				var url = "http://127.0.0.1:" + options.port + "/addSlave";
				console.log(prefix + "Connecting to Master process at port <%s>", options.port)

				request.post({
					uri: url,
					body: "id=" + options.id + "&file=" + file + "&secret=" + options.secret
				}, function(err, data){console.log(prefix + "Err: ",err," Response: ", data.statusCode)})
			}
		}

		typeHandlers[type](options.parent);

	})

ts.command('stop [type]')
	.description('Stop a specified <TYPE> of process. ie: "Master" or "Slave".')
	.option('-i, --id <ID>', 'ID of process to Stop')
	.action(function (type, options) {
		
		type = type || 'master'; // default = 'master'
		console.log(prefix + 'Running action <stop> on <%s> process <%s>', type, options.parent.id);

		var typeHandlers = {
			"master": function (options) {
				console.log(prefix + "Stoping Master process with options: ", options.id);
			},
			"slave": function (options) {
				console.log(prefix + "Stoping Slave process with options: ", options.id)
			}
		}

		typeHandlers[type](options.parent);

	})

ts.command('list')
	.description('List all Taskmaster slave process on given Master')
	.option('-p, --port', "Set the <port> of Master process to list slaves of.")
	.option('-a, --address', 'Set the <address> of Master process to list laves of.')
	.action(function (options) {

		var port = options.parent.port || 1337;
		var address = options.parent.address || '127.0.0.1';

		console.log(prefix + 'Listing all Taskmaster <slave> processes of <http://%s:%s>', address, port);

		request("http://"+address+":"+port+"/getSlaves", function(err, data) {
			if (typeof data !== 'undefined') {
				console.log(prefix)
				var response = JSON.parse(data.body);
				_.each(_.keys(response), function(key){
					console.log(prefix + "'%s': %s", key, path.relative(__dirname, response[key]));
				});
			} else {
				console.log(errPrefix + "No data was returned from master. err: ", err);
			}
		})

	})


var taskmanager = {
	slaveList: {},
	slaves: {},
	processConfigFile: function (file, options) {
		console.log(prefix + "Processing config file & options...");
		// console.log(prefix + file, options)/

		var fileContents = JSON.parse(fs.readFileSync(file, 'utf8'));
		// console.log(prefix + "mixing in options: ", _.pick(options, 'id', 'port', 'address', 'secret'))
		// console.log(prefix + "options from file: ", fileContents)
		var newOptions = _.defaults(_.pick(options, 'id', 'port', 'address', 'secret'), fileContents);
		fs.writeFileSync(file, JSON.stringify(newOptions), 'utf8');

		return newOptions;
	},
	addSlave: function(id, file) {
		console.log(prefix + 'Attaching Slave process <%s>', id);
		taskmanager.slaveList[id] = file;
		taskmanager.slaves[id] = require(file);
		// taskmanager.slaves[id].emit('start', 1, 2)
	},
	getSlaves: function() {

	},
	resp: function(req, res) {
		session(req, res, function (req, res) {

			var r,
			q = url.parse(req.url, true).query,
			slaves = _.keys(taskmanager.slaves);

			// console.log(prefix + "Query: ", q);
			// console.log(prefix + "Slaves: ", slaves);

			// if no id then check session and use that
			if (typeof q.i === 'undefined' && typeof req.session.data.testId !== 'undefined') {
				q.i = req.session.data.testId;
				console.log(prefix + "No ID; Using testId from session.");
			}

			if (typeof q.i !== 'undefined') {
				if (typeof taskmanager.slaves[q.i] !== 'undefined') {
					req.session.data.testId = q.i;
					taskmanager.slaves[q.i].emit('start', req, res)
				} else {
					console.log(errPrefix + 'No such Slave Id <%s>', q.i);
					res.end();
				}

			} else if (/getSlaves/.test(req.url)) {
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.end(JSON.stringify(taskmanager.slaveList));
			} else if (/addSlave/.test(req.url)) {
				console.log(prefix + "Slave tried to attach to Master.");
				
				var body = '';
				req.on('data', function (data) {
		            body += data;
		        });
		        req.on('end', function () {
		            var POST = qs.parse(body);
					// console.log(prefix + "POST Data: ", POST);

					if (POST.secret === ts.secret && typeof POST.id !== 'undefined') {
						console.log(prefix + "Slave authentication successfull.")

						if (path.existsSync(POST.file)) {
							console.log(prefix + 'Slave file successfully found by Master.')

							taskmanager.addSlave(POST.id, POST.file);
							res.writeHead(200, {'Content-Type': 'text/html'});
							res.end("OK");
						} else {
							console.log(prefix + 'Slave file not found by Master <%s>', POST.file)
							res.writeHead(404, {'Content-Type': 'text/html'});
							res.end("Slave file not found by Master.");
						}
					} else {
						console.log(prefix + "Slave authentication failed.")
			        	res.writeHead(401, {'Content-Type': 'text/html'});
						res.end("Secret doesnt match Master.");
					}


		        });
				
			} else if (typeof q.secret !== 'undefined' && q.secret === ts.secret) {
				console.log(prefix + "Admin authentication " + 'successful'.yellow);
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end("<html><head><title>Node Taskmaster Admin</title></head><body><h1>Node Taskmaster Admin</h1><p>Authentication successful</p></body></html>");
			} else if (slaves.length < 1) {
				console.log(prefix + "No slaves running to serve request. <%s> [%s]", req.headers.host, req.url)
				res.writeHead(200, {'Content-Type': 'text/plain'});
				res.end('No Slaves running...');
			} else if (slaves.length > 0) {
				console.log(prefix + "Unknown request. Redirecting to Random Slave.");
				var shuff = _.shuffle(slaves);
				taskmanager.slaves[shuff[0]].emit('start', req, res)
			}
		})
	}
}


ts.parse(process.argv);