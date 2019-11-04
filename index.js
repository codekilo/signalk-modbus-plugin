const PLUGIN_ID = 'signalk-modbus-plugin';
const PLUGIN_NAME = 'SignalK Modbus plugin';
module.exports = function(app) {
  var plugin = {};
  const ModbusRTU = require("modbus-serial");
  var clients = [];
  var promises = [];
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
    var i;
    switch (String(mapping.dataType)) {
      case 'uint16':
      case 'int16':
        i = data.data[0];
        break;
      case 'uint32':
      case 'int32':
      case 'float':
        i = (data.data[0] << 16) | data.data[1];
        break;
    }
    // context for jexl, x is the data, other constants can be added here
    var context = {
      x: i
    };
    var value = expression.evalSync(context);
    // denormalized SignalK delta for a single value
    var delta = {
      values: [{
        path: mapping.path,
        value: value
      }],
      context: app.getSelfPath('uuid'),
      $source: "modbus-tcp." + slaveID + "." + mapping.register + "." + mapping.operation,
      timestamp: new Date().toISOString()
    };

    var deltas = {
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
    var length;
    switch (String(mapping.dataType)) {
      case 'uint16':
      case 'int16':
        length = 1;
        break;
      case 'uint32':
      case 'int32':
      case 'float':
        length = 2;
        break;
    }
    switch (String(mapping.operation)) {
      case 'fc1':
        promise = client.readCoils(mapping.register, length);
        break;
      case 'fc2':
        promise = client.readDiscreteInputs(mapping.register, length);
        break;
      case 'fc3':
        promise = client.readHoldingRegisters(mapping.register, length);
        break;
      case 'fc4':
        promise = client.readInputRegisters(mapping.register, length);
    }
    promise.then(data => handleData(data, mapping, slaveID, expression))
      .catch(catchError);
  }

  /**
   * Setup the connection to a server 
   * and add create all timers to poll the registers
   */
  function setupConnection(connection) {
    // connect to modbus server.
    var client = new ModbusRTU();
    app.debug("setting up connection to " + connection.connection.ip + ":" + connection.connection.port);
    var promise = client.connectTCP(connection.connection.ip, {
      port: connection.connection.port
    }).then(function() { // only runs if connectTCP was successful
      // setup a timer to poll modbus server for each mapping
      app.debug("setting up timers");
      connection.slaves.forEach(
        slave => slave.mappings.forEach(
          mapping => timers.push(
            setInterval(pollModbus, connection.pollingInterval * 1000,
              client, mapping, slave.slaveID, jexl.compile(mapping.conversion))
          )
        )
      );
      clients.push(client);
    }, function(error) { //handle errors in the connectTCP method
      var message = "an error occured while connecting to the modbus server: " +
        error.message;
      app.debug(message);
      app.setProviderError(message);
      client.close();
    });
    promises.push(promise);
  }

  // called when the plugin is started
  plugin.start = function(options, restartPlugin) {
    app.setProviderStatus("Initializing");
    plugin.options = options;
    app.debug('Plugin started');
    options.connections.forEach(setupConnection);
    // wait for all promises setup in the loop to resolve
    Promise.allSettled(promises).then(function() {
      app.debug('promises resolved');
      if (clients.length == 0) {
        plugin.stop();
      } else {
        app.setProviderStatus("Running");
      }
    });


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
      connections: {
        type: 'array',
        title: 'Servers:',
        items: {
          type: 'object',
          title: 'connection',
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
                title: 'Slave',
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
                        dataType: {
                          type: 'string',
                          title: 'DataType',
                          enum: ['uint16', 'int16', 'uint32', 'int32', 'float'],
                          enumNames: [
                            'Unsigned 16 bit integer',
                            '16 bit integer',
                            'Unisgned 32 bit integer',
                            '32 bit integer',
                            'IEEE 754 single precision'
                          ],
                          default: 'int16'
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
        }
      }
    }
  };

  // set the order for fields and make the arrays unorderable
  plugin.uiSchema = {
    connections: {
      "ui:options": {
        orderable: false
      },
      items: {
        "ui:order": ["connection", "pollingInterval", "slaves"],
        slaves: {
          "ui:options": {
            orderable: false
          },
          items: {
            "ui:order": ["slaveID", "mappings"],
            mappings: {
              "ui:options": {
                orderable: false
              },
              items: {
                "ui:order": ["operation", "register", "dataType", "path", "conversion"]
              }
            }
          }
        }
      }
    }
  };

  return plugin;
};
