# Validation Standard

Zod is the foundation validation library for transport and environment validation.

Validation responsibilities are layered:

- Transport validation checks API request and response DTO shape.
- Environment validation checks process configuration before runtime use.
- Form validation improves client experience but is never authoritative.
- Domain invariants protect business rules and must not live only in UI schemas.
- Database constraints protect persistence integrity.

Zod transport schemas are not the complete domain model. A DTO may resemble a domain type, but the conversion must be intentional.

Only neutral generic schemas are included in the foundation. Business-specific product, order, inventory, payment, and customer schemas are deferred.
