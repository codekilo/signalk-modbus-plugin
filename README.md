#SignalK-modbus-plugin

This plugin is designed to read arbitrary modbus data and convert it into signalk data.

## Installation

To install the plugin into SignalK first clone the repository and link the npm module:

```
$ git clone
$ cd signalk-modbus-plugin
$ npm link
```

Then go to the SignalK config directory (probably `~/.signalk`)  and link the module again:

```
$ cd .signalk 
$ npm link signalk-modbus-plugin
```

The plugin should now be installed and visible when the server has restarted.
