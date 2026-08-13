import type { ParcelInput, ShippingLabelPurchase } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import type { ShippingProvider } from "./provider.js";
import { ShippingRepository } from "./repository.js";

export class ShippingService {
  constructor(
    private readonly repository: ShippingRepository,
    private readonly provider: ShippingProvider,
  ) {}

  async rates(sellerId: string, orderId: string, parcel: ParcelInput) {
    const order = await this.repository.eligibleOrder(orderId, sellerId);
    if (!order)
      throw new CatalogError(
        "ORDER_NOT_READY",
        409,
        "Only a paid sale can be prepared for shipping.",
      );
    if (!order.fromAddress)
      throw new CatalogError(
        "SHIP_FROM_REQUIRED",
        422,
        "Add a seller shipping address before buying a label.",
      );
    await this.repository.prepare(
      orderId,
      parcel,
      order.fromAddress,
      order.toAddress,
    );
    return this.provider.rates(parcel, order.fromAddress, order.toAddress);
  }

  async buy(sellerId: string, orderId: string, input: ShippingLabelPurchase) {
    const shipment = await this.repository.sellerShipment(orderId, sellerId);
    if (!shipment)
      throw new CatalogError("NOT_FOUND", 404, "Shipment not found.");
    const current = await this.repository.shipment(orderId, sellerId);
    if (shipment.status !== "PENDING") return current;
    const rates = await this.provider.rates(
      shipment.parcel,
      shipment.fromAddress,
      shipment.toAddress,
    );
    const rate = rates.find((candidate) => candidate.id === input.rateId);
    if (!rate)
      throw new CatalogError("INVALID_RATE", 422, "Shipping rate expired.");
    const label = await this.provider.buy(rate, input.idempotencyKey);
    await this.repository.buyLabel({
      shipmentId: shipment.id,
      rate,
      label,
      idempotencyKey: input.idempotencyKey,
      provider: this.provider.name,
    });
    return this.repository.shipment(orderId, sellerId);
  }

  shipment(userId: string, orderId: string) {
    return this.repository.shipment(orderId, userId);
  }

  webhook(payload: unknown) {
    const event = parseTrackingEvent(payload);
    return event
      ? this.repository.processTrackingEvent(event)
      : Promise.resolve();
  }
}

function parseTrackingEvent(payload: unknown) {
  const value = payload as {
    id?: string;
    description?: string;
    result?: {
      id?: string;
      tracking_code?: string;
      status?: string;
      updated_at?: string;
      status_detail?: string;
    };
  };
  if (
    value.description !== "tracker.updated" ||
    !value.id ||
    !value.result?.id ||
    !value.result.tracking_code
  )
    return null;
  const status = mapTrackingStatus(value.result.status);
  return {
    id: value.id,
    trackerId: value.result.id,
    trackingCode: value.result.tracking_code,
    status,
    occurredAt: new Date(value.result.updated_at ?? Date.now()),
    description:
      value.result.status_detail?.replaceAll("_", " ") ??
      value.result.status?.replaceAll("_", " ") ??
      "Tracking updated",
    payload,
  } as const;
}

function mapTrackingStatus(status?: string) {
  if (status === "delivered") return "DELIVERED" as const;
  if (status === "in_transit" || status === "out_for_delivery")
    return "IN_TRANSIT" as const;
  if (status === "failure" || status === "return_to_sender")
    return "EXCEPTION" as const;
  return "LABEL_PURCHASED" as const;
}
