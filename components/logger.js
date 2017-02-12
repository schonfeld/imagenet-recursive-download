const logLevel  = (process.env["LOG_LEVEL"] || "debug").toLowerCase();
const winston   = require('winston');
global.logger   = new winston.Logger();

logger.add(winston.transports.Console, {
  'colorize': true,
  'timestamp': false,
  'level': logLevel
});

logger.add(winston.transports.File, {
  'filename': `logs/exec-${new Date().getTime()}.log`,
  'json': false
});