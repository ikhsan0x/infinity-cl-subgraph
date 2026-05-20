import { BigInt } from '@graphprotocol/graph-ts'

import { ZERO_BI } from '../constants'
import { SqrtPriceMath } from './sqrtPriceMath'
import { TickMath } from './tickMath'

// https://github.com/Uniswap/v3-sdk/blob/4e16fe8e56c8c26541545f138c89133794c7ce72/src/entities/position.ts#L68-L127

/** token0 amount contributed by a liquidity delta over [tickLower, tickUpper]. */
export function getAmount0(
  tickLower: i32,
  tickUpper: i32,
  currTick: i32,
  amount: BigInt,
  currSqrtPriceX96: BigInt,
): BigInt {
  if (currTick >= tickUpper) {
    return ZERO_BI
  }
  const roundUp = amount.gt(ZERO_BI)
  const sqrtUpper = TickMath.getSqrtRatioAtTick(tickUpper)
  const sqrtLower = currTick < tickLower ? TickMath.getSqrtRatioAtTick(tickLower) : currSqrtPriceX96
  return SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, amount, roundUp)
}

/** token1 amount contributed by a liquidity delta over [tickLower, tickUpper]. */
export function getAmount1(
  tickLower: i32,
  tickUpper: i32,
  currTick: i32,
  amount: BigInt,
  currSqrtPriceX96: BigInt,
): BigInt {
  if (currTick < tickLower) {
    return ZERO_BI
  }
  const roundUp = amount.gt(ZERO_BI)
  const sqrtLower = TickMath.getSqrtRatioAtTick(tickLower)
  const sqrtUpper = currTick < tickUpper ? currSqrtPriceX96 : TickMath.getSqrtRatioAtTick(tickUpper)
  return SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, amount, roundUp)
}
