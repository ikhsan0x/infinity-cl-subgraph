import { Address, BigInt } from '@graphprotocol/graph-ts'

/** Hardcoded token metadata used to override unreliable on-chain RPC calls. */
export class StaticTokenDefinition {
  address: Address
  symbol: string
  name: string
  decimals: BigInt
}

/** Look up a static definition by address, or return null if none is registered. */
export function getStaticDefinition(
  tokenAddress: Address,
  staticDefinitions: StaticTokenDefinition[],
): StaticTokenDefinition | null {
  for (let i = 0; i < staticDefinitions.length; i++) {
    if (staticDefinitions[i].address.equals(tokenAddress)) {
      return staticDefinitions[i]
    }
  }
  return null
}
