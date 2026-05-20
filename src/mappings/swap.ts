import { BigInt } from '@graphprotocol/graph-ts'

import { Swap as SwapEvent } from '../types/PoolManager/PoolManager'
import { Bundle, Pool, PoolManager, Swap, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { NEG_ONE_BD, ONE_BI, ONE_MILLION_BD, TWO_BD } from '../utils/constants'
import { absBD, convertTokenToDecimal, loadTransaction, safeDiv } from '../utils/index'
import {
  updatePoolDayData,
  updatePoolHourData,
  updateTokenDayData,
  updateTokenHourData,
  updateUniswapDayData,
} from '../utils/intervalUpdates'
import { findNativePerToken, getNativePriceInUSD, getTrackedAmountUSD, sqrtPriceX96ToTokenPrices } from '../utils/pricing'

export function handleSwap(event: SwapEvent): void {
  handleSwapHelper(event)
}

export function handleSwapHelper(event: SwapEvent, subgraphConfig: SubgraphConfig = getSubgraphConfig()): void {
  const poolManagerAddress = subgraphConfig.poolManagerAddress
  const poolId = event.params.id.toHexString()

  const pool = Pool.load(poolId)!
  const token0 = Token.load(pool.token0)
  if (token0 === null) {
    return
  }
  const token1 = Token.load(pool.token1)
  if (token1 === null) {
    return
  }

  const bundle = Bundle.load('1')!
  const poolManager = PoolManager.load(poolManagerAddress)!

  // amount0/1 are token deltas. Unlike v3 a negative amount is sent *to* the pool,
  // so invert the sign to keep the usual "received by trader" convention.
  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals).times(NEG_ONE_BD)
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals).times(NEG_ONE_BD)
  const amount0Abs = absBD(amount0)
  const amount1Abs = absBD(amount1)

  const amount0USD = amount0Abs.times(token0.derivedETH).times(bundle.ethPriceUSD)
  const amount1USD = amount1Abs.times(token1.derivedETH).times(bundle.ethPriceUSD)

  // divide by 2 because both the input and output legs are counted above
  const amountTotalUSDTracked = getTrackedAmountUSD(
    amount0Abs,
    token0,
    amount1Abs,
    token1,
    subgraphConfig.whitelistTokens,
  ).div(TWO_BD)
  const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD)
  const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(TWO_BD)

  const feeFraction = pool.feeTier.toBigDecimal().div(ONE_MILLION_BD)
  const feesETH = amountTotalETHTracked.times(feeFraction)
  const feesUSD = amountTotalUSDTracked.times(feeFraction)

  // pool manager (global) updates
  poolManager.txCount = poolManager.txCount.plus(ONE_BI)
  poolManager.totalVolumeETH = poolManager.totalVolumeETH.plus(amountTotalETHTracked)
  poolManager.totalVolumeUSD = poolManager.totalVolumeUSD.plus(amountTotalUSDTracked)
  poolManager.untrackedVolumeUSD = poolManager.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
  poolManager.totalFeesETH = poolManager.totalFeesETH.plus(feesETH)
  poolManager.totalFeesUSD = poolManager.totalFeesUSD.plus(feesUSD)
  // drop this pool's stale TVL contribution; it is re-added once recomputed below
  poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.minus(pool.totalValueLockedETH)

  // pool updates
  pool.volumeToken0 = pool.volumeToken0.plus(amount0Abs)
  pool.volumeToken1 = pool.volumeToken1.plus(amount1Abs)
  pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked)
  pool.untrackedVolumeUSD = pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
  pool.feesUSD = pool.feesUSD.plus(feesUSD)
  pool.txCount = pool.txCount.plus(ONE_BI)
  pool.liquidity = event.params.liquidity
  pool.tick = BigInt.fromI32(event.params.tick)
  pool.sqrtPrice = event.params.sqrtPriceX96
  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)

  // token updates
  token0.volume = token0.volume.plus(amount0Abs)
  token0.totalValueLocked = token0.totalValueLocked.plus(amount0)
  token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked)
  token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
  token0.feesUSD = token0.feesUSD.plus(feesUSD)
  token0.txCount = token0.txCount.plus(ONE_BI)

  token1.volume = token1.volume.plus(amount1Abs)
  token1.totalValueLocked = token1.totalValueLocked.plus(amount1)
  token1.volumeUSD = token1.volumeUSD.plus(amountTotalUSDTracked)
  token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
  token1.feesUSD = token1.feesUSD.plus(feesUSD)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // refresh pool price ratios
  const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0, token1, subgraphConfig.nativeTokenDetails)
  pool.token0Price = prices[0]
  pool.token1Price = prices[1]
  pool.save()

  // refresh USD pricing now that the pool moved
  bundle.ethPriceUSD = getNativePriceInUSD(subgraphConfig.stablecoinWrappedNativePoolId, subgraphConfig.stablecoinIsToken0)
  bundle.save()
  token0.derivedETH = findNativePerToken(
    token0,
    subgraphConfig.wrappedNativeAddress,
    subgraphConfig.stablecoinAddresses,
    subgraphConfig.minimumNativeLocked,
  )
  token1.derivedETH = findNativePerToken(
    token1,
    subgraphConfig.wrappedNativeAddress,
    subgraphConfig.stablecoinAddresses,
    subgraphConfig.minimumNativeLocked,
  )

  // recompute TVL with the fresh rates
  pool.totalValueLockedETH = pool.totalValueLockedToken0
    .times(token0.derivedETH)
    .plus(pool.totalValueLockedToken1.times(token1.derivedETH))
  pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD)
  poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.plus(pool.totalValueLockedETH)
  poolManager.totalValueLockedUSD = poolManager.totalValueLockedETH.times(bundle.ethPriceUSD)
  token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH).times(bundle.ethPriceUSD)
  token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH).times(bundle.ethPriceUSD)

  // Swap entity
  const transaction = loadTransaction(event)
  const swap = new Swap(transaction.id + '-' + event.logIndex.toString())
  swap.transaction = transaction.id
  swap.timestamp = transaction.timestamp
  swap.pool = pool.id
  swap.token0 = pool.token0
  swap.token1 = pool.token1
  swap.sender = event.params.sender
  swap.origin = event.transaction.from
  swap.amount0 = amount0
  swap.amount1 = amount1
  swap.amountUSD = amountTotalUSDTracked
  swap.tick = BigInt.fromI32(event.params.tick)
  swap.sqrtPriceX96 = event.params.sqrtPriceX96
  swap.logIndex = event.logIndex

  // interval snapshots
  const uniswapDayData = updateUniswapDayData(event, poolManagerAddress)
  const poolDayData = updatePoolDayData(poolId, event)
  const poolHourData = updatePoolHourData(poolId, event)
  const token0DayData = updateTokenDayData(token0, event)
  const token1DayData = updateTokenDayData(token1, event)
  const token0HourData = updateTokenHourData(token0, event)
  const token1HourData = updateTokenHourData(token1, event)

  uniswapDayData.volumeETH = uniswapDayData.volumeETH.plus(amountTotalETHTracked)
  uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked)
  uniswapDayData.feesUSD = uniswapDayData.feesUSD.plus(feesUSD)

  poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked)
  poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(amount0Abs)
  poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(amount1Abs)
  poolDayData.feesUSD = poolDayData.feesUSD.plus(feesUSD)

  poolHourData.volumeUSD = poolHourData.volumeUSD.plus(amountTotalUSDTracked)
  poolHourData.volumeToken0 = poolHourData.volumeToken0.plus(amount0Abs)
  poolHourData.volumeToken1 = poolHourData.volumeToken1.plus(amount1Abs)
  poolHourData.feesUSD = poolHourData.feesUSD.plus(feesUSD)

  token0DayData.volume = token0DayData.volume.plus(amount0Abs)
  token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked)
  token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
  token0DayData.feesUSD = token0DayData.feesUSD.plus(feesUSD)

  token0HourData.volume = token0HourData.volume.plus(amount0Abs)
  token0HourData.volumeUSD = token0HourData.volumeUSD.plus(amountTotalUSDTracked)
  token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
  token0HourData.feesUSD = token0HourData.feesUSD.plus(feesUSD)

  token1DayData.volume = token1DayData.volume.plus(amount1Abs)
  token1DayData.volumeUSD = token1DayData.volumeUSD.plus(amountTotalUSDTracked)
  token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
  token1DayData.feesUSD = token1DayData.feesUSD.plus(feesUSD)

  token1HourData.volume = token1HourData.volume.plus(amount1Abs)
  token1HourData.volumeUSD = token1HourData.volumeUSD.plus(amountTotalUSDTracked)
  token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
  token1HourData.feesUSD = token1HourData.feesUSD.plus(feesUSD)

  swap.save()
  uniswapDayData.save()
  poolDayData.save()
  poolHourData.save()
  token0DayData.save()
  token1DayData.save()
  token0HourData.save()
  token1HourData.save()
  poolManager.save()
  pool.save()
  token0.save()
  token1.save()
}
