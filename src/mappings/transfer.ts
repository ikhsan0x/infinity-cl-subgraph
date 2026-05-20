import { Transfer as TransferEvent } from '../types/PositionManager/PositionManager'
import { Position, Transfer } from '../types/schema'
import { loadTransaction } from '../utils/index'
import { eventId, positionId } from '../utils/id'

export function handleTransfer(event: TransferEvent): void {
  handleTransferHelper(event)
}

export function handleTransferHelper(event: TransferEvent): void {
  const id = positionId(event.params.id)

  // a Transfer can be the position's mint, so create the Position on first sight
  let position = Position.load(id)
  if (position === null) {
    position = new Position(id)
    position.tokenId = event.params.id
    position.origin = event.transaction.from.toHexString()
    position.createdAtTimestamp = event.block.timestamp
  }
  position.owner = event.params.to.toHexString()

  const transaction = loadTransaction(event)

  const transfer = new Transfer(eventId(event.transaction.hash, event.logIndex))
  transfer.tokenId = event.params.id
  transfer.from = event.params.from.toHexString()
  transfer.to = event.params.to.toHexString()
  transfer.origin = event.transaction.from.toHexString()
  transfer.transaction = transaction.id
  transfer.logIndex = event.logIndex
  transfer.timestamp = transaction.timestamp
  transfer.position = position.id

  position.save()
  transfer.save()
}
