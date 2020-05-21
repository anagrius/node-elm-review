const path = require('path');

try {
  // Conditional imports, because `worker_threads` is not supported by default
  // on Node v10
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  const {Worker} = require('worker_threads');

  module.exports = {
    init: (options, elmModulePath, flags) =>
      init(Worker, options, elmModulePath, flags),
    stop: () => {
      if (worker) {
        worker.terminate();
        worker = null;
        listeners = Object.create(null);
      }
    }
  };
} catch {
  module.exports = {
    init: (options, elmModulePath, flags) =>
      initWithoutWorker(elmModulePath, flags),
    stop: () => {}
  };
}

function init(Worker, options, elmModulePath, flags) {
  if (options.watch) {
    return initWithWorker(Worker, elmModulePath, flags);
  }

  return initWithoutWorker(elmModulePath, flags);
}

// WITH WORKER

const pathToWorker = path.resolve(__dirname, 'elm-app-worker.js');
let worker = null;
let listeners = Object.create(null);

const elmPortsInterfaceProxy = {
  get(_, port) {
    return {
      send: send(port),
      subscribe: subscribe(port),
      unsubscribe: unsubscribe(port)
    };
  }
};

function initWithWorker(Worker, elmModulePath, flags) {
  worker = new Worker(pathToWorker, {
    workerData: {
      elmModulePath,
      flags
    }
  });

  worker.on('message', ([port, data]) => {
    if (listeners[port]) {
      listeners[port].forEach(fn => fn(data));
    }
  });

  return {
    ports: new Proxy(worker, elmPortsInterfaceProxy)
  };
}

function send(port) {
  return data => {
    if (worker) {
      worker.postMessage([port, data]);
    }
  };
}

function subscribe(port) {
  return callback => {
    listeners[port] = listeners[port] || [];
    listeners[port].push(callback);
  };
}

function unsubscribe(port) {
  return callback => {
    listeners[port] = (listeners[port] || []).filter(fn => fn === callback);
  };
}

// WITHOUT WORKER

function initWithoutWorker(elmModulePath, flags) {
  const elmModule = loadCompiledElmApp(elmModulePath);
  const app = elmModule.Elm.Elm.Review.Main.init({
    flags
  });
  return app;
}

function loadCompiledElmApp(elmModulePath) {
  const oldConsoleWarn = console.warn;
  const regex = /^Compiled in DE(BUG|V) mode/;
  // $FlowFixMe
  console.warn = function(...args) {
    if (args.length === 1 && regex.test(args[0])) return;
    return oldConsoleWarn.apply(console, args);
  };

  // $FlowFixMe
  return require(elmModulePath);
}