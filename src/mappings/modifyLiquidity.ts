import { BigInt, log } from '@graphprotocol/graph-ts'

import { ModifyLiquidity as ModifyLiquidityEvent } from '../types/PoolManager/PoolManager'
import { Bundle, ModifyLiquidity, Pool, PoolManager, Tick, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI } from '../utils/constants'
import { convertTokenToDecimal, loadTransaction } from '../utils/index'
import {
  updatePoolDayData,
  updatePoolHourData,
  updateTokenDayData,
  updateTokenHourData,
  updateUniswapDayData,
} from '../utils/intervalUpdates'
import { getAmount0, getAmount1 } from '../utils/liquidityMath/liquidityAmounts'
import { calculateAmountUSD } from '../utils/pricing'
import { createTick } from '../utils/tick'

export function handleModifyLiquidity(event: ModifyLiquidityEvent): void {
  handleModifyLiquidityHelper(event)
}

export function handleModifyLiquidityHelper(
  event: ModifyLiquidityEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const poolManagerAddress = subgraphConfig.poolManagerAddress
  const poolId = event.params.id.toHexString()

  const pool = Pool.load(poolId)
  if (pool === null) {
    log.debug('handleModifyLiquidity: pool not found {}', [poolId])
    return
  }
  const poolManager = PoolManager.load(poolManagerAddress)
  if (poolManager === null) {
    log.debug('handleModifyLiquidity: pool manager not found {}', [poolManagerAddress])
    return
  }
  const token0 = Token.load(pool.token0)
  if (token0 === null) {
    return
  }
  const token1 = Token.load(pool.token1)
  if (token1 === null) {
    return
  }

  const bundle = Bundle.load('1')!
  const tickLower = event.params.tickLower
  const tickUpper = event.params.tickUpper
  const liquidityDelta = event.params.liquidityDelta
  const currTick = pool.tick!.toI32()

  const amount0 = convertTokenToDecimal(
    getAmount0(tickLower, tickUpper, currTick, liquidityDelta, pool.sqrtPrice),
    token0.decimals,
  )
  const amount1 = convertTokenToDecimal(
    getAmount1(tickLower, tickUpper, currTick, liquidityDelta, pool.sqrtPrice),
    token1.decimals,
  )
  const amountUSD = calculateAmountUSD(amount0, amount1, token0.derivedETH, token1.derivedETH, bundle.ethPriceUSD)

  // drop this pool's stale TVL contribution; it is re-added once recomputed below
  poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.minus(pool.totalValueLockedETH)
  poolManager.txCount = poolManager.txCount.plus(ONE_BI)

  token0.txCount = token0.txCount.plus(ONE_BI)
  token0.totalValueLocked = token0.totalValueLocked.plus(amount0)
  token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD))

  token1.txCount = token1.txCount.plus(ONE_BI)
  token1.totalValueLocked = token1.totalValueLocked.plus(amount1)
  token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD))

  pool.txCount = pool.txCount.plus(ONE_BI)

  // a pool's active liquidity only changes when the position spans the current tick
  if (tickLower <= currTick && tickUpper > currTick) {
    pool.liquidity = pool.liquidity.plus(liquidityDelta)
  }

  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)
  pool.totalValueLockedETH = pool.totalValueLockedToken0
    .times(token0.derivedETH)
    .plus(pool.totalValueLockedToken1.times(token1.derivedETH))
  pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD)

  poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.plus(pool.totalValueLockedETH)
  poolManager.totalValueLockedUSD = poolManager.totalValueLockedETH.times(bundle.ethPriceUSD)

  // ModifyLiquidity entity
  const transaction = loadTransaction(event)
  const modifyLiquidity = new ModifyLiquidity(transaction.id + '-' + event.logIndex.toString())
  modifyLiquidity.transaction = transaction.id
  modifyLiquidity.timestamp = transaction.timestamp
  modifyLiquidity.pool = pool.id
  modifyLiquidity.token0 = pool.token0
  modifyLiquidity.token1 = pool.token1
  modifyLiquidity.sender = event.params.sender
  modifyLiquidity.origin = event.transaction.from
  modifyLiquidity.amount = liquidityDelta
  modifyLiquidity.amount0 = amount0
  modifyLiquidity.amount1 = amount1
  modifyLiquidity.amountUSD = amountUSD
  modifyLiquidity.tickLower = BigInt.fromI32(tickLower)
  modifyLiquidity.tickUpper = BigInt.fromI32(tickUpper)
  modifyLiquidity.logIndex = event.logIndex

  // lower/upper Tick entities
  const lowerTickId = poolId + '#' + BigInt.fromI32(tickLower).toString()
  const upperTickId = poolId + '#' + BigInt.fromI32(tickUpper).toString()
  let lowerTick = Tick.load(lowerTickId)
  if (lowerTick === null) {
    lowerTick = createTick(lowerTickId, tickLower, pool.id, event)
  }
  let upperTick = Tick.load(upperTickId)
  if (upperTick === null) {
    upperTick = createTick(upperTickId, tickUpper, pool.id, event)
  }
  lowerTick.liquidityGross = lowerTick.liquidityGross.plus(liquidityDelta)
  lowerTick.liquidityNet = lowerTick.liquidityNet.plus(liquidityDelta)
  upperTick.liquidityGross = upperTick.liquidityGross.plus(liquidityDelta)
  upperTick.liquidityNet = upperTick.liquidityNet.minus(liquidityDelta)

  updateUniswapDayData(event, poolManagerAddress)
  updatePoolDayData(poolId, event)
  updatePoolHourData(poolId, event)
  updateTokenDayData(token0, event)
  updateTokenDayData(token1, event)
  updateTokenHourData(token0, event)
  updateTokenHourData(token1, event)

  lowerTick.save()
  upperTick.save()
  modifyLiquidity.save()
  pool.save()
  poolManager.save()
  token0.save()
  token1.save()
}
