import { BigInt } from '@graphprotocol/graph-ts'

/** Symbol / name / decimals of a chain's native token. */
export class NativeTokenDetails {
  symbol: string
  name: string
  decimals: BigInt
}
