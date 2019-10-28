# SignalK-modbus-plugin

This plugin is designed to read arbitrary modbus data and convert it into signalk data.

## Installation

To install the plugin into SignalK first clone the repository and link the npm module:

```
$ git clone
$ cd signalk-modbus-plugin
$ npm link
```

Then go to the SignalK configuration directory (probably `~/.signalk`)  and link the module again:

```
$ cd .signalk 
$ npm link signalk-modbus-plugin
```

The plugin should now be installed and visible when the server has restarted.


## Use

Before the plugin can be used it has to be configured this can be done either by placing a configuration file in `.signalk/plugin-config-data/signalk-modbus-plugin.json`, or by using the plugin config menu on the web interface of the signalk server.

### Options
These are all the options that can be configured in the web interface.

#### Polling Interval
The rate at which to poll the modbus server for new data. All registers are polled at this rate.

#### Connection Information
Enter the IP address and port used to connect to the modbus server here.

#### Register mapping
For each register that is being mapped to a signalk path a mapping needs to be created, this mapping contains the following information: These mappings are located in an array.

**Operation type** which modbus function code to use to read the register.  
**Register** Which register to read  
**SignalK path** Where to place the data in the signalk tree   
**Conversion** How the data needs to be converted into the right unit.  

The conversion system uses [jexl](https://github.com/TomFrost/jexl) to define the expressions for conversion of data, the incoming data is always `x`
