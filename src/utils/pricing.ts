import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { Bundle, Pool, Token } from '../types/schema'
import { ADDRESS_ZERO, ONE_BD, Q192_BD, TWO_BD, ZERO_BD, ZERO_BI } from './constants'
import { exponentToBigDecimal, safeDiv } from './index'
import { NativeTokenDetails } from './nativeTokenDetails'

/** Derive [token0Price, token1Price] from a pool's sqrtPriceX96. */
export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: BigInt,
  token0: Token,
  token1: Token,
  nativeTokenDetails: NativeTokenDetails,
): BigDecimal[] {
  const decimals0 = token0.id == ADDRESS_ZERO ? nativeTokenDetails.decimals : token0.decimals
  const decimals1 = token1.id == ADDRESS_ZERO ? nativeTokenDetails.decimals : token1.decimals

  const num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  const price1 = num.div(Q192_BD).times(exponentToBigDecimal(decimals0)).div(exponentToBigDecimal(decimals1))
  const price0 = safeDiv(ONE_BD, price1)
  return [price0, price1]
}

/** Native-token price in USD, read from the configured stablecoin/native pool. */
export function getNativePriceInUSD(stablecoinWrappedNativePoolId: string, stablecoinIsToken0: boolean): BigDecimal {
  const pool = Pool.load(stablecoinWrappedNativePoolId)
  if (pool === null) {
    return ZERO_BD
  }
  return stablecoinIsToken0 ? pool.token0Price : pool.token1Price
}

/**
 * Derive the native-token price of a token by scanning its whitelist pools and
 * picking the price from the pool with the deepest native liquidity.
 */
export function findNativePerToken(
  token: Token,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
  minimumNativeLocked: BigDecimal,
): BigDecimal {
  if (token.id == wrappedNativeAddress || token.id == ADDRESS_ZERO) {
    return ONE_BD
  }

  // stablecoins: price directly off the native/USD rate to avoid unreliable pool rates
  if (stablecoinAddresses.includes(token.id)) {
    return safeDiv(ONE_BD, Bundle.load('1')!.ethPriceUSD)
  }

  const whitelist = token.whitelistPools
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD

  for (let i = 0; i < whitelist.length; i++) {
    const pool = Pool.load(whitelist[i])
    if (pool === null || pool.liquidity.le(ZERO_BI)) {
      continue
    }

    // identify the "other" token and its native-denominated locked value
    let otherId = ''
    let poolPrice = ZERO_BD
    let lockedToken = ZERO_BD
    if (pool.token0 == token.id) {
      otherId = pool.token1
      poolPrice = pool.token1Price
      lockedToken = pool.totalValueLockedToken1
    } else if (pool.token1 == token.id) {
      otherId = pool.token0
      poolPrice = pool.token0Price
      lockedToken = pool.totalValueLockedToken0
    } else {
      continue
    }

    const other = Token.load(otherId)
    if (other === null) {
      continue
    }
    const ethLocked = lockedToken.times(other.derivedETH)
    if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(minimumNativeLocked)) {
      largestLiquidityETH = ethLocked
      priceSoFar = poolPrice.times(other.derivedETH)
    }
  }

  return priceSoFar
}

/**
 * Tracked USD volume based on the token whitelist:
 * - both whitelisted  -> sum of both legs
 * - one whitelisted   -> 2x the whitelisted leg
 * - neither           -> 0
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  whitelistTokens: string[],
): BigDecimal {
  const bundle = Bundle.load('1')!
  const price0USD = token0.derivedETH.times(bundle.ethPriceUSD)
  const price1USD = token1.derivedETH.times(bundle.ethPriceUSD)
  const token0Whitelisted = whitelistTokens.includes(token0.id)
  const token1Whitelisted = whitelistTokens.includes(token1.id)

  if (token0Whitelisted && token1Whitelisted) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }
  if (token0Whitelisted) {
    return tokenAmount0.times(price0USD).times(TWO_BD)
  }
  if (token1Whitelisted) {
    return tokenAmount1.times(price1USD).times(TWO_BD)
  }
  return ZERO_BD
}

/** USD value of a token0/token1 amount pair. */
export function calculateAmountUSD(
  amount0: BigDecimal,
  amount1: BigDecimal,
  token0DerivedETH: BigDecimal,
  token1DerivedETH: BigDecimal,
  ethPriceUSD: BigDecimal,
): BigDecimal {
  return amount0.times(token0DerivedETH.times(ethPriceUSD)).plus(amount1.times(token1DerivedETH.times(ethPriceUSD)))
}
