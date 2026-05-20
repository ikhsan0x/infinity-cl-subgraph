import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { hexToBigInt } from './index'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

// BigInt
export const ZERO_BI = BigInt.zero()
export const ONE_BI = BigInt.fromI32(1)
export const Q32 = BigInt.fromI32(2).pow(32)
export const Q96 = BigInt.fromI32(2).pow(96)
export const Q128 = BigInt.fromI32(2).pow(128 as u8)
export const Q192 = BigInt.fromI32(2).pow(192 as u8)
export const MaxUint256 = hexToBigInt('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

// BigDecimal — hoisted so hot paths reuse instances instead of re-parsing strings
export const ZERO_BD = BigDecimal.zero()
export const ONE_BD = BigDecimal.fromString('1')
export const NEG_ONE_BD = BigDecimal.fromString('-1')
export const TWO_BD = BigDecimal.fromString('2')
export const ONE_MILLION_BD = BigDecimal.fromString('1000000')
export const Q192_BD = Q192.toBigDecimal()
