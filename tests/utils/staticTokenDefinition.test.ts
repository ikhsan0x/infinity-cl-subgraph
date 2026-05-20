import { Address, BigInt } from '@graphprotocol/graph-ts'
import { assert, describe, test } from 'matchstick-as'

import { getStaticDefinition, StaticTokenDefinition } from '../../src/utils/staticTokenDefinition'

const ADDR_A = Address.fromString('0x1111111111111111111111111111111111111111')
const ADDR_B = Address.fromString('0x2222222222222222222222222222222222222222')
const ADDR_C = Address.fromString('0x3333333333333333333333333333333333333333')

const DEF_A: StaticTokenDefinition = {
  address: ADDR_A,
  symbol: 'AAA',
  name: 'Token A',
  decimals: BigInt.fromI32(18),
}
const DEF_B: StaticTokenDefinition = {
  address: ADDR_B,
  symbol: 'BBB',
  name: 'Token B',
  decimals: BigInt.fromI32(6),
}

describe('getStaticDefinition', () => {
  test('returns null for an empty registry', () => {
    assert.assertNull(getStaticDefinition(ADDR_A, []))
  })

  test('returns the matching definition by address', () => {
    const match = getStaticDefinition(ADDR_B, [DEF_A, DEF_B])
    assert.assertNotNull(match)
    assert.stringEquals(match!.symbol, 'BBB')
    assert.bigIntEquals(match!.decimals, BigInt.fromI32(6))
  })

  test('returns null when no entry matches', () => {
    assert.assertNull(getStaticDefinition(ADDR_C, [DEF_A, DEF_B]))
  })
})
