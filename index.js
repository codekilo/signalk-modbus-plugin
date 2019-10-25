const PLUGIN_ID = 'signalk-modbus-plugin';
const PLUGIN_NAME = 'SignalK Modbus plugin';
module.exports = function (app) {
  var plugin = {};
  var ModbusRTU = require("modbus-serial");
  var client = new ModbusRTU();
  var timers = [];

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = 'Plugin to import data via modbus';

  /**
   * Send a single update to SignalK.
   */
  function handleData(data,mapping,slaveID) {
    app.debug(data);
    delta = {
      values: [{
      path: mapping.path,
      value: data.data[0]
    }],
      context: app.getSelfPath('uuid'),
      $source:"modbus-tcp." + slaveID + "." + mapping.register + "." + mapping.operation,
      timestamp: new Date().toISOString()
   };

   deltas = {
    updates: [delta]
    };
    app.handleMessage(PLUGIN_ID,deltas);
   }

   /**
    * Ask the server for the contents of a single register.
    * calls handleData to send the data to SignalK
    */
  function pollModbus(client, mapping,slaveID) {
    client.setID(slaveID);
    switch (String(mapping.operation)) {
      case 'fc1': 
        client.readCoils(mapping.register, 1)
        .then(data => handleData(data,mapping,slaveID));
        break;
        case 'fc2':
        client.readDiscreteInputs(mapping.register, 1)
        .then(data => handleData(data,mapping,slaveID));
        break;
      case 'fc3':
        client.readHoldingRegisters(mapping.register, 1)
        .then(data => handleData(data,mapping,slaveID));
        break;
      case 'fc4':
      client.readInputRegisters(mapping.register, 1)
      .then(data => handleData(data,mapping,slaveID));
    }
  }

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    plugin.options = options;
    app.debug('Plugin started');
    // connect to modbus server
    client.connectTCP(options.connection.ip, { port: options.connection.port });
    // setup timer to poll modbus server
    options.slaves.forEach(slave => slave.mappings.forEach(mapping =>timers.push(setInterval(pollModbus, options.pollingInterval*1000, client, mapping, slave.slaveID))));

  };

  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped');
    timers.forEach(timer => clearInterval(timer));
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
      slaves: {
        type: 'array',
        title: "slaves",
        items: {
          type: 'object',
          title: 'test',
          properties: {
            slaveID: {
              type: 'number',
              title: "SlaveID",
              default: 0
            },
            mappings: {
              title: 'map registers to SignalK paths',
              type: 'array',
              items: {
                type: 'object',
                title: 'Map register to SignalK path',
                properties: {
                  operation: {
                    type: 'string',
                    title: 'operation type',
                    enum: ['fc1', 'fc2', 'fc3', 'fc4'],
                    enumNames: [
                      'read coil (FC1)',
                      'read discrete input (FC2)',
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
                      title: "Path to store data",
                      default: "modbus.test"
                    }
                }
              }
            }
          }
        }
      }
      
    }
  };

  return plugin;
};
