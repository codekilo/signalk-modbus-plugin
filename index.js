const PLUGIN_ID = 'signalk-modbus-plugin';
const PLUGIN_NAME = 'SignalK Modbus plugin';
module.exports = function(app) {
  var plugin = {};
  var ModbusRTU = require("modbus-serial");
  var client = new ModbusRTU();
  const jexl = require("jexl");
  var timers = [];

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = 'Plugin to import data via modbus';

  /**
   * Send a single update to SignalK.
   */
  function handleData(data, mapping, slaveID, expression) {
    app.debug(data);
    context = {
      x: data.data[0]
    };
    value = expression.evalSync(context);
    delta = {
      values: [{
        path: mapping.path,
        value: value
      }],
      context: app.getSelfPath('uuid'),
      $source: "modbus-tcp." + slaveID + "." + mapping.register + "." + mapping.operation,
      timestamp: new Date().toISOString()
    };

    deltas = {
      updates: [delta]
    };
    app.handleMessage(PLUGIN_ID, deltas);
  }

  /**
   * Logs the error and stops the plugin
   */
  function catchError(error) {
    app.setProviderError("an error occured: " + error.message);
    app.debug(error);
    plugin.stop();
  }

  /**
   * Ask the server for the contents of a single register.
   * calls handleData to send the data to SignalK
   */
  function pollModbus(client, mapping, slaveID, expression) {
    client.setID(slaveID);
    var promise;
    switch (String(mapping.operation)) {
      case 'fc1':
        promise = client.readCoils(mapping.register, 1);
        break;
      case 'fc2':
        promise = client.readDiscreteInputs(mapping.register, 1);
        break;
      case 'fc3':
        promise = client.readHoldingRegisters(mapping.register, 1);
        break;
      case 'fc4':
        promise = client.readInputRegisters(mapping.register, 1);
    }
    promise.then(data => handleData(data, mapping, slaveID, expression))
      .catch(catchError);
  }

  // called when the plugin is started
  plugin.start = function(options, restartPlugin) {
    app.setProviderStatus("Initializing");
    plugin.options = options;
    app.debug('Plugin started');
    // connect to modbus server stop plugin if connection couldn't be established.
    client.connectTCP(options.connection.ip, {
      port: options.connection.port
    }).catch(function(error) {
      app.setProviderError("an error occured while connecting to the modbus server: " + error.message);
      plugin.stop();
    });

    // setup a timer to poll modbus server for each mapping
    options.slaves.forEach(
      slave => slave.mappings.forEach(
        mapping => timers.push(
          setInterval(pollModbus, options.pollingInterval * 1000,
            client, mapping, slave.slaveID, jexl.compile(mapping.conversion))
        )
      )
    );
    app.setProviderStatus("Running");

  };

  // called when the plugin is stopped or encounters an error
  plugin.stop = function() {
    app.debug('Plugin stopped');
    timers.forEach(timer => clearInterval(timer));
    app.setProviderStatus('Stopped');
  };

  // The plugin configuration
  plugin.schema = {
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
                  },
                  conversion: {
                    type: 'string',
                    title: 'conversion expression',
                    default: "x"
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
