export type DateRange = {
  from: string;
  to: string;
};

export function readDateRange(searchParams: URLSearchParams): DateRange | undefined {
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (from === null && to === null) {
    return undefined;
  }
  if (!from || !to) {
    throw new RangeError("from and to must be provided together");
  }

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime >= toTime) {
    throw new RangeError("Invalid date range");
  }

  return {
    from: new Date(fromTime).toISOString(),
    to: new Date(toTime).toISOString(),
  };
}

export function localDateRange(fromDate: string, toDate: string): DateRange {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  to.setDate(to.getDate() + 1);

  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from.getTime() >= to.getTime()
  ) {
    throw new RangeError("Invalid date range");
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export function toDateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateRangeErrorResponse(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Invalid date range" },
    { status: 400 },
  );
}
