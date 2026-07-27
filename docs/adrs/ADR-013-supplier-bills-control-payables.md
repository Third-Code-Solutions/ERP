# ADR-013: Supplier bills control payable posting

- Status: Accepted
- Date: 2026-07-27

A Purchase Order records a commitment, not a liability. A Supplier Bill becomes
an Accounts Payable balance only when Finance posts it through one database
transaction.

The transaction locks the bill and Purchase Order; validates tenant, Vendor,
project, duplicate Vendor bill number, approved PO state, cumulative billed
subtotal, open fiscal period, allocations, and mapped control accounts; posts
expense or asset debits plus Input VAT; credits Accounts Payable and Withholding
Tax Payable; numbers the bill; and freezes its terms.

Corrections use a bill-owned linked reversal. Direct reversal of its journal is
rejected so bill state and ledger state cannot diverge. Payment will be a
separate allocation workflow and never a manual status change.

This foundation is a Purchase Order-to-bill document match. Full three-way
matching additionally requires accepted receipt quantities and values; that
evidence belongs to the inventory/warehouse slice and must not be inferred
from Purchase Order status alone.
