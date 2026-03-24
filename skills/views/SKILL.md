---
name: views
description: Create and manage saved views -- curated collections of related symbols representing business flows, features, or architectural slices. Use when the user wants to map out a flow, save a set of related classes, or revisit a previously saved view.
---

# Saved Views

Saved views are curated collections of symbols that represent a business flow, feature, or architectural concern (e.g., "Payment Flow", "Coupon Logic", "Auth System").

## Creating a view

1. Use `list_views` to see existing views
2. Ask the user what flow or feature they want to map
3. Use `search_symbols` to find relevant classes, interfaces, and functions
4. Use `create_view` with the view name and the symbol names to save it

Example:
```
create_view({
  name: "Payment Flow",
  symbols: ["PaymentController", "PaymentService", "StripeGateway", "Invoice", "PaymentEvent"]
})
```

The tool will search for each symbol and collect all matches into the view.

## Listing views

Use `list_views` to show all saved views with their node counts.

## Deleting a view

Use `delete_view` with the view ID (shown in `list_views` output).

## Tips

- Be thorough when searching -- include controllers, services, repositories, events, and DTOs
- Ask the user if they want to include related interfaces or abstract classes
- Views are stored in `.sniffo/views.json` and visible in the web UI
