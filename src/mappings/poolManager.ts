import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts'

import { Initialize as InitializeEvent } from '../types/PoolManager/PoolManager'
import { Bundle, Pool, PoolManager, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ADDRESS_ZERO, ONE_BI, ZERO_BD, ZERO_BI } from '../utils/constants'
import { updatePoolDayData, updatePoolHourData } from '../utils/intervalUpdates'
import { NativeTokenDetails } from '../utils/nativeTokenDetails'
import { findNativePerToken, getNativePriceInUSD, sqrtPriceX96ToTokenPrices } from '../utils/pricing'
import { StaticTokenDefinition } from '../utils/staticTokenDefinition'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'

// Subgraph handlers must have this exact signature; the helper exists so unit
// tests can inject a SubgraphConfig instead of relying on dataSource.network().
export function handleInitialize(event: InitializeEvent): void {
  handleInitializeHelper(event)
}

export function handleInitializeHelper(event: InitializeEvent, subgraphConfig: SubgraphConfig = getSubgraphConfig()): void {
  const poolId = event.params.id.toHexString()
  if (subgraphConfig.poolsToSkip.includes(poolId)) {
    return
  }

  // load or create the pool manager (and its price bundle)
  let poolManager = PoolManager.load(subgraphConfig.poolManagerAddress)
  if (poolManager === null) {
    poolManager = new PoolManager(subgraphConfig.poolManagerAddress)
    poolManager.poolCount = ZERO_BI
    poolManager.totalVolumeETH = ZERO_BD
    poolManager.totalVolumeUSD = ZERO_BD
    poolManager.untrackedVolumeUSD = ZERO_BD
    poolManager.totalFeesUSD = ZERO_BD
    poolManager.totalFeesETH = ZERO_BD
    poolManager.totalValueLockedETH = ZERO_BD
    poolManager.totalValueLockedUSD = ZERO_BD
    poolManager.totalValueLockedUSDUntracked = ZERO_BD
    poolManager.totalValueLockedETHUntracked = ZERO_BD
    poolManager.txCount = ZERO_BI
    poolManager.owner = ADDRESS_ZERO

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = ZERO_BD
    bundle.save()
  }
  poolManager.poolCount = poolManager.poolCount.plus(ONE_BI)

  // load or create both tokens; bail if a token's decimals are undiscoverable
  const token0 = loadOrCreateToken(event.params.currency0, subgraphConfig)
  if (token0 === null) {
    log.debug('handleInitialize: skipping pool {} — token0 decimals were null', [poolId])
    return
  }
  const token1 = loadOrCreateToken(event.params.currency1, subgraphConfig)
  if (token1 === null) {
    log.debug('handleInitialize: skipping pool {} — token1 decimals were null', [poolId])
    return
  }

  const pool = new Pool(poolId)

  // whitelist this pool on the token paired with a whitelisted token
  if (subgraphConfig.whitelistTokens.includes(token0.id)) {
    token1.whitelistPools = token1.whitelistPools.concat([pool.id])
  }
  if (subgraphConfig.whitelistTokens.includes(token1.id)) {
    token0.whitelistPools = token0.whitelistPools.concat([pool.id])
  }

  pool.token0 = token0.id
  pool.token1 = token1.id
  pool.feeTier = BigInt.fromI32(event.params.fee)
  pool.hooks = event.params.hooks.toHexString()
  pool.parameters = event.params.parameters
  pool.hooksRegistration = Bytes.fromUint8Array(pool.parameters.slice(30, 32))

  // tick spacing lives in parameter bytes [27, 30) and is little-endian
  const tickSpacingBytes = pool.parameters.slice(27, 30)
  tickSpacingBytes.reverse()
  pool.tickSpacing = BigInt.fromByteArray(Bytes.fromUint8Array(tickSpacingBytes))

  pool.createdAtTimestamp = event.block.timestamp
  pool.createdAtBlockNumber = event.block.number
  pool.liquidityProviderCount = ZERO_BI
  pool.txCount = ZERO_BI
  pool.liquidity = ZERO_BI
  pool.observationIndex = ZERO_BI
  pool.token0Price = ZERO_BD
  pool.token1Price = ZERO_BD
  pool.totalValueLockedToken0 = ZERO_BD
  pool.totalValueLockedToken1 = ZERO_BD
  pool.totalValueLockedUSD = ZERO_BD
  pool.totalValueLockedETH = ZERO_BD
  pool.totalValueLockedUSDUntracked = ZERO_BD
  pool.volumeToken0 = ZERO_BD
  pool.volumeToken1 = ZERO_BD
  pool.volumeUSD = ZERO_BD
  pool.feesUSD = ZERO_BD
  pool.untrackedVolumeUSD = ZERO_BD
  pool.collectedFeesToken0 = ZERO_BD
  pool.collectedFeesToken1 = ZERO_BD
  pool.collectedFeesUSD = ZERO_BD

  pool.sqrtPrice = event.params.sqrtPriceX96
  pool.tick = BigInt.fromI32(event.params.tick)

  const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0, token1, subgraphConfig.nativeTokenDetails)
  pool.token0Price = prices[0]
  pool.token1Price = prices[1]

  pool.save()
  token0.save()
  token1.save()
  poolManager.save()

  // refresh prices now that the new pool exists
  const bundle = Bundle.load('1')!
  bundle.ethPriceUSD = getNativePriceInUSD(subgraphConfig.stablecoinWrappedNativePoolId, subgraphConfig.stablecoinIsToken0)
  bundle.save()

  updatePoolDayData(poolId, event)
  updatePoolHourData(poolId, event)

  token0.derivedETH = findNativePerToken(
    token0,
    subgraphConfig.wrappedNativeAddress,
    subgraphConfig.stablecoinAddresses,
    subgraphConfig.minimumNativeLocked,
  )
  token1.derivedETH = findNativePerToken(
    token1,
    subgraphConfig.wrappedNativeAddress,
    subgraphConfig.stablecoinAddresses,
    subgraphConfig.minimumNativeLocked,
  )
  token0.save()
  token1.save()
}

/** Load an existing Token, or create and fully initialize a new one. Returns null if decimals can't be resolved. */
function loadOrCreateToken(address: Address, config: SubgraphConfig): Token | null {
  const id = address.toHexString()
  const existing = Token.load(id)
  if (existing !== null) {
    return existing
  }
  return createToken(id, address, config.tokenOverrides, config.nativeTokenDetails)
}

function createToken(
  id: string,
  address: Address,
  tokenOverrides: StaticTokenDefinition[],
  nativeTokenDetails: NativeTokenDetails,
): Token | null {
  const decimals = fetchTokenDecimals(address, tokenOverrides, nativeTokenDetails)
  if (decimals === null) {
    return null
  }
  const token = new Token(id)
  token.symbol = fetchTokenSymbol(address, tokenOverrides, nativeTokenDetails)
  token.name = fetchTokenName(address, tokenOverrides, nativeTokenDetails)
  token.totalSupply = fetchTokenTotalSupply(address)
  token.decimals = decimals
  token.derivedETH = ZERO_BD
  token.volume = ZERO_BD
  token.volumeUSD = ZERO_BD
  token.untrackedVolumeUSD = ZERO_BD
  token.feesUSD = ZERO_BD
  token.totalValueLocked = ZERO_BD
  token.totalValueLockedUSD = ZERO_BD
  token.totalValueLockedUSDUntracked = ZERO_BD
  token.txCount = ZERO_BI
  token.poolCount = ZERO_BI
  token.whitelistPools = []
  return token
}
