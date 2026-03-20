import BaseProvider from "./providers/BaseProvider.mjs"
import TransitousProvider from "./providers/TransitousProvider.mjs"
import HafasProvider from "./providers/HafasProvider.mjs"
import VendoProvider from "./providers/VendoProvider.mjs"

export async function createProvider(config) {
  switch (config.provider) {
    case "transitous":
      return new TransitousProvider(config)
    case "hafas":
      return new HafasProvider(config)
    case "vendo":
      return new VendoProvider(config)
    default:
      return new BaseProvider(config)
  }
}
