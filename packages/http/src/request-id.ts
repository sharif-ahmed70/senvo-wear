import { randomUUID } from "node:crypto";

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/u;

export type RequestIdFactory = {
  create(incomingRequestId: string | null): string;
};

export class DefaultRequestIdFactory implements RequestIdFactory {
  constructor(private readonly generate: () => string = randomUUID) {}

  create(incomingRequestId: string | null): string {
    return incomingRequestId && requestIdPattern.test(incomingRequestId)
      ? incomingRequestId
      : this.generate();
  }
}
