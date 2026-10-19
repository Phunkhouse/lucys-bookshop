import {
  newOrderMessage,
  reservationReminderMessage,
  type ExpiringOrder,
  type NotifiableOrder,
} from './notification-messages'
import type { SellerNotifier } from './notifier'

// Writes the message to the log instead of sending it.
export class ConsoleNotifier implements SellerNotifier {
  async notifyNewOrder(order: NotifiableOrder): Promise<void> {
    const { subject, text } = newOrderMessage(order)
    console.info(`[seller notification] ${subject}\n${text}`)
  }

  async notifyReservationExpiring(orders: ExpiringOrder[]): Promise<void> {
    const { subject, text } = reservationReminderMessage(orders)
    console.info(`[seller notification] ${subject}\n${text}`)
  }
}
