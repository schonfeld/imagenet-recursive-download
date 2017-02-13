if(process.env['BASE_DEST']) {
  logger.warn(`Hard-wiring BASE_DEST to: ${process.env['BASE_DEST']}`);
  Consts.BASE_DEST = process.env['BASE_DEST'];
}