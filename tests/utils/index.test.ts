import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { afterEach, assert, clearStore, describe, newMockEvent, test } from 'matchstick-as/assembly/index'

import { ONE_BD, ZERO_BD, ZERO_BI } from '../../src/utils/constants'
import {
  absBD,
  convertTokenToDecimal,
  exponentToBigDecimal,
  fastExponentiation,
  hexToBigInt,
  isNullEthValue,
  loadTransaction,
  safeDiv,
} from '../../src/utils/index'

describe('safeDiv', () => {
  test('returns 0 when denominator is zero', () => {
    assert.assertTrue(safeDiv(BigDecimal.fromString('10'), ZERO_BD).equals(ZERO_BD))
  })

  test('divides normally when denominator is non-zero', () => {
    assert.assertTrue(safeDiv(BigDecimal.fromString('10'), BigDecimal.fromString('4')).equals(BigDecimal.fromString('2.5')))
  })

  test('handles zero numerator', () => {
    assert.assertTrue(safeDiv(ZERO_BD, BigDecimal.fromString('5')).equals(ZERO_BD))
  })
})

describe('absBD', () => {
  test('returns positive value unchanged', () => {
    assert.assertTrue(absBD(BigDecimal.fromString('3.14')).equals(BigDecimal.fromString('3.14')))
  })

  test('flips sign of negative value', () => {
    assert.assertTrue(absBD(BigDecimal.fromString('-3.14')).equals(BigDecimal.fromString('3.14')))
  })

  test('returns zero unchanged', () => {
    assert.assertTrue(absBD(ZERO_BD).equals(ZERO_BD))
  })
})

describe('exponentToBigDecimal', () => {
  test('returns 1 for decimals=0', () => {
    assert.assertTrue(exponentToBigDecimal(ZERO_BI).equals(ONE_BD))
  })

  test('returns 1e6 for USDC-style decimals', () => {
    assert.assertTrue(exponentToBigDecimal(BigInt.fromI32(6)).equals(BigDecimal.fromString('1000000')))
  })

  test('returns 1e18 for ETH-style decimals', () => {
    assert.assertTrue(exponentToBigDecimal(BigInt.fromI32(18)).equals(BigDecimal.fromString('1000000000000000000')))
  })

  test('uncached path for decimals >= 49 produces correct power of 10', () => {
    const result = exponentToBigDecimal(BigInt.fromI32(50))
    // 1 followed by 50 zeros
    let expected = '1'
    for (let i = 0; i < 50; i++) expected += '0'
    assert.assertTrue(result.equals(BigDecimal.fromString(expected)))
  })
})

describe('convertTokenToDecimal', () => {
  test('decimals=0 returns raw amount as BigDecimal', () => {
    const result = convertTokenToDecimal(BigInt.fromString('42'), ZERO_BI)
    assert.assertTrue(result.equals(BigDecimal.fromString('42')))
  })

  test('divides by 10^decimals for standard token', () => {
    // 1500000 raw with 6 decimals = 1.5
    const result = convertTokenToDecimal(BigInt.fromString('1500000'), BigInt.fromI32(6))
    assert.assertTrue(result.equals(BigDecimal.fromString('1.5')))
  })

  test('handles 18-decimal token', () => {
    // 1e18 raw with 18 decimals = 1
    const result = convertTokenToDecimal(BigInt.fromString('1000000000000000000'), BigInt.fromI32(18))
    assert.assertTrue(result.equals(ONE_BD))
  })
})

describe('isNullEthValue', () => {
  test('matches the canonical null-eth sentinel hex', () => {
    assert.assertTrue(isNullEthValue('0x0000000000000000000000000000000000000000000000000000000000000001'))
  })

  test('returns false for unrelated hex', () => {
    assert.assertTrue(!isNullEthValue('0x0000000000000000000000000000000000000000000000000000000000000002'))
  })

  test('returns false for empty string', () => {
    assert.assertTrue(!isNullEthValue(''))
  })
})

describe('hexToBigInt', () => {
  test('parses simple hex with 0x prefix', () => {
    assert.assertTrue(hexToBigInt('0xff').equals(BigInt.fromI32(255)))
  })

  test('parses hex without 0x prefix', () => {
    assert.assertTrue(hexToBigInt('10').equals(BigInt.fromI32(16)))
  })

  test('parses zero', () => {
    assert.assertTrue(hexToBigInt('0x0').equals(ZERO_BI))
  })

  test('parses large hex (uint256 max)', () => {
    const max = hexToBigInt('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    assert.stringEquals(
      max.toString(),
      '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    )
  })
})

describe('fastExponentiation', () => {
  test('power=0 returns 1', () => {
    assert.assertTrue(fastExponentiation(BigDecimal.fromString('5'), 0).equals(ONE_BD))
  })

  test('power=1 returns the base', () => {
    assert.assertTrue(fastExponentiation(BigDecimal.fromString('5'), 1).equals(BigDecimal.fromString('5')))
  })

  test('positive power computes power-of-two case correctly', () => {
    // 2^10 = 1024
    assert.assertTrue(fastExponentiation(BigDecimal.fromString('2'), 10).equals(BigDecimal.fromString('1024')))
  })

  test('positive odd power', () => {
    // 3^5 = 243
    assert.assertTrue(fastExponentiation(BigDecimal.fromString('3'), 5).equals(BigDecimal.fromString('243')))
  })

  test('negative power returns reciprocal', () => {
    // 2^-2 = 0.25
    assert.assertTrue(fastExponentiation(BigDecimal.fromString('2'), -2).equals(BigDecimal.fromString('0.25')))
  })
})

describe('loadTransaction (immutable reuse)', () => {
  afterEach(() => {
    clearStore()
  })

  test('first call creates and saves the Transaction', () => {
    const event = newMockEvent()
    const tx = loadTransaction(event)

    assert.fieldEquals('Transaction', tx.id, 'blockNumber', event.block.number.toString())
    assert.fieldEquals('Transaction', tx.id, 'timestamp', event.block.timestamp.toString())
    assert.fieldEquals('Transaction', tx.id, 'gasPrice', event.transaction.gasPrice.toString())
  })

  test('subsequent calls with the same tx hash return the existing entity without re-saving', () => {
    // First event creates Transaction.
    const firstEvent = newMockEvent()
    const firstTx = loadTransaction(firstEvent)

    // Second event reuses the same transaction.hash (same tx), but a different
    // block/timestamp would normally be a mismatch — an immutable entity store
    // would panic on a second .save(). The early-return guarantees no second save.
    const secondEvent = newMockEvent()
    secondEvent.transaction.hash = firstEvent.transaction.hash
    secondEvent.block.number = firstEvent.block.number.plus(BigInt.fromI32(999))
    secondEvent.block.timestamp = firstEvent.block.timestamp.plus(BigInt.fromI32(999))

    const secondTx = loadTransaction(secondEvent)

    assert.stringEquals(firstTx.id, secondTx.id)
    // Persisted Transaction must still reflect the FIRST event's values —
    // proving the second call was a no-op (no overwrite).
    assert.fieldEquals('Transaction', firstTx.id, 'blockNumber', firstEvent.block.number.toString())
    assert.fieldEquals('Transaction', firstTx.id, 'timestamp', firstEvent.block.timestamp.toString())
  })

})
