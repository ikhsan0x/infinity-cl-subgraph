import { BigDecimal, BigInt, ethereum } from '@graphprotocol/graph-ts'

import { Tick } from '../types/schema'
import { ZERO_BI } from './constants'
import { fastExponentiation, safeDiv } from './index'

const ONE_BD = BigDecimal.fromString('1')
const TICK_BASE = BigDecimal.fromString('1.0001')

/** Create a fresh Tick entity. Prices are constant (1.0001^tick), so they are set once here. */
export function createTick(tickId: string, tickIdx: i32, poolId: string, event: ethereum.Event): Tick {
  const tick = new Tick(tickId)
  tick.tickIdx = BigInt.fromI32(tickIdx)
  tick.pool = poolId
  tick.poolAddress = poolId
  tick.createdAtTimestamp = event.block.timestamp
  tick.createdAtBlockNumber = event.block.number
  tick.liquidityGross = ZERO_BI
  tick.liquidityNet = ZERO_BI

  // 1.0001^tick is the token1/token0 price.
  const price0 = fastExponentiation(TICK_BASE, tickIdx)
  tick.price0 = price0
  tick.price1 = safeDiv(ONE_BD, price0)

  return tick
}
