const PLUGIN_ID = 'signalk-modbus-plugin';
const PLUGIN_NAME = 'SignalK Modbus plugin';
module.exports = function (app) {
  var plugin = {};
  var ModbusRTU = require("modbus-serial");
  var client = new ModbusRTU();
  var timer;

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = 'Plugin to import data via modbus';

  function handleData(err,data) {
    app.debug(data);
    delta = {
      values: [{
      path: "modbus.test",
      value: data.data[0]
    }],
      context: app.getSelfPath('uuid'),
      $source:"modbus-tcp.0.11.fc3",
      timestamp: new Date().toISOString()
   };

   deltas = {
    updates: [delta]
    };
    app.handleMessage(PLUGIN_ID,deltas);
   }

  function pollModbus(client, mapping) {
      client.readHoldingRegisters(mapping.register, 1, handleData);
  }

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    plugin.options = options;
    app.debug('Plugin started');
    // connect to modbus server
    client.connectTCP(options.connection.ip, { port: options.connection.port });
    client.setID(options.slaveID);
    // setup timer to poll modbus server
    timer = setInterval(pollModbus, options.pollingInterval*1000, client, options.mapping);
  };

  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped');
    clearInterval(timer);
    //client.close();
  };

  plugin.schema = {
    // The plugin schema
    title: PLUGIN_NAME,
    type: 'object',
    properties: {
      pollingInterval: {
        type: 'number',
        title: "Interval (in seconds) to poll device",
        default: 20
      },
      connection: {
        type: 'object',
        title: "connection information",
        properties: {
          ip: {
            type: 'string',
            title: "ip address",
            default: "127.0.0.1"
          },
          port: {
            type: 'number',
            title: "port",
            default: 8502
          }
        }
      },
      slaveID: {
        type: 'number',
        title: "SlaveID",
        default: 0
      },
      mapping: {
        type: 'object',
        title: 'Map register to SignalK path',
        properties: {
          operation: {
            type: 'string',
            title: 'operation type',
            enum: ['fc3', 'fc4'],
            enumNames: [
              'read holding register (FC3)',
              'read input register (FC4)'
            ],
            default: 'fc3'
            },
            register: {
              type: 'number',
              title: 'register',
              default: 11
            },
            path: {
              type: 'string',
              title: "Path to store data"
            }
        }
      }
    }
  };

  return plugin;
};
