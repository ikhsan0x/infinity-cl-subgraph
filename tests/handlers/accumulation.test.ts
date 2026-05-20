import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleModifyLiquidityHelper } from '../../src/mappings/modifyLiquidity'
import { handleSwapHelper } from '../../src/mappings/swap'
import { ModifyLiquidity, Swap } from '../../src/types/PoolManager/PoolManager'
import { Bundle, Token } from '../../src/types/schema'
import { TickMath } from '../../src/utils/liquidityMath/tickMath'
import { Pool } from '../../src/types/schema'
import {
  invokePoolCreatedWithMockedEthCalls,
  MOCK_EVENT,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
  TEST_USDC_DERIVED_ETH,
  TEST_WETH_DERIVED_ETH,
  USDC_MAINNET_FIXTURE,
  USDC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from './constants'

const POOL_ID_BYTES = Bytes.fromHexString(USDC_WETH_POOL_ID) as Bytes

const SWAP_SENDER = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')

// Builds a Swap event with a custom logIndex so two events in the same tx hash
// produce distinct (immutable) Swap entities while exercising loadTransaction
// reuse.
function buildSwapEvent(logIndex: BigInt): Swap {
  return new Swap(
    MOCK_EVENT.address,
    logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(POOL_ID_BYTES)),
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(SWAP_SENDER)),
      new ethereum.EventParam('amount0', ethereum.Value.fromSignedBigInt(BigInt.fromString('-10007'))),
      new ethereum.EventParam('amount1', ethereum.Value.fromSignedBigInt(BigInt.fromString('10000'))),
      new ethereum.EventParam(
        'sqrtPriceX96',
        ethereum.Value.fromSignedBigInt(BigInt.fromString('79228162514264337514315787821')),
      ),
      new ethereum.EventParam(
        'liquidity',
        ethereum.Value.fromSignedBigInt(BigInt.fromString('10000000000000000000000')),
      ),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(-1)),
      new ethereum.EventParam('fee', ethereum.Value.fromI32(500)),
    ],
    MOCK_EVENT.receipt,
  )
}

describe('multi-event accumulation', () => {
  beforeEach(() => {
    invokePoolCreatedWithMockedEthCalls(MOCK_EVENT, TEST_CONFIG)

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()

    const usdc = Token.load(USDC_MAINNET_FIXTURE.address)!
    usdc.derivedETH = TEST_USDC_DERIVED_ETH
    usdc.save()

    const weth = Token.load(WETH_MAINNET_FIXTURE.address)!
    weth.derivedETH = TEST_WETH_DERIVED_ETH
    weth.save()
  })

  afterEach(() => {
    clearStore()
  })

  test('two swaps in the same tx: Transaction reused, two distinct Swap entities, cumulative pool/manager state', () => {
    const swapA = buildSwapEvent(MOCK_EVENT.logIndex)
    const swapB = buildSwapEvent(MOCK_EVENT.logIndex.plus(BigInt.fromI32(1)))

    handleSwapHelper(swapA, TEST_CONFIG)
    // Second handler call must not panic when re-loading the (immutable)
    // Transaction created by the first call.
    handleSwapHelper(swapB, TEST_CONFIG)

    // Exactly one Transaction, two Swap entities.
    assert.entityCount('Transaction', 1)
    assert.entityCount('Swap', 2)

    // Pool.txCount and PoolManager.txCount accumulate.
    assert.fieldEquals('Pool', USDC_WETH_POOL_ID, 'txCount', '2')
    assert.fieldEquals('PoolManager', TEST_CONFIG.poolManagerAddress, 'txCount', '2')

    // Token.txCount accumulates on both tokens.
    assert.fieldEquals('Token', USDC_MAINNET_FIXTURE.address, 'txCount', '2')
    assert.fieldEquals('Token', WETH_MAINNET_FIXTURE.address, 'txCount', '2')
  })

  test('two swaps in the same day/hour: PoolDayData and PoolHourData aggregate into a single row', () => {
    const swapA = buildSwapEvent(MOCK_EVENT.logIndex)
    const swapB = buildSwapEvent(MOCK_EVENT.logIndex.plus(BigInt.fromI32(1)))

    handleSwapHelper(swapA, TEST_CONFIG)
    handleSwapHelper(swapB, TEST_CONFIG)

    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const hourId = MOCK_EVENT.block.timestamp.toI32() / 3600
    const poolDayId = USDC_WETH_POOL_ID + '-' + dayId.toString()
    const poolHourId = USDC_WETH_POOL_ID + '-' + hourId.toString()

    // Two swaps in the same window must update one row, not create new ones.
    // (handleInitialize itself creates the initial PoolDayData/HourData row.)
    assert.entityCount('PoolDayData', 1)
    assert.entityCount('PoolHourData', 1)

    // Pool.volumeUSD is the sum of both swaps; PoolDayData/HourData reflect it.
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    assert.fieldEquals('PoolDayData', poolDayId, 'volumeUSD', pool.volumeUSD.toString())
    assert.fieldEquals('PoolHourData', poolHourId, 'volumeUSD', pool.volumeUSD.toString())
    assert.assertTrue(pool.volumeUSD.gt(BigDecimal.fromString('0')))
  })
})

const ML_SENDER = Address.fromString('0x39BF2eFF94201cfAA471932655404F63315147a4')

function buildModifyLiquidityEvent(logIndex: BigInt, liquidityDelta: BigInt): ModifyLiquidity {
  return new ModifyLiquidity(
    MOCK_EVENT.address,
    logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(POOL_ID_BYTES)),
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(ML_SENDER)),
      new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
      new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
      new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(liquidityDelta)),
    ],
    MOCK_EVENT.receipt,
  )
}

describe('Tick liquidityGross accumulation', () => {
  beforeEach(() => {
    invokePoolCreatedWithMockedEthCalls(MOCK_EVENT, TEST_CONFIG)

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()

    const usdc = Token.load(USDC_MAINNET_FIXTURE.address)!
    usdc.derivedETH = TEST_USDC_DERIVED_ETH
    usdc.save()
    const weth = Token.load(WETH_MAINNET_FIXTURE.address)!
    weth.derivedETH = TEST_WETH_DERIVED_ETH
    weth.save()

    // Put the pool's current tick in range so liquidity changes are applied.
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(0)
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(0)
    pool.save()
  })

  afterEach(() => {
    clearStore()
  })

  test('two add events on the same tick range double liquidityGross at both ticks', () => {
    const delta = BigInt.fromString('1000000000000000000')

    handleModifyLiquidityHelper(buildModifyLiquidityEvent(MOCK_EVENT.logIndex, delta), TEST_CONFIG)
    handleModifyLiquidityHelper(
      buildModifyLiquidityEvent(MOCK_EVENT.logIndex.plus(BigInt.fromI32(1)), delta),
      TEST_CONFIG,
    )

    const expected = delta.times(BigInt.fromI32(2)).toString()
    assert.fieldEquals('Tick', USDC_WETH_POOL_ID + '#-600', 'liquidityGross', expected)
    assert.fieldEquals('Tick', USDC_WETH_POOL_ID + '#600', 'liquidityGross', expected)
  })

  test('add then equal-magnitude remove returns liquidityGross to zero', () => {
    const delta = BigInt.fromString('1000000000000000000')

    handleModifyLiquidityHelper(buildModifyLiquidityEvent(MOCK_EVENT.logIndex, delta), TEST_CONFIG)
    handleModifyLiquidityHelper(
      buildModifyLiquidityEvent(MOCK_EVENT.logIndex.plus(BigInt.fromI32(1)), delta.neg()),
      TEST_CONFIG,
    )

    assert.fieldEquals('Tick', USDC_WETH_POOL_ID + '#-600', 'liquidityGross', '0')
    assert.fieldEquals('Tick', USDC_WETH_POOL_ID + '#600', 'liquidityGross', '0')
  })
})
