function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "")
}

function inferProductTokenFromName(nameToken) {
  const match = nameToken.match(/^[a-z]+/u)
  return match ? match[0] : ""
}

function isGenericProductToken(token) {
  return (
    token === "train"
    || token === "rail"
    || token === "bahn"
    || token === "zug"
  )
}

function canonicalizeProductToken(token) {
  if (token === "nationalexpress") {
    return "ice"
  }

  if (token === "national") {
    return "ic"
  }

  if (token === "regionalexpress" || token === "regional") {
    return "re"
  }

  if (token === "regionalbahn") {
    return "rb"
  }

  if (token.startsWith("bus")) {
    return "bus"
  }

  if (token.startsWith("strm")) {
    return "strm"
  }

  if (token.startsWith("str") || token.startsWith("tram")) {
    return "str"
  }

  if (token.startsWith("ice")) {
    return "ice"
  }

  if (token.startsWith("ic")) {
    return "ic"
  }

  if (token.startsWith("ec")) {
    return "ic"
  }

  if (token.startsWith("re")) {
    return "re"
  }

  if (token.startsWith("rb")) {
    return "rb"
  }

  return token
}

function resolveProductToken(line) {
  const fromProduct = canonicalizeProductToken(normalizeToken(line?.product))
  if (fromProduct && !isGenericProductToken(fromProduct)) {
    return fromProduct
  }

  const fromName = canonicalizeProductToken(
    inferProductTokenFromName(normalizeToken(line?.name)),
  )
  if (fromName) {
    return fromName
  }

  if (fromProduct) {
    return fromProduct
  }

  return canonicalizeProductToken(
    inferProductTokenFromName(normalizeToken(line?.id)),
  )
}

function resolveLineToken(line, productToken) {
  const nameToken = normalizeToken(line?.name)
  const idToken = normalizeToken(line?.id)

  // Convert variants like "bus s7" or "bus u2" to rail-like tokens so city presets match.
  if (nameToken.startsWith("bus")) {
    const afterBus = nameToken.slice(3)
    if (/^(s|u)\d+[a-z]*$/u.test(afterBus)) {
      return afterBus
    }
  }

  if (nameToken && /[a-z]/u.test(nameToken)) {
    return nameToken
  }

  if (productToken && nameToken) {
    return `${productToken}${nameToken}`
  }

  if (idToken && /[a-z]/u.test(idToken)) {
    return idToken
  }

  if (productToken && idToken) {
    return `${productToken}${idToken}`
  }

  return nameToken || idToken || "unknown"
}

export function getLineStyleTokens(line) {
  const productToken = resolveProductToken(line)
  const lineToken = resolveLineToken(line, productToken)

  return {
    product: String(line?.product || ""),
    lineId: String(line?.id || ""),
    productToken,
    lineToken,
  }
}
