import TransitousProvider from "./providers/TransitousProvider.mjs"
import HafasProvider from "./providers/HafasProvider.mjs"
import VendoProvider from "./providers/VendoProvider.mjs"
import PlkProvider from "./providers/PlkProvider.mjs"

export async function createProvider(config) {
  switch (config?.provider) {
    case "transitous":
      return new TransitousProvider(config)
    case "hafas":
      return new HafasProvider(config)
    case "vendo":
      return new VendoProvider(config)
    case "plk":
      return new PlkProvider(config)
    default:
      throw new Error(
        `Unknown provider: "${config?.provider}". Supported providers: transitous, hafas, vendo, plk.`,
      )
  }
}
