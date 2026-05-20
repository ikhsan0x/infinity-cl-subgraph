import { BigDecimal, BigInt, ethereum } from '@graphprotocol/graph-ts'

import { Transaction } from '../types/schema'
import { NEG_ONE_BD, ONE_BD, ZERO_BD, ZERO_BI } from './constants'

const NULL_ETH_HEX_STRING = '0x0000000000000000000000000000000000000000000000000000000000000001'

// Precomputed 10^n for the common token-decimal range. Built once at module
// load so hot paths (pricing, convertTokenToDecimal) reuse cached instances
// instead of rebuilding a string and re-parsing it on every call.
function buildPow10Table(): BigDecimal[] {
  const table = new Array<BigDecimal>(49)
  let s = '1'
  for (let i = 0; i < 49; i++) {
    table[i] = BigDecimal.fromString(s)
    s += '0'
  }
  return table
}
const POW10: BigDecimal[] = buildPow10Table()

/** 10 ^ decimals as a BigDecimal. */
export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  const n = decimals.toI32()
  if (n >= 0 && n < POW10.length) {
    return POW10[n]
  }
  let result = '1'
  for (let i = 0; i < n; i++) {
    result += '0'
  }
  return BigDecimal.fromString(result)
}

/** Division that returns 0 instead of trapping when the denominator is 0. */
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  return amount1.equals(ZERO_BD) ? ZERO_BD : amount0.div(amount1)
}

/** Absolute value of a BigDecimal. */
export function absBD(value: BigDecimal): BigDecimal {
  return value.lt(ZERO_BD) ? value.times(NEG_ONE_BD) : value
}

/** Parse an (optionally 0x-prefixed) hex string into a BigInt. */
export function hexToBigInt(hex: string): BigInt {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2)
  }
  // BigInt.zero() (not the ZERO_BI constant) so this stays safe to call while
  // constants.ts is still initializing — it derives MaxUint256 via hexToBigInt.
  let result = BigInt.zero()
  const sixteen = BigInt.fromI32(16)
  for (let i = 0; i < hex.length; i++) {
    result = result.times(sixteen).plus(BigInt.fromI32(parseInt(hex.charAt(i), 16) as i32))
  }
  return result
}

/**
 * Exponentiation by squaring — minimizes the number of BigDecimal multiplications.
 * @see https://en.wikipedia.org/wiki/Exponentiation_by_squaring
 */
export function fastExponentiation(value: BigDecimal, power: i32): BigDecimal {
  if (power < 0) {
    return safeDiv(ONE_BD, fastExponentiation(value, -power))
  }
  if (power == 0) {
    return ONE_BD
  }
  if (power == 1) {
    return value
  }
  const half = fastExponentiation(value, power / 2)
  let result = half.times(half)
  if (power % 2 == 1) {
    result = result.times(value)
  }
  return result
}

export function isNullEthValue(value: string): boolean {
  return value == NULL_ETH_HEX_STRING
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals.equals(ZERO_BI)) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

/** Load or create the Transaction for the given event. Transaction is immutable —
 *  all fields are constant per tx hash, so we only write+save on first sight. */
export function loadTransaction(event: ethereum.Event): Transaction {
  const id = event.transaction.hash.toHexString()
  const existing = Transaction.load(id)
  if (existing !== null) {
    return existing
  }
  const transaction = new Transaction(id)
  transaction.blockNumber = event.block.number
  transaction.timestamp = event.block.timestamp
  transaction.gasUsed = BigInt.zero() // TODO: needs to be moved to transaction receipt
  transaction.gasPrice = event.transaction.gasPrice
  transaction.save()
  return transaction
}
