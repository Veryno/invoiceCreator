import { CaretRight } from "@phosphor-icons/react";
import { MoneyStack } from "./WorkspaceUI.jsx";
import { formatWorkspaceDate } from "./workspaceData.js";

export function CustomerDirectory({ customers, stats, selectedCustomerId, onSelectCustomer }) {
  return (
    <div className="studio-table-scroll" role="region" aria-label="Customer directory table" tabIndex="0">
      <table className="studio-table studio-customer-table">
        <caption className="studio-visually-hidden">Customer directory</caption>
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Contact</th>
            <th scope="col" className="studio-table-number">Invoices</th>
            <th scope="col" className="studio-table-number">Outstanding</th>
            <th scope="col">Last activity</th>
            <th scope="col"><span className="studio-visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => {
            const customerStats = stats.get(customer.id);
            const selected = selectedCustomerId === customer.id;
            return (
              <tr className={selected ? "is-selected" : ""} key={customer.id}>
                <td>
                  <strong>{customer.name || "Unnamed customer"}</strong>
                  {customer.address ? <small>{customer.address.split("\n")[0]}</small> : null}
                </td>
                <td>
                  <span className="studio-customer-contact">
                    {customer.email ? <span>{customer.email}</span> : null}
                    {customer.phone ? <small>{customer.phone}</small> : null}
                    {!customer.email && !customer.phone ? <span className="studio-muted-value">Not provided</span> : null}
                  </span>
                </td>
                <td className="studio-table-number">{customerStats?.invoiceCount || 0}</td>
                <td className="studio-table-number">
                  <MoneyStack amounts={customerStats?.balances} />
                </td>
                <td>{formatWorkspaceDate(customerStats?.latestActivity)}</td>
                <td className="studio-table-action">
                  <button
                    className="studio-view-button"
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelectCustomer?.(customer.id)}
                  >
                    View
                    <span className="studio-visually-hidden"> {customer.name || "customer"}</span>
                    <CaretRight size={15} weight="bold" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
