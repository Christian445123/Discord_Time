let _lastSync = null;

function setLastSync(data) {
  _lastSync = { ...data, timestamp: new Date() };
}

function getLastSync() {
  return _lastSync;
}

module.exports = { setLastSync, getLastSync };
