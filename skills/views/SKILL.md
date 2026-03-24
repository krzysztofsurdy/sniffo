---
name: views
description: Create and manage landscape views -- query-based traces through the dependency graph starting from a root symbol. Use when the user wants to map out a flow, trace dependencies, or visualize how a feature connects.
---

# Landscape Views

Landscape views are query-based traces through the dependency graph. Instead of manually picking nodes, you define a starting point and the view automatically traces all connected symbols.

## Creating a view

1. Use `search_symbols` to find the root symbol (e.g., "PaymentController")
2. Use `create_view` with the root symbol and trace parameters

Example:
```
create_view({
  name: "Payment Flow",
  rootSymbol: "PaymentController",
  edgeTypes: ["CALLS", "INJECTS"],
  depth: 4,
  direction: "outgoing"
})
```

This traces outgoing CALLS and INJECTS from PaymentController up to 4 levels deep.

## Direction options

- **outgoing**: "What does this call?" -- traces forward through the flow
- **incoming**: "What calls this?" -- traces backwards to find dependents
- **both**: Full neighborhood in both directions

## Common patterns

| View | Root | Direction | Edge Types | Depth |
|------|------|-----------|------------|-------|
| Feature flow | Controller | outgoing | CALLS, INJECTS | 4 |
| Impact analysis | Service | incoming | CALLS, DEPENDS_ON | 3 |
| Inheritance tree | Interface | incoming | IMPLEMENTS, EXTENDS | 5 |
| Full context | Any class | both | CALLS, INJECTS, IMPORTS | 2 |

## Listing and deleting views

- `list_views` -- shows all saved views with their query parameters
- `delete_view` -- removes a view by ID

## Tips

- Start with depth 3 and increase if the trace looks incomplete
- Use "outgoing" for "how does this work?" questions
- Use "incoming" for "what breaks if I change this?" questions
- Views are stored in `.sniffo/views.json` and visible in the web UI
