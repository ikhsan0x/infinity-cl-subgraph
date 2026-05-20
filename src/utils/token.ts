import { Address, BigInt } from '@graphprotocol/graph-ts'

import { ERC20 } from '../types/PoolManager/ERC20'
import { ERC20NameBytes } from '../types/PoolManager/ERC20NameBytes'
import { ERC20SymbolBytes } from '../types/PoolManager/ERC20SymbolBytes'
import { ADDRESS_ZERO, ZERO_BI } from './constants'
import { isNullEthValue } from './index'
import { NativeTokenDetails } from './nativeTokenDetails'
import { getStaticDefinition, StaticTokenDefinition } from './staticTokenDefinition'

const NATIVE_ADDRESS = Address.fromString(ADDRESS_ZERO)

export function fetchTokenSymbol(
  tokenAddress: Address,
  tokenOverrides: StaticTokenDefinition[],
  nativeTokenDetails: NativeTokenDetails,
): string {
  if (tokenAddress.equals(NATIVE_ADDRESS)) {
    return nativeTokenDetails.symbol
  }
  const staticDefinition = getStaticDefinition(tokenAddress, tokenOverrides)
  if (staticDefinition !== null) {
    return staticDefinition.symbol
  }

  // try the string `symbol()`, then fall back to the bytes32 variant
  const symbolResult = ERC20.bind(tokenAddress).try_symbol()
  if (!symbolResult.reverted) {
    return symbolResult.value
  }
  const symbolBytes = ERC20SymbolBytes.bind(tokenAddress).try_symbol()
  if (!symbolBytes.reverted && !isNullEthValue(symbolBytes.value.toHexString())) {
    return symbolBytes.value.toString()
  }
  return 'unknown'
}

export function fetchTokenName(
  tokenAddress: Address,
  tokenOverrides: StaticTokenDefinition[],
  nativeTokenDetails: NativeTokenDetails,
): string {
  if (tokenAddress.equals(NATIVE_ADDRESS)) {
    return nativeTokenDetails.name
  }
  const staticDefinition = getStaticDefinition(tokenAddress, tokenOverrides)
  if (staticDefinition !== null) {
    return staticDefinition.name
  }

  // try the string `name()`, then fall back to the bytes32 variant
  const nameResult = ERC20.bind(tokenAddress).try_name()
  if (!nameResult.reverted) {
    return nameResult.value
  }
  const nameBytes = ERC20NameBytes.bind(tokenAddress).try_name()
  if (!nameBytes.reverted && !isNullEthValue(nameBytes.value.toHexString())) {
    return nameBytes.value.toString()
  }
  return 'unknown'
}

export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {
  if (tokenAddress.equals(NATIVE_ADDRESS)) {
    return ZERO_BI
  }
  const result = ERC20.bind(tokenAddress).try_totalSupply()
  return result.reverted ? ZERO_BI : result.value
}

export function fetchTokenDecimals(
  tokenAddress: Address,
  tokenOverrides: StaticTokenDefinition[],
  nativeTokenDetails: NativeTokenDetails,
): BigInt | null {
  if (tokenAddress.equals(NATIVE_ADDRESS)) {
    return nativeTokenDetails.decimals
  }
  const staticDefinition = getStaticDefinition(tokenAddress, tokenOverrides)
  if (staticDefinition !== null) {
    return staticDefinition.decimals
  }

  const result = ERC20.bind(tokenAddress).try_decimals()
  if (!result.reverted && result.value.lt(BigInt.fromI32(255))) {
    return result.value
  }
  return null
}
