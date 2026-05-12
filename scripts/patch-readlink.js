const fs = require('fs');
const origReadlinkSync = fs.readlinkSync;
const origReadlink = fs.readlink;
const origReadlinkPromise = fs.promises.readlink;

function convertEISDIR(e) {
  if (e && e.code === 'EISDIR') {
    const err = new Error(`EINVAL: invalid argument, readlink '${e.path || ''}'`);
    err.code = 'EINVAL';
    err.errno = -22;
    err.syscall = 'readlink';
    err.path = e.path;
    return err;
  }
  return e;
}

if (!fs._readlinkPatched) {
  fs.readlinkSync = function patchedReadlinkSync(...args) {
    try {
      return origReadlinkSync.apply(this, args);
    } catch (e) {
      throw convertEISDIR(e);
    }
  };

  fs.readlink = function patchedReadlink(...args) {
    const callback = args[args.length - 1];
    if (typeof callback !== 'function') {
      return fs.readlinkSync.apply(this, args);
    }
    const innerArgs = args.slice(0, -1);
    origReadlink.apply(this, [...innerArgs, (err, result) => {
      callback(err ? convertEISDIR(err) : null, result);
    }]);
  };

  fs.promises.readlink = async function patchedReadlinkPromise(...args) {
    try {
      return await origReadlinkPromise.apply(this, args);
    } catch (e) {
      throw convertEISDIR(e);
    }
  };

  fs._readlinkPatched = true;
}
