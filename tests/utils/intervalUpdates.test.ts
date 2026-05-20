import { BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import { afterEach, assert, clearStore, describe, newMockEvent, test } from 'matchstick-as'

import { Bundle, Pool, PoolManager, Token } from '../../src/types/schema'
import { ADDRESS_ZERO, ZERO_BD, ZERO_BI } from '../../src/utils/constants'

const EMPTY_BYTES32 = Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000')
import {
  updatePoolDayData,
  updatePoolHourData,
  updateTokenDayData,
  updateTokenHourData,
  updateUniswapDayData,
} from '../../src/utils/intervalUpdates'

const POOL_ID = '0xpool00000000000000000000000000000000000000000000000000000000pool'
const MANAGER_ADDRESS = '0xmgr00000000000000000000000000000000mgr00'
const TOKEN_ID = '0xtoken000000000000000000000000000000token'

function seedPool(price: BigDecimal): Pool {
  let pool = Pool.load(POOL_ID)
  if (pool === null) {
    pool = new Pool(POOL_ID)
    pool.createdAtTimestamp = ZERO_BI
    pool.createdAtBlockNumber = ZERO_BI
    pool.token0 = '0xtoken0'
    pool.token1 = '0xtoken1'
    pool.feeTier = BigInt.fromI32(500)
    pool.liquidity = ZERO_BI
    pool.sqrtPrice = ZERO_BI
    pool.token1Price = ZERO_BD
    pool.tick = ZERO_BI
    pool.observationIndex = ZERO_BI
    pool.volumeToken0 = ZERO_BD
    pool.volumeToken1 = ZERO_BD
    pool.volumeUSD = ZERO_BD
    pool.untrackedVolumeUSD = ZERO_BD
    pool.feesUSD = ZERO_BD
    pool.txCount = ZERO_BI
    pool.collectedFeesToken0 = ZERO_BD
    pool.collectedFeesToken1 = ZERO_BD
    pool.collectedFeesUSD = ZERO_BD
    pool.totalValueLockedToken0 = ZERO_BD
    pool.totalValueLockedToken1 = ZERO_BD
    pool.totalValueLockedETH = ZERO_BD
    pool.totalValueLockedUSDUntracked = ZERO_BD
    pool.liquidityProviderCount = ZERO_BI
    pool.tickSpacing = BigInt.fromI32(10)
    pool.hooks = ADDRESS_ZERO
    pool.parameters = EMPTY_BYTES32
    pool.hooksRegistration = EMPTY_BYTES32
  }
  pool.token0Price = price
  pool.totalValueLockedUSD = BigDecimal.fromString('1000')
  pool.save()
  return pool
}

function seedManager(): PoolManager {
  let mgr = PoolManager.load(MANAGER_ADDRESS)
  if (mgr === null) {
    mgr = new PoolManager(MANAGER_ADDRESS)
    mgr.poolCount = ZERO_BI
    mgr.totalVolumeETH = ZERO_BD
    mgr.totalVolumeUSD = ZERO_BD
    mgr.untrackedVolumeUSD = ZERO_BD
    mgr.totalFeesUSD = ZERO_BD
    mgr.totalFeesETH = ZERO_BD
    mgr.totalValueLockedETH = ZERO_BD
    mgr.totalValueLockedUSDUntracked = ZERO_BD
    mgr.totalValueLockedETHUntracked = ZERO_BD
    mgr.owner = ADDRESS_ZERO
  }
  mgr.totalValueLockedUSD = BigDecimal.fromString('5000')
  mgr.txCount = BigInt.fromI32(42)
  mgr.save()
  return mgr
}

function seedTokenAndBundle(): Token {
  let bundle = Bundle.load('1')
  if (bundle === null) {
    bundle = new Bundle('1')
  }
  bundle.ethPriceUSD = BigDecimal.fromString('2000')
  bundle.save()

  let token = Token.load(TOKEN_ID)
  if (token === null) {
    token = new Token(TOKEN_ID)
    token.symbol = 'TKN'
    token.name = 'Token'
    token.decimals = BigInt.fromI32(18)
    token.totalSupply = ZERO_BI
    token.volume = ZERO_BD
    token.volumeUSD = ZERO_BD
    token.untrackedVolumeUSD = ZERO_BD
    token.feesUSD = ZERO_BD
    token.txCount = ZERO_BI
    token.poolCount = ZERO_BI
    token.totalValueLockedUSDUntracked = ZERO_BD
    token.whitelistPools = []
  }
  token.derivedETH = BigDecimal.fromString('0.5')
  token.totalValueLocked = BigDecimal.fromString('100')
  token.totalValueLockedUSD = BigDecimal.fromString('100000')
  token.save()
  return token
}

describe('updatePoolDayData / updatePoolHourData OHLC tracking', () => {
  afterEach(() => {
    clearStore()
  })

  test('first call seeds open=high=low=close to current pool price', () => {
    const event = newMockEvent()
    seedPool(BigDecimal.fromString('100'))

    const day = updatePoolDayData(POOL_ID, event)

    assert.assertTrue(day.open.equals(BigDecimal.fromString('100')))
    assert.assertTrue(day.high.equals(BigDecimal.fromString('100')))
    assert.assertTrue(day.low.equals(BigDecimal.fromString('100')))
    assert.assertTrue(day.close.equals(BigDecimal.fromString('100')))
    assert.bigIntEquals(day.txCount, BigInt.fromI32(1))
  })

  test('rising then falling price tracks high and low across calls in same window', () => {
    const event = newMockEvent()

    seedPool(BigDecimal.fromString('100'))
    updatePoolDayData(POOL_ID, event)

    seedPool(BigDecimal.fromString('150')) // new high
    updatePoolDayData(POOL_ID, event)

    seedPool(BigDecimal.fromString('80')) // new low
    const day = updatePoolDayData(POOL_ID, event)

    assert.assertTrue(day.open.equals(BigDecimal.fromString('100')), 'open is pinned to first price')
    assert.assertTrue(day.high.equals(BigDecimal.fromString('150')))
    assert.assertTrue(day.low.equals(BigDecimal.fromString('80')))
    assert.assertTrue(day.close.equals(BigDecimal.fromString('80')), 'close follows latest price')
    assert.bigIntEquals(day.txCount, BigInt.fromI32(3))
  })

  test('PoolHourData applies the same OHLC contract', () => {
    const event = newMockEvent()

    seedPool(BigDecimal.fromString('10'))
    updatePoolHourData(POOL_ID, event)

    seedPool(BigDecimal.fromString('25'))
    updatePoolHourData(POOL_ID, event)

    seedPool(BigDecimal.fromString('5'))
    const hour = updatePoolHourData(POOL_ID, event)

    assert.assertTrue(hour.open.equals(BigDecimal.fromString('10')))
    assert.assertTrue(hour.high.equals(BigDecimal.fromString('25')))
    assert.assertTrue(hour.low.equals(BigDecimal.fromString('5')))
    assert.assertTrue(hour.close.equals(BigDecimal.fromString('5')))
    assert.bigIntEquals(hour.txCount, BigInt.fromI32(3))
  })
})

describe('updateTokenDayData / updateTokenHourData OHLC tracking', () => {
  afterEach(() => {
    clearStore()
  })

  test('first call seeds open=high=low=close to token price in USD', () => {
    const event = newMockEvent()
    const token = seedTokenAndBundle()
    // priceUSD = derivedETH (0.5) * ethPriceUSD (2000) = 1000
    const expected = BigDecimal.fromString('1000')

    const day = updateTokenDayData(token, event)

    assert.assertTrue(day.open.equals(expected))
    assert.assertTrue(day.high.equals(expected))
    assert.assertTrue(day.low.equals(expected))
    assert.assertTrue(day.close.equals(expected))
  })

  test('subsequent calls update high/low/close as token price changes', () => {
    const event = newMockEvent()
    const token = seedTokenAndBundle() // 0.5 * 2000 = 1000

    updateTokenDayData(token, event)

    token.derivedETH = BigDecimal.fromString('1.0') // 2000 — new high
    token.save()
    updateTokenDayData(token, event)

    token.derivedETH = BigDecimal.fromString('0.25') // 500 — new low
    token.save()
    const day = updateTokenDayData(token, event)

    assert.assertTrue(day.open.equals(BigDecimal.fromString('1000')))
    assert.assertTrue(day.high.equals(BigDecimal.fromString('2000')))
    assert.assertTrue(day.low.equals(BigDecimal.fromString('500')))
    assert.assertTrue(day.close.equals(BigDecimal.fromString('500')))
  })

  test('TokenHourData applies the same OHLC contract', () => {
    const event = newMockEvent()
    const token = seedTokenAndBundle()

    updateTokenHourData(token, event)

    token.derivedETH = BigDecimal.fromString('2.0') // 4000
    token.save()
    const hour = updateTokenHourData(token, event)

    assert.assertTrue(hour.high.equals(BigDecimal.fromString('4000')))
    assert.assertTrue(hour.low.equals(BigDecimal.fromString('1000')))
  })
})

describe('updateUniswapDayData', () => {
  afterEach(() => {
    clearStore()
  })

  test('seeds a fresh day record and copies tvl/txCount from the manager', () => {
    const event = newMockEvent()
    seedManager()

    const day = updateUniswapDayData(event, MANAGER_ADDRESS)

    assert.assertTrue(day.tvlUSD.equals(BigDecimal.fromString('5000')))
    assert.bigIntEquals(day.txCount, BigInt.fromI32(42))
    assert.assertTrue(day.volumeETH.equals(ZERO_BD))
    assert.assertTrue(day.volumeUSD.equals(ZERO_BD))
  })

  test('reuses the existing day record when called twice in the same window', () => {
    const event = newMockEvent()
    seedManager()

    updateUniswapDayData(event, MANAGER_ADDRESS)
    assert.entityCount('UniswapDayData', 1)

    // Manager mutates; day record should reflect latest values.
    const mgr = PoolManager.load(MANAGER_ADDRESS)!
    mgr.txCount = BigInt.fromI32(100)
    mgr.totalValueLockedUSD = BigDecimal.fromString('9999')
    mgr.save()

    const day = updateUniswapDayData(event, MANAGER_ADDRESS)
    assert.entityCount('UniswapDayData', 1)
    assert.bigIntEquals(day.txCount, BigInt.fromI32(100))
    assert.assertTrue(day.tvlUSD.equals(BigDecimal.fromString('9999')))
  })
})
