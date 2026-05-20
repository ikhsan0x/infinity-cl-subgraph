import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { assert, beforeEach, clearStore, describe, test } from 'matchstick-as/assembly/index'

import { Bundle, Token } from '../../src/types/schema'
import { ADDRESS_ZERO, ZERO_BD, ZERO_BI } from '../../src/utils/constants'
import { calculateAmountUSD, getTrackedAmountUSD, sqrtPriceX96ToTokenPrices } from '../../src/utils/pricing'
import { TEST_CONFIG, USDC_MAINNET_FIXTURE, WETH_MAINNET_FIXTURE } from '../handlers/constants'

describe('Price calculations', () => {
  test('calculateAmountUSD calculates correctly', () => {
    const amount0 = BigDecimal.fromString('100')
    const amount1 = BigDecimal.fromString('200')
    const token0DerivedETH = BigDecimal.fromString('0.1')
    const token1DerivedETH = BigDecimal.fromString('0.2')
    const ethPriceUSD = BigDecimal.fromString('1000')

    const result = calculateAmountUSD(amount0, amount1, token0DerivedETH, token1DerivedETH, ethPriceUSD)

    // Expected result: (100 * 0.1 * 1000) + (200 * 0.2 * 1000) = 10000 + 40000 = 50000
    assert.assertTrue(result.equals(BigDecimal.fromString('50000')), 'Result should be 50000')
  })

  test('calculateAmountUSD handles zero amounts', () => {
    const amount0 = BigDecimal.fromString('0')
    const amount1 = BigDecimal.fromString('0')
    const token0DerivedETH = BigDecimal.fromString('0.1')
    const token1DerivedETH = BigDecimal.fromString('0.2')
    const ethPriceUSD = BigDecimal.fromString('1000')

    const result = calculateAmountUSD(amount0, amount1, token0DerivedETH, token1DerivedETH, ethPriceUSD)

    assert.assertTrue(result.equals(BigDecimal.fromString('0')), 'Result should be 0')
  })

  test('calculateAmountUSD handles very large numbers', () => {
    const amount0 = BigDecimal.fromString('1000000000000000000') // 1e18
    const amount1 = BigDecimal.fromString('2000000000000000000') // 2e18
    const token0DerivedETH = BigDecimal.fromString('0.1')
    const token1DerivedETH = BigDecimal.fromString('0.2')
    const ethPriceUSD = BigDecimal.fromString('1000')

    const result = calculateAmountUSD(amount0, amount1, token0DerivedETH, token1DerivedETH, ethPriceUSD)

    // Expected result: (1e18 * 0.1 * 1000) + (2e18 * 0.2 * 1000) = 1e20 + 4e20 = 5e20
    assert.assertTrue(result.equals(BigDecimal.fromString('500000000000000000000')), 'Result should be 5e20')
  })
})

describe('sqrtPriceX96ToTokenPrices', () => {
  test('calculates prices correctly for non-native tokens', () => {
    const token0 = new Token(USDC_MAINNET_FIXTURE.address)
    token0.decimals = BigInt.fromString(USDC_MAINNET_FIXTURE.decimals)

    const token1 = new Token(WETH_MAINNET_FIXTURE.address)
    token1.decimals = BigInt.fromString(WETH_MAINNET_FIXTURE.decimals)

    const sqrtPriceX96 = BigInt.fromString('79228162514264337593543950336') // 1:1 price

    const prices = sqrtPriceX96ToTokenPrices(sqrtPriceX96, token0, token1, TEST_CONFIG.nativeTokenDetails)

    assert.assertTrue(prices[0].equals(BigDecimal.fromString('1')), 'Token0 price should be 1')
    assert.assertTrue(prices[1].equals(BigDecimal.fromString('1')), 'Token1 price should be 1')
  })

  test('calculates prices correctly when token0 is native', () => {
    const token0 = new Token(ADDRESS_ZERO)
    token0.decimals = BigInt.fromI32(0) // This should be ignored

    const token1 = new Token(USDC_MAINNET_FIXTURE.address)
    token1.decimals = BigInt.fromString(USDC_MAINNET_FIXTURE.decimals)

    const sqrtPriceX96 = BigInt.fromString('79228162514264337593543950336') // 1:1 price

    const prices = sqrtPriceX96ToTokenPrices(sqrtPriceX96, token0, token1, TEST_CONFIG.nativeTokenDetails)

    assert.assertTrue(prices[0].equals(BigDecimal.fromString('1')), 'Native token price should be 1')
    assert.assertTrue(prices[1].equals(BigDecimal.fromString('1')), 'USDC price should be 1')
  })

  test('calculates prices correctly when token1 is native', () => {
    const token0 = new Token(USDC_MAINNET_FIXTURE.address)
    token0.decimals = BigInt.fromString(USDC_MAINNET_FIXTURE.decimals)

    const token1 = new Token(ADDRESS_ZERO)
    token1.decimals = BigInt.fromI32(0) // This should be ignored

    const sqrtPriceX96 = BigInt.fromString('79228162514264337593543950336') // 1:1 price

    const prices = sqrtPriceX96ToTokenPrices(sqrtPriceX96, token0, token1, TEST_CONFIG.nativeTokenDetails)

    assert.assertTrue(prices[0].equals(BigDecimal.fromString('1')), 'USDC price should be 1')
    assert.assertTrue(prices[1].equals(BigDecimal.fromString('1')), 'Native token price should be 1')
  })
})

function seedBundleForTracked(): void {
  const bundle = new Bundle('1')
  bundle.ethPriceUSD = BigDecimal.fromString('2000')
  bundle.save()
}

function makeTrackedToken(id: string, derivedETH: BigDecimal): Token {
  const token = new Token(id)
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
  token.totalValueLocked = ZERO_BD
  token.totalValueLockedUSD = ZERO_BD
  token.totalValueLockedUSDUntracked = ZERO_BD
  token.derivedETH = derivedETH
  token.whitelistPools = []
  token.save()
  return token
}

describe('getTrackedAmountUSD branches', () => {
  beforeEach(() => {
    clearStore()
  })

  test('both tokens whitelisted: sum of both legs in USD', () => {
    seedBundleForTracked()
    // priceUSD = derivedETH * 2000
    // token0: 0.5 * 2000 = 1000;  token1: 1.0 * 2000 = 2000
    const t0 = makeTrackedToken('0xaa', BigDecimal.fromString('0.5'))
    const t1 = makeTrackedToken('0xbb', BigDecimal.fromString('1.0'))

    const result = getTrackedAmountUSD(
      BigDecimal.fromString('10'),
      t0,
      BigDecimal.fromString('5'),
      t1,
      [t0.id, t1.id],
    )

    // 10 * 1000 + 5 * 2000 = 10000 + 10000 = 20000
    assert.assertTrue(result.equals(BigDecimal.fromString('20000')))
  })

  test('only token0 whitelisted: 2x token0 leg in USD', () => {
    seedBundleForTracked()
    const t0 = makeTrackedToken('0xaa', BigDecimal.fromString('0.5'))
    const t1 = makeTrackedToken('0xbb', BigDecimal.fromString('1.0'))

    const result = getTrackedAmountUSD(
      BigDecimal.fromString('10'),
      t0,
      BigDecimal.fromString('5'),
      t1,
      [t0.id], // only t0
    )

    // 2 * (10 * 1000) = 20000
    assert.assertTrue(result.equals(BigDecimal.fromString('20000')))
  })

  test('only token1 whitelisted: 2x token1 leg in USD', () => {
    seedBundleForTracked()
    const t0 = makeTrackedToken('0xaa', BigDecimal.fromString('0.5'))
    const t1 = makeTrackedToken('0xbb', BigDecimal.fromString('1.0'))

    const result = getTrackedAmountUSD(
      BigDecimal.fromString('10'),
      t0,
      BigDecimal.fromString('5'),
      t1,
      [t1.id], // only t1
    )

    // 2 * (5 * 2000) = 20000
    assert.assertTrue(result.equals(BigDecimal.fromString('20000')))
  })

  test('neither token whitelisted: returns zero', () => {
    seedBundleForTracked()
    const t0 = makeTrackedToken('0xaa', BigDecimal.fromString('0.5'))
    const t1 = makeTrackedToken('0xbb', BigDecimal.fromString('1.0'))

    const noWhitelist: string[] = []
    const result = getTrackedAmountUSD(
      BigDecimal.fromString('10'),
      t0,
      BigDecimal.fromString('5'),
      t1,
      noWhitelist,
    )

    assert.assertTrue(result.equals(ZERO_BD))
  })
})
