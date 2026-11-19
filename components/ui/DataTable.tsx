import * as React from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Table chrome as this site's result tables draw it: a Card that clips the
 *  table, gray-100 header band, hairline rows, hover tint. The cells stay plain
 *  <th>/<td> so any table can adopt it without changing its data shape. */
export function DataTable({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "overflow-x-auto rounded-card border border-gray-200 bg-white shadow-sm",
        className
      )}
    >
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </thead>
  );
}

export function Th({
  className,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cx("px-3 py-2 font-semibold", className)} {...rest}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}

export function Tr({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx("transition-colors hover:bg-gray-50", className)} {...rest}>
      {children}
    </tr>
  );
}

export function Td({
  className,
  children,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("px-3 py-2 align-top text-ink", className)} {...rest}>
      {children}
    </td>
  );
}

/** One full-width row for "nothing here yet". */
export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-gray-400">
        {children}
      </td>
    </tr>
  );
}
