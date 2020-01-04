var LightSymphonyiPort = require('./lib/LightSymphonyiPort').LightSymphonyiPort;
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-light-symphony', 'Light Symphony', LightSymphonyAccessory);
};

function LightSymphonyAccessory(log, config) {
  this.log = log;

  this._serialNumber = config.serialNumber;

  this._lightSymphonyiPort = new LightSymphonyiPort(log, config.ipAddress);

  this._areas = {};
  this._areaServices = [];
  for (var areaConfig of config.areas) {
    if (areaConfig.number === 0 && areaConfig.dimmable)
      throw Error('Dimmable all lights area (number 0) not currently supported');

    // Create area with default states
    var area = {
      number: areaConfig.number,
      name: areaConfig.name,
      type: areaConfig.type,
      dimmable: areaConfig.dimmable,
      on: false,
      brightness: 0
    };

    // Store in areas object
    var areaKey = 'area_' + area.number.toString();
    this._areas[areaKey] = area;

    // Create HomeKit service for area
    var areaService;
    if (area.type === 'Switch')
      areaService = new Service.Switch(area.name, areaKey);
    else
      areaService = new Service.Lightbulb(area.name, areaKey);
    areaService
      .getCharacteristic(Characteristic.On)
      .on('get', this._getAreaOn.bind(this, area.number))
      .on('set', this._setAreaOn.bind(this, area.number));
    if (area.dimmable) {
      areaService
        .getCharacteristic(Characteristic.Brightness)
        .on('get', this._getAreaBrightness.bind(this, area.number))
        .on('set', this._setAreaBrightness.bind(this, area.number));
    }
    this._areaServices.push(areaService);
    area.service = areaService;
  }
}

LightSymphonyAccessory.prototype._getAreaOn = function (areaNumber, callback) {
  callback(null, this._areas['area_' + areaNumber.toString()].on);
};

LightSymphonyAccessory.prototype._setAreaOn = function (areaNumber, on, callback) {
  if (areaNumber === 0) {
    this._lightSymphonyiPort.setAll(on, function (error) {
      if (!error) {
        for (var areaKey in this._areas) {
          if (this._areas.hasOwnProperty(areaKey)) {
            this._areas[areaKey].on = on;
            this._areas[areaKey].service.updateCharacteristic(Characteristic.On, on);
          }
        }
      }
      callback(error);
    }.bind(this));
  } else {
    this._lightSymphonyiPort.setArea(areaNumber, on, function (error) {
      if (!error) {
        this._areas['area_' + areaNumber.toString()].on = on;
        if (this._areas.hasOwnProperty('area_0')) {
          var allOn = true;
          for (var areaKey in this._areas) {
            if (areaKey !== 'area_0' && this._areas.hasOwnProperty(areaKey))
              allOn = allOn && this._areas[areaKey].on;
          }
          this.log('Setting area 0 to ' + (allOn ? 'on' : 'off'));
          this._areas['area_0'].on = allOn;
          this._areas['area_0'].service.updateCharacteristic(Characteristic.On, allOn);
        }
      }
      callback(error);
    }.bind(this));
  }
};

LightSymphonyAccessory.prototype._getAreaBrightness = function (areaNumber, callback) {
  callback(null, this._areas['area_' + areaNumber.toString()].brightness);
};

LightSymphonyAccessory.prototype._setAreaBrightness = function (areaNumber, brightness, callback) {
  var intensity = Math.trunc(brightness / 10);
  this._lightSymphonyiPort.setIntensity(areaNumber, intensity, function (error) {
    if (!error)
      this._areas['area_' + areaNumber.toString()].brightness = brightness;
    callback(error);
  }.bind(this));
};

LightSymphonyAccessory.prototype.getServices = function () {
  var informationService = new Service.AccessoryInformation();
  informationService
    .setCharacteristic(Characteristic.Manufacturer, 'Light Symphony')
    .setCharacteristic(Characteristic.Model, 'Controller')
    .setCharacteristic(Characteristic.SerialNumber, this._serialNumber);
  
  return [informationService].concat(this._areaServices);
};