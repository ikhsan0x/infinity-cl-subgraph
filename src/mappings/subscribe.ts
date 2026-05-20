import { Subscription as SubscriptionEvent } from '../types/PositionManager/PositionManager'
import { Subscribe } from '../types/schema'
import { loadTransaction } from '../utils/index'
import { eventId, positionId } from '../utils/id'

export function handleSubscription(event: SubscriptionEvent): void {
  handleSubscriptionHelper(event)
}

export function handleSubscriptionHelper(event: SubscriptionEvent): void {
  const transaction = loadTransaction(event)

  const subscription = new Subscribe(eventId(event.transaction.hash, event.logIndex))
  subscription.tokenId = event.params.tokenId
  subscription.address = event.params.subscriber.toHexString()
  subscription.origin = event.transaction.from.toHexString()
  subscription.transaction = transaction.id
  subscription.logIndex = event.logIndex
  subscription.timestamp = transaction.timestamp
  subscription.position = positionId(event.params.tokenId)
  subscription.save()
}
