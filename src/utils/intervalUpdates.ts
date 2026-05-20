import { ethereum } from '@graphprotocol/graph-ts'

import {
  Bundle,
  Pool,
  PoolDayData,
  PoolHourData,
  PoolManager,
  Token,
  TokenDayData,
  TokenHourData,
  UniswapDayData,
} from '../types/schema'
import { ONE_BI, ZERO_BD, ZERO_BI } from './constants'

const DAY = 86400
const HOUR = 3600

/** Global aggregate data over daily windows. */
export function updateUniswapDayData(event: ethereum.Event, poolManagerId: string): UniswapDayData {
  const poolManager = PoolManager.load(poolManagerId)!
  const dayID = event.block.timestamp.toI32() / DAY

  let dayData = UniswapDayData.load(dayID.toString())
  if (dayData === null) {
    dayData = new UniswapDayData(dayID.toString())
    dayData.date = dayID * DAY
    dayData.volumeETH = ZERO_BD
    dayData.volumeUSD = ZERO_BD
    dayData.volumeUSDUntracked = ZERO_BD
    dayData.feesUSD = ZERO_BD
  }
  dayData.tvlUSD = poolManager.totalValueLockedUSD
  dayData.txCount = poolManager.txCount
  dayData.save()
  return dayData
}

export function updatePoolDayData(poolId: string, event: ethereum.Event): PoolDayData {
  const pool = Pool.load(poolId)!
  const dayID = event.block.timestamp.toI32() / DAY
  const id = poolId + '-' + dayID.toString()

  let data = PoolDayData.load(id)
  if (data === null) {
    data = new PoolDayData(id)
    data.date = dayID * DAY
    data.pool = pool.id
    data.volumeToken0 = ZERO_BD
    data.volumeToken1 = ZERO_BD
    data.volumeUSD = ZERO_BD
    data.feesUSD = ZERO_BD
    data.txCount = ZERO_BI
    data.open = pool.token0Price
    data.high = pool.token0Price
    data.low = pool.token0Price
    data.close = pool.token0Price
  }

  if (pool.token0Price.gt(data.high)) {
    data.high = pool.token0Price
  }
  if (pool.token0Price.lt(data.low)) {
    data.low = pool.token0Price
  }
  data.close = pool.token0Price
  data.liquidity = pool.liquidity
  data.sqrtPrice = pool.sqrtPrice
  data.token0Price = pool.token0Price
  data.token1Price = pool.token1Price
  data.tick = pool.tick
  data.tvlUSD = pool.totalValueLockedUSD
  data.txCount = data.txCount.plus(ONE_BI)
  data.save()
  return data
}

export function updatePoolHourData(poolId: string, event: ethereum.Event): PoolHourData {
  const pool = Pool.load(poolId)!
  const hourID = event.block.timestamp.toI32() / HOUR
  const id = poolId + '-' + hourID.toString()

  let data = PoolHourData.load(id)
  if (data === null) {
    data = new PoolHourData(id)
    data.periodStartUnix = hourID * HOUR
    data.pool = pool.id
    data.volumeToken0 = ZERO_BD
    data.volumeToken1 = ZERO_BD
    data.volumeUSD = ZERO_BD
    data.feesUSD = ZERO_BD
    data.txCount = ZERO_BI
    data.open = pool.token0Price
    data.high = pool.token0Price
    data.low = pool.token0Price
    data.close = pool.token0Price
  }

  if (pool.token0Price.gt(data.high)) {
    data.high = pool.token0Price
  }
  if (pool.token0Price.lt(data.low)) {
    data.low = pool.token0Price
  }
  data.close = pool.token0Price
  data.liquidity = pool.liquidity
  data.sqrtPrice = pool.sqrtPrice
  data.token0Price = pool.token0Price
  data.token1Price = pool.token1Price
  data.tick = pool.tick
  data.tvlUSD = pool.totalValueLockedUSD
  data.txCount = data.txCount.plus(ONE_BI)
  data.save()
  return data
}

export function updateTokenDayData(token: Token, event: ethereum.Event): TokenDayData {
  const bundle = Bundle.load('1')!
  const dayID = event.block.timestamp.toI32() / DAY
  const id = token.id + '-' + dayID.toString()
  const priceUSD = token.derivedETH.times(bundle.ethPriceUSD)

  let data = TokenDayData.load(id)
  if (data === null) {
    data = new TokenDayData(id)
    data.date = dayID * DAY
    data.token = token.id
    data.volume = ZERO_BD
    data.volumeUSD = ZERO_BD
    data.feesUSD = ZERO_BD
    data.untrackedVolumeUSD = ZERO_BD
    data.open = priceUSD
    data.high = priceUSD
    data.low = priceUSD
    data.close = priceUSD
  }

  if (priceUSD.gt(data.high)) {
    data.high = priceUSD
  }
  if (priceUSD.lt(data.low)) {
    data.low = priceUSD
  }
  data.close = priceUSD
  data.priceUSD = priceUSD
  data.totalValueLocked = token.totalValueLocked
  data.totalValueLockedUSD = token.totalValueLockedUSD
  data.save()
  return data
}

export function updateTokenHourData(token: Token, event: ethereum.Event): TokenHourData {
  const bundle = Bundle.load('1')!
  const hourID = event.block.timestamp.toI32() / HOUR
  const id = token.id + '-' + hourID.toString()
  const priceUSD = token.derivedETH.times(bundle.ethPriceUSD)

  let data = TokenHourData.load(id)
  if (data === null) {
    data = new TokenHourData(id)
    data.periodStartUnix = hourID * HOUR
    data.token = token.id
    data.volume = ZERO_BD
    data.volumeUSD = ZERO_BD
    data.feesUSD = ZERO_BD
    data.untrackedVolumeUSD = ZERO_BD
    data.open = priceUSD
    data.high = priceUSD
    data.low = priceUSD
    data.close = priceUSD
  }

  if (priceUSD.gt(data.high)) {
    data.high = priceUSD
  }
  if (priceUSD.lt(data.low)) {
    data.low = priceUSD
  }
  data.close = priceUSD
  data.priceUSD = priceUSD
  data.totalValueLocked = token.totalValueLocked
  data.totalValueLockedUSD = token.totalValueLockedUSD
  data.save()
  return data
}
