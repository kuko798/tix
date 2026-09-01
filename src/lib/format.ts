const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyFormatterPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, precise = false): string {
  const formatter = precise ? currencyFormatterPrecise : currencyFormatter;
  return formatter.format(value);
}

export function formatSignedCurrency(value: number): string {
  const abs = formatCurrency(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const dateFormatterLong = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatGameDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatGameDateLong(iso: string): string {
  return dateFormatterLong.format(new Date(iso));
}

export function formatGameTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  const future = diffSec < 0;
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = abs;
  let unit = "second";
  for (const [size, name] of units) {
    if (value < size) {
      unit = name;
      break;
    }
    value = Math.floor(value / size);
    unit = name;
  }

  const rounded = Math.max(1, Math.round(value));
  const plural = rounded === 1 ? unit : `${unit}s`;
  return future ? `in ${rounded} ${plural}` : `${rounded} ${plural} ago`;
}

export function formatCountdown(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  if (diffMs <= 0) return "Past due";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  return `${hours}h ${minutes}m left`;
}
