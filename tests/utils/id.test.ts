import { BigInt, Bytes } from '@graphprotocol/graph-ts'
import { assert, describe, test } from 'matchstick-as/assembly/index'

import { eventId, positionId } from '../../src/utils/id'

describe('id utils', () => {
  test('positionId: returns tokenId as string', () => {
    assert.stringEquals(positionId(BigInt.fromI32(0)), '0')
    assert.stringEquals(positionId(BigInt.fromI32(1)), '1')
    assert.stringEquals(positionId(BigInt.fromString('123456789012345678901234567890')), '123456789012345678901234567890')
  })

  test('eventId: concatenates tx hash and logIndex with a dash', () => {
    const hash = Bytes.fromHexString('0xabcd000000000000000000000000000000000000000000000000000000000001')
    assert.stringEquals(
      eventId(hash, BigInt.fromI32(5)),
      '0xabcd000000000000000000000000000000000000000000000000000000000001-5',
    )
  })

  test('eventId: handles zero logIndex', () => {
    const hash = Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000001')
    assert.stringEquals(
      eventId(hash, BigInt.fromI32(0)),
      '0x0000000000000000000000000000000000000000000000000000000000000001-0',
    )
  })
})
