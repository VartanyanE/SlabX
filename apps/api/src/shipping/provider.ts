import type { ParcelInput, ShippingRate } from "@slabx/contracts";

export type ShippingAddress = {
  recipientName: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
};
export type PurchasedLabel = {
  providerShipmentId: string;
  providerTrackerId: string;
  carrier: string;
  service: string;
  trackingCode: string;
  trackingUrl: string;
  labelUrl: string;
  postageMinor: number;
  estimatedDays: number;
};
export interface ShippingProvider {
  readonly name: "mock" | "easypost";
  rates(
    parcel: ParcelInput,
    fromAddress?: ShippingAddress,
    toAddress?: ShippingAddress,
  ): Promise<ShippingRate[]>;
  buy(rate: ShippingRate, idempotencyKey: string): Promise<PurchasedLabel>;
}

export class MockShippingProvider implements ShippingProvider {
  readonly name = "mock" as const;
  async rates(parcel: ParcelInput): Promise<ShippingRate[]> {
    const surcharge = Math.max(0, Math.ceil(parcel.weightOunces - 8) * 4);
    return [
      {
        id: "mock-usps-ground",
        carrier: "USPS",
        service: "Ground Advantage",
        amountMinor: 499 + surcharge,
        currency: "USD",
        estimatedDays: 5,
      },
      {
        id: "mock-usps-priority",
        carrier: "USPS",
        service: "Priority Mail",
        amountMinor: 899 + surcharge,
        currency: "USD",
        estimatedDays: 3,
      },
    ];
  }
  async buy(
    rate: ShippingRate,
    idempotencyKey: string,
  ): Promise<PurchasedLabel> {
    const token = idempotencyKey.replaceAll("-", "").slice(0, 12).toUpperCase();
    return {
      providerShipmentId: `shp_mock_${token}`,
      providerTrackerId: `trk_mock_${token}`,
      carrier: rate.carrier,
      service: rate.service,
      trackingCode: `9400${token}`,
      trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=9400${token}`,
      labelUrl: `/api/v1/shipments/${token}/label`,
      postageMinor: rate.amountMinor,
      estimatedDays: rate.estimatedDays,
    };
  }
}

type EpRate = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days: number | null;
};
type EpShipment = {
  id: string;
  rates: EpRate[];
  selected_rate?: EpRate;
  tracking_code?: string;
  tracker?: { id: string; public_url: string };
  postage_label?: { label_url: string };
};

export class EasyPostShippingProvider implements ShippingProvider {
  readonly name = "easypost" as const;
  constructor(private readonly apiKey: string) {}

  async rates(
    parcel: ParcelInput,
    fromAddress?: ShippingAddress,
    toAddress?: ShippingAddress,
  ): Promise<ShippingRate[]> {
    if (!fromAddress || !toAddress)
      throw new Error("Shipping addresses are required.");
    const shipment = await this.request<EpShipment>("/shipments", {
      method: "POST",
      body: JSON.stringify({
        shipment: {
          from_address: epAddress(fromAddress),
          to_address: epAddress(toAddress),
          parcel: {
            length: parcel.lengthInches,
            width: parcel.widthInches,
            height: parcel.heightInches,
            weight: parcel.weightOunces,
          },
        },
      }),
    });
    return shipment.rates.map((rate) => ({
      id: `${shipment.id}:${rate.id}`,
      carrier: rate.carrier,
      service: rate.service,
      amountMinor: Math.round(Number(rate.rate) * 100),
      currency: "USD",
      estimatedDays: rate.delivery_days ?? 7,
    }));
  }

  async buy(
    rate: ShippingRate,
    idempotencyKey: string,
  ): Promise<PurchasedLabel> {
    const [shipmentId, rateId] = rate.id.split(":");
    if (!shipmentId || !rateId) throw new Error("Invalid EasyPost rate.");
    const shipment = await this.request<EpShipment>(
      `/shipments/${shipmentId}/buy`,
      {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ rate: { id: rateId } }),
      },
    );
    const selected = shipment.selected_rate;
    return {
      providerShipmentId: shipment.id,
      providerTrackerId: shipment.tracker?.id ?? `tracker:${shipment.id}`,
      carrier: selected?.carrier ?? rate.carrier,
      service: selected?.service ?? rate.service,
      trackingCode: shipment.tracking_code ?? "pending",
      trackingUrl: shipment.tracker?.public_url ?? "https://track.easypost.com",
      labelUrl: shipment.postage_label?.label_url ?? "",
      postageMinor: Math.round(
        Number(selected?.rate ?? rate.amountMinor / 100) * 100,
      ),
      estimatedDays: selected?.delivery_days ?? rate.estimatedDays,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`https://api.easypost.com/v2${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const payload = (await response.json()) as T & {
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(payload.error?.message ?? "EasyPost request failed.");
    return payload;
  }
}

function epAddress(value: ShippingAddress) {
  return {
    name: value.recipientName,
    street1: value.line1,
    street2: value.line2 ?? undefined,
    city: value.city,
    state: value.region,
    zip: value.postalCode,
    country: value.countryCode,
  };
}
