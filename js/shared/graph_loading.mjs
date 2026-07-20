import { app } from "/scripts/app.js";

// Shared "is a workflow currently loading?" guard.
let _loading = false;

if (app && app.loadGraphData && !app._dehypnoticGraphLoadWrapped) {
  app._dehypnoticGraphLoadWrapped = true;
  const _origLoadGraphData = app.loadGraphData.bind(app);
  app.loadGraphData = function (...args) {
    _loading = true;
    let r;
    try {
      r = _origLoadGraphData(...args);
    } finally {
      // loadGraphData may be sync or async; clear after it settles + a short
      // trailing window so the graph-level link restore is fully covered.
      Promise.resolve(r).finally(() => setTimeout(() => { _loading = false; }, 300));
    }
    return r;
  };
}

export function isGraphLoading() {
  return _loading;
}
