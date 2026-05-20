import { Unsubscription as UnsubscriptionEvent } from '../types/PositionManager/PositionManager'
import { Unsubscribe } from '../types/schema'
import { loadTransaction } from '../utils/index'
import { eventId, positionId } from '../utils/id'

export function handleUnsubscription(event: UnsubscriptionEvent): void {
  handleUnsubscriptionHelper(event)
}

export function handleUnsubscriptionHelper(event: UnsubscriptionEvent): void {
  const transaction = loadTransaction(event)

  const unsubscription = new Unsubscribe(eventId(event.transaction.hash, event.logIndex))
  unsubscription.tokenId = event.params.tokenId
  unsubscription.address = event.params.subscriber.toHexString()
  unsubscription.origin = event.transaction.from.toHexString()
  unsubscription.transaction = transaction.id
  unsubscription.logIndex = event.logIndex
  unsubscription.timestamp = transaction.timestamp
  unsubscription.position = positionId(event.params.tokenId)
  unsubscription.save()
}
