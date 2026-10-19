import type { NotifiableOrder } from './notification-messages'
import type { SellerNotifier } from './notifier'

// A notifier for tests: remembers what it was asked to send, and can be made
// to fail for everything or for some order numbers.
export class FakeNotifier implements SellerNotifier {
  readonly orders: NotifiableOrder[] = []
  failAll = false
  readonly failFor = new Set<number>()

  async notifyNewOrder(order: NotifiableOrder): Promise<void> {
    if (this.failAll || this.failFor.has(order.number)) {
      throw new Error('The provider is down')
    }
    this.orders.push(order)
  }
}
