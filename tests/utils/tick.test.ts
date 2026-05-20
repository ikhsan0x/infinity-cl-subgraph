import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { afterEach, assert, clearStore, describe, newMockEvent, test } from 'matchstick-as'

import { ONE_BD } from '../../src/utils/constants'
import { fastExponentiation, safeDiv } from '../../src/utils/index'
import { createTick } from '../../src/utils/tick'

describe('createTick', () => {
  afterEach(() => {
    clearStore()
  })

  test('initializes counters at zero and computes price0 = 1.0001^tick', () => {
    const event = newMockEvent()
    const tickIdx = 100
    const tickId = '0xpool#100'
    const poolId = '0xpool'

    const tick = createTick(tickId, tickIdx, poolId, event)

    assert.stringEquals(tick.id, tickId)
    assert.stringEquals(tick.pool, poolId)
    assert.stringEquals(tick.poolAddress!, poolId)
    assert.bigIntEquals(tick.tickIdx, BigInt.fromI32(tickIdx))
    assert.bigIntEquals(tick.liquidityGross, BigInt.zero())
    assert.bigIntEquals(tick.liquidityNet, BigInt.zero())
    assert.bigIntEquals(tick.createdAtTimestamp, event.block.timestamp)
    assert.bigIntEquals(tick.createdAtBlockNumber, event.block.number)

    const expectedPrice0 = fastExponentiation(BigDecimal.fromString('1.0001'), tickIdx)
    assert.assertTrue(tick.price0.equals(expectedPrice0))
    assert.assertTrue(tick.price1.equals(safeDiv(ONE_BD, expectedPrice0)))
  })

  test('tick = 0 produces price0 = price1 = 1', () => {
    const event = newMockEvent()
    const tick = createTick('id0', 0, 'pool0', event)
    assert.assertTrue(tick.price0.equals(ONE_BD))
    assert.assertTrue(tick.price1.equals(ONE_BD))
  })

  test('negative tick produces price0 < 1 and price1 > 1', () => {
    const event = newMockEvent()
    const tick = createTick('idNeg', -100, 'poolNeg', event)
    assert.assertTrue(tick.price0.lt(ONE_BD))
    assert.assertTrue(tick.price1.gt(ONE_BD))
  })
})
