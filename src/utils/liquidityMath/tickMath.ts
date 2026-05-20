import { BigInt } from '@graphprotocol/graph-ts'

import { hexToBigInt } from '..'
import { MaxUint256, ONE_BI, Q32, Q128, ZERO_BI } from '../constants'

// https://github.com/Uniswap/sdks/blob/92b765bdf2759e5e6639a01728a96df81efbaa2b/sdks/v3-sdk/src/utils/tickMath.ts

/**
 * Per-bit magic multipliers for getSqrtRatioAtTick, indexed by bit position
 * (factor[i] applies when bit i of absTick is set). Parsed once at module load
 * instead of on every call — the original re-parsed all 20 hex strings per tick.
 */
const MAGIC: BigInt[] = [
  hexToBigInt('0xfffcb933bd6fad37aa2d162d1a594001'),
  hexToBigInt('0xfff97272373d413259a46990580e213a'),
  hexToBigInt('0xfff2e50f5f656932ef12357cf3c7fdcc'),
  hexToBigInt('0xffe5caca7e10e4e61c3624eaa0941cd0'),
  hexToBigInt('0xffcb9843d60f6159c9db58835c926644'),
  hexToBigInt('0xff973b41fa98c081472e6896dfb254c0'),
  hexToBigInt('0xff2ea16466c96a3843ec78b326b52861'),
  hexToBigInt('0xfe5dee046a99a2a811c461f1969c3053'),
  hexToBigInt('0xfcbe86c7900a88aedcffc83b479aa3a4'),
  hexToBigInt('0xf987a7253ac413176f2b074cf7815e54'),
  hexToBigInt('0xf3392b0822b70005940c7a398e4b70f3'),
  hexToBigInt('0xe7159475a2c29b7443b29c7fa6e889d9'),
  hexToBigInt('0xd097f3bdfd2022b8845ad8f792aa5825'),
  hexToBigInt('0xa9f746462d870fdf8a65dc1f90e061e5'),
  hexToBigInt('0x70d869a156d2a1b890bb3df62baf32f7'),
  hexToBigInt('0x31be135f97d08fd981231505542fcfa6'),
  hexToBigInt('0x9aa508b5b7a84e1c677de54f3e99bc9'),
  hexToBigInt('0x5d6af8dedb81196699c329225ee604'),
  hexToBigInt('0x2216e584f5fa1ea926041bedfe98'),
  hexToBigInt('0x48a170391f7dc42444e8fa2'),
]

function mulShift(val: BigInt, mulBy: BigInt): BigInt {
  return val.times(mulBy).rightShift(128)
}

export abstract class TickMath {
  /** Minimum tick usable on any pool. */
  static MIN_TICK: i32 = -887272
  /** Maximum tick usable on any pool. */
  static MAX_TICK: i32 = 887272

  static MIN_SQRT_RATIO: BigInt = BigInt.fromString('4295128739')
  static MAX_SQRT_RATIO: BigInt = BigInt.fromString('1461446703485210103287273052203988822378723970342')

  /**
   * Returns the sqrt ratio as a Q64.96 for the given tick: sqrt(1.0001)^tick.
   */
  static getSqrtRatioAtTick(tick: i32): BigInt {
    if (tick < TickMath.MIN_TICK || tick > TickMath.MAX_TICK) {
      throw new Error('TICK')
    }
    const absTick = tick < 0 ? -tick : tick

    let ratio = (absTick & 0x1) != 0 ? MAGIC[0] : Q128
    for (let i = 1; i < MAGIC.length; i++) {
      if ((absTick & (1 << i)) != 0) {
        ratio = mulShift(ratio, MAGIC[i])
      }
    }
    if (tick > 0) {
      ratio = MaxUint256.div(ratio)
    }

    // round up while shifting from Q128.128 down to Q128.96
    return ratio.div(Q32).plus(ratio.mod(Q32).gt(ZERO_BI) ? ONE_BI : ZERO_BI)
  }
}
