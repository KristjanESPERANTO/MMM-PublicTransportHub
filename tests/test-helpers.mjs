import Module, { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export function loadModuleDefinition() {
  const previousModule = globalThis.Module
  const previousLog = globalThis.Log

  let definition

  globalThis.Module = {
    register(_name, moduleDefinition) {
      definition = moduleDefinition
    },
  }
  globalThis.Log = {
    info() {},
  }

  try {
    const modulePath = require.resolve("../MMM-PublicTransportHub.js")
    delete require.cache[modulePath]
    require(modulePath)
  }
  finally {
    globalThis.Module = previousModule
    globalThis.Log = previousLog
  }

  return definition
}

export function loadNodeHelperModuleForTests() {
  const modulePath = require.resolve("../node_helper.js")
  const originalLoad = Module._load

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "../../js/logger") {
      return {
        info() {},
        warn() {},
        error() {},
      }
    }

    if (request === "../../js/node_helper") {
      return {
        create(definition) {
          return definition
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[modulePath]
  let helperModule

  try {
    helperModule = require(modulePath)
  }
  finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }

  return helperModule
}
