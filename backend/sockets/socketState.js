// Shared module that holds the live socket.io instance so controllers
// can query room membership without importing socket.io directly.

let _io = null;

export function setIo(io) {
  _io = io;
}

export function getIo() {
  return _io;
}
