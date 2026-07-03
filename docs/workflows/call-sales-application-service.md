# Call Sales Application Service

1. Build a trusted execution context from the server adapter boundary.
2. Do not copy `organizationId` from the client payload.
3. Pass the context and raw payload to the sales application service.
4. Handle `{ ok: true, data }` as the successful response.
5. Handle `{ ok: false, error }` by mapping the service error code to the adapter response.

```ts
const services = createApplicationServices();

const result = await services.sales.createOrder(context, payload);
```

The service validates payload shape, injects organization identity, calls the sales domain use case, and maps output to a service contract.
