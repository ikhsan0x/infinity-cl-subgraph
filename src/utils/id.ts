import { BigInt, Bytes } from '@graphprotocol/graph-ts'

/** Position entity id — the NFT token id. */
export function positionId(tokenId: BigInt): string {
  return tokenId.toString()
}

/** Event entity id — `<txHash>-<logIndex>`. */
export function eventId(transactionHash: Bytes, logIndex: BigInt): string {
  return transactionHash.toHexString() + '-' + logIndex.toString()
}
