const dgram = require('dgram');
const async = require('async');

const COMMAND_PORT = 10001;
const DISCOVER_PORT = 30718;
const DISCOVER_TIMEOUT = 1000;
const MAX_NO_AREAS = 29;
const MAX_INTENSITY = 10;
const COMMAND_DELAY = 500;

module.exports = {
  LightSymphonyiPort: LightSymphonyiPort
};

function LightSymphonyiPort(log, ipAddress, broadcastAddress) {
  this.log = log;
  this._ipAddress = ipAddress ? ipAddress : null; // iPort IP address set by _discoveriPort()
  this._broadcastAddress = broadcastAddress ? broadcastAddress : '255.255.255.255';

  this._sendCommandQueue = async.queue(function (task, callback) {
    var sendCommand = function () {
      this.log('Sending: ' + task.command + ' to ' + this._ipAddress);
      var socket = dgram.createSocket({
        type: 'udp4',
        reuseAddr: true
      });
      socket.send(task.command + '\r\n', COMMAND_PORT, this._ipAddress, function (error) {
        socket.close();
        // Intentional delay before callback to avoid sending requests to iPort too frequently
        setTimeout(function() {
          callback(error);
        }, COMMAND_DELAY);
      });
    }.bind(this);
  
    if (this._ipAddress) {
      // iPort IP address available, send command
      sendCommand();
    } else {
      // iPort IP address unknown, attempt to discover it
      this._discoveriPort(function (error) {
        if (error) callback(error);
        else sendCommand();
      }.bind(this));
    }
  }.bind(this), 1);
}

LightSymphonyiPort.prototype._discoveriPort = function (callback) {
  var discovered = false;
  var discoverMessage = Buffer.from([0x0, 0x1, 0x0, 0xf5]);
  var validResponseMessage = Buffer.from('YES');
  var socket = dgram.createSocket({
    type: 'udp4',
    reuseAddr: true
  });

  socket.on('listening', function () {
    socket.setBroadcast(true);
  });

  // Set up message event to handle discovery of iPort IP address
  socket.on('message', function (response, remoteHost) {
    this.log('_discoveriPort message event, response = ' + response.toString() + ', address = ' + remoteHost.address);
    // Check for correct response and return address in callback
    if (response.equals(validResponseMessage)) {
      discovered = true;
      socket.close();
      this._ipAddress = remoteHost.address; // Set discovered iPort address
      callback(null);
    }
  }.bind(this));

  // Set up error function/event
  var errorCallback = function (error) {
    this.log('_discoveriPort errorCallback, discovered = ' + discovered.toString() + ', error = ' + error.toString());
    if (!discovered) {
      socket.close();
      callback(error);
    }
  }.bind(this);
  socket.on('error', errorCallback);

  // Send discovery broadcast
  socket.bind(DISCOVER_PORT);
  socket.send(discoverMessage, 0, discoverMessage.length, DISCOVER_PORT, this._broadcastAddress);

  // Call error function if no response after timeout
  setTimeout(function () { errorCallback(new Error('iPort discover timed out')); }, DISCOVER_TIMEOUT);
};

LightSymphonyiPort.prototype._sendCommand = function (command, callback) {
  this._sendCommandQueue.push({ command: command }, callback);
};

LightSymphonyiPort.prototype.setAll = function (on, callback) {
  this._sendCommand('all_' + (on ? 'on' : 'off'), callback);
};

LightSymphonyiPort.prototype.setArea = function (area, on, callback) {
  if (area < 1 || area > MAX_NO_AREAS)
    callback(new Error('Area number ' + area.toString() + ' is invalid, must be between 1 and ' + MAX_NO_AREAS.toString()));
  else
    this._sendCommand('area_' + (on ? 'on' : 'off') + ' ' + area.toString(), callback);
};

LightSymphonyiPort.prototype.setIntensity = function (area, intensity, callback) {
  if (area < 1 || area > MAX_NO_AREAS)
    callback(new Error('Area number ' + area.toString() + ' is invalid, must be between 1 and ' + MAX_NO_AREAS.toString()));
  else if (intensity < 1 || intensity > MAX_INTENSITY)
    callback(new Error('Intensity value ' + intensity.toString() + ' is invalid, must be between 1 and ' + MAX_INTENSITY.toString()));
  else
    this._sendCommand('inten_' + area.toString() + '_' + intensity.toString(), callback);
};