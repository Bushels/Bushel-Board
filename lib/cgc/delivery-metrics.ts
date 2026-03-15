export const COUNTRY_PRIMARY_DELIVERY_REGIONS = [
  "Alberta",
  "Saskatchewan",
  "Manitoba",
  "British Columbia",
] as const;

export const PRODUCER_CAR_DELIVERY_REGIONS = [
  "Alberta",
  "Saskatchewan",
  "Manitoba",
] as const;

export interface DeliveryObservationLike {
  worksheet: string;
  metric: string;
  region: string;
  grade?: string | null | undefined;
  ktonnes: number | null | undefined;
}

export function isCountryProducerDeliveryObservation(
  row: DeliveryObservationLike
): boolean {
  if (row.worksheet === "Primary" && row.metric === "Deliveries") {
    return (
      (row.grade ?? "") === "" &&
      COUNTRY_PRIMARY_DELIVERY_REGIONS.includes(
      row.region as (typeof COUNTRY_PRIMARY_DELIVERY_REGIONS)[number]
      )
    );
  }

  if (
    row.worksheet === "Process" &&
    row.metric === "Producer Deliveries" &&
    (row.grade ?? "") === "" &&
    row.region === ""
  ) {
    return true;
  }

  if (row.worksheet === "Producer Cars" && row.metric === "Shipments") {
    return (
      (row.grade ?? "") === "" &&
      PRODUCER_CAR_DELIVERY_REGIONS.includes(
      row.region as (typeof PRODUCER_CAR_DELIVERY_REGIONS)[number]
      )
    );
  }

  return false;
}

export function sumCountryProducerDeliveries(
  rows: DeliveryObservationLike[]
): number {
  return rows.reduce((sum, row) => {
    if (!isCountryProducerDeliveryObservation(row)) {
      return sum;
    }

    return sum + Number(row.ktonnes ?? 0);
  }, 0);
}
